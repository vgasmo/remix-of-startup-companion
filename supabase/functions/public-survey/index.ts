/**
 * public-survey
 *
 * Public, token-gated access to a single survey instance, for startups that
 * never registered on the platform. The link carries an unguessable UUID
 * (survey_instances.public_token); anonymous table access stays denied and
 * every read/write here is validated against the token, the campaign window
 * and the instance status.
 *
 * GET  ?token=            -> survey payload (questions, auto-fill, answers)
 * POST { token, responses, submit } -> save answers / submit
 *
 * On submit the canonical write-back runs through apply-survey-responses with
 * the internal cron secret, exactly like the in-app flow.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { validateUUID } from '../_shared/validation.ts';

const MAX_TEXT_LEN = 4000;
const MAX_OPTIONS = 100;

interface SurveyQuestion {
  id: string;
  section: string;
  question: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'rating' | 'textarea';
  options?: string[];
  required?: boolean;
  autoFillKey?: string;
  min?: number;
  max?: number;
}

interface IncomingResponse {
  question_id: string;
  response_value?: string;
  response_json?: unknown;
  is_auto_filled?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');
    const supabase = createClient(supabaseUrl, serviceKey);

    const loadInstance = async (token: string) => {
      const { data, error } = await supabase
        .from('survey_instances')
        .select(`
          id, status, auto_filled_data,
          campaign:survey_campaigns(
            name, status, ends_at,
            survey_definition:survey_definitions(name, description, questions_json)
          ),
          workspace:workspaces(startups(name))
        `)
        .eq('public_token', token)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') ?? '';
      const tokenResult = validateUUID(token, 'token');
      if (!tokenResult.valid) return json({ error: 'invalid_token' }, 400);

      const instance = await loadInstance(tokenResult.value!);
      if (!instance) return json({ error: 'not_found' }, 404);

      const campaign = instance.campaign as unknown as {
        name: string;
        status: string;
        ends_at: string | null;
        survey_definition: {
          name: string;
          description: string | null;
          questions_json: SurveyQuestion[];
        } | null;
      } | null;

      if (!campaign || campaign.status !== 'active') {
        return json({ error: 'survey_closed' }, 410);
      }
      if (campaign.ends_at && new Date(campaign.ends_at).getTime() < Date.now()) {
        return json({ error: 'survey_closed' }, 410);
      }

      const { data: responses, error: responsesError } = await supabase
        .from('survey_responses')
        .select('question_id, response_value, response_json, is_auto_filled')
        .eq('instance_id', instance.id);
      if (responsesError) throw responsesError;

      return json({
        status: instance.status,
        campaignName: campaign.name,
        endsAt: campaign.ends_at,
        surveyName: campaign.survey_definition?.name ?? campaign.name,
        surveyDescription: campaign.survey_definition?.description ?? null,
        questions: campaign.survey_definition?.questions_json ?? [],
        autoFill: instance.auto_filled_data ?? {},
        startupName: (instance.workspace as { startups?: { name?: string } | null } | null)
          ?.startups?.name ?? null,
        responses: responses ?? [],
      });
    }

    if (req.method === 'POST') {
      const body = (await req.json()) as {
        token?: string;
        responses?: IncomingResponse[];
        submit?: boolean;
      };
      const tokenResult = validateUUID(body?.token ?? '', 'token');
      if (!tokenResult.valid) return json({ error: 'invalid_token' }, 400);

      const instance = await loadInstance(tokenResult.value!);
      if (!instance) return json({ error: 'not_found' }, 404);
      if (instance.status === 'submitted') return json({ error: 'already_submitted' }, 409);

      const campaign = instance.campaign as unknown as {
        name: string;
        status: string;
        ends_at: string | null;
        survey_definition: { questions_json: SurveyQuestion[] } | null;
      } | null;

      if (!campaign || campaign.status !== 'active') {
        return json({ error: 'survey_closed' }, 410);
      }
      if (campaign.ends_at && new Date(campaign.ends_at).getTime() < Date.now()) {
        return json({ error: 'survey_closed' }, 410);
      }

      const questions = campaign.survey_definition?.questions_json ?? [];
      const questionById = new Map(questions.map((q) => [q.id, q]));
      const incoming = Array.isArray(body.responses) ? body.responses.slice(0, 500) : [];

      // Keep only known questions, coerce shapes, and cap sizes.
      const rows = [];
      for (const r of incoming) {
        const question = r?.question_id ? questionById.get(r.question_id) : undefined;
        if (!question) continue;
        if (question.type === 'multiselect') {
          const values = Array.isArray(r.response_json) ? r.response_json.slice(0, MAX_OPTIONS) : [];
          rows.push({
            instance_id: instance.id,
            question_id: question.id,
            response_value: null,
            response_json: values.map((v) => String(v).slice(0, 500)),
            is_auto_filled: r.is_auto_filled === true,
          });
        } else {
          const value = (r.response_value ?? '').toString().slice(0, MAX_TEXT_LEN);
          rows.push({
            instance_id: instance.id,
            question_id: question.id,
            response_value: value,
            response_json: null,
            is_auto_filled: r.is_auto_filled === true,
          });
        }
      }

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from('survey_responses')
          .upsert(rows, { onConflict: 'instance_id,question_id' });
        if (upsertError) throw upsertError;
      }

      const submit = body.submit === true;
      if (submit) {
        // Required questions must all be answered before we accept the submit.
        const answered = new Map<string, { response_value?: string | null; response_json?: unknown }>();
        for (const r of rows) answered.set(r.question_id, r);
        const { data: existing } = await supabase
          .from('survey_responses')
          .select('question_id, response_value, response_json')
          .eq('instance_id', instance.id);
        for (const e of existing ?? []) answered.set(e.question_id, e);

        const missing = questions
          .filter((q) => q.required)
          .filter((q) => {
            const r = answered.get(q.id);
            if (!r) return true;
            if (Array.isArray(r.response_json)) return r.response_json.length === 0;
            return !r.response_value;
          });
        if (missing.length > 0) {
          return json({ error: 'required_missing', missing: missing.map((q) => q.id) }, 400);
        }
      }

      const { error: updateError } = await supabase
        .from('survey_instances')
        .update({
          status: submit ? 'submitted' : 'in_progress',
          ...(submit ? { submitted_at: new Date().toISOString(), submitted_by: null } : {}),
        })
        .eq('id', instance.id);
      if (updateError) throw updateError;

      if (submit && cronSecret) {
        // Same write-back the in-app flow triggers; failure here must not undo
        // the submission, so we log and continue.
        const applyRes = await fetch(`${supabaseUrl}/functions/v1/apply-survey-responses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
          body: JSON.stringify({ instance_id: instance.id }),
        });
        if (!applyRes.ok) {
          console.error(`[public-survey] write-back failed [${applyRes.status}]: ${await applyRes.text()}`);
        }
      }

      return json({ ok: true, status: submit ? 'submitted' : 'in_progress' });
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (err) {
    console.error('[public-survey] error', err);
    return json({ error: 'internal_error' }, 500);
  }
});
