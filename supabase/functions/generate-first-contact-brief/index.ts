// generate-first-contact-brief
// Staff-only. Assembles a source-tagged brief for a funnel_item using the
// booking form, prior communications, and cached pitch-deck analysis, then
// asks Lovable AI Gateway (Gemini flash) to synthesise it. Never mutates
// stage/tier/owner — only writes funnel_items.metadata_json.ai_brief.
//
// Fail-closed: if the model call fails (429/402/timeout), returns the
// deterministic scaffold with confidence='low' and evidence intact — never
// simulates success by writing a made-up brief.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface Body { funnel_item_id: string }

const MODEL = 'google/gemini-3-flash-preview';
const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

function buildScaffold(input: {
  item: any;
  bookingForm: any;
  pitchAnalysis: any;
  comms: any[];
  uid: string;
}) {
  const { item, bookingForm, pitchAnalysis, comms, uid } = input;

  const evidence: Array<{ source: string; value: unknown }> = [];
  if (bookingForm) evidence.push({ source: 'booking_form', value: bookingForm });
  if (pitchAnalysis) evidence.push({ source: 'pitch_deck', value: pitchAnalysis });
  if (comms && comms.length) evidence.push({ source: 'communication_log', value: comms });

  const factual: string[] = [];
  if (item.organization_name) factual.push(`Organização: ${item.organization_name} [source: funnel_items]`);
  if (item.contact_name) factual.push(`Contacto: ${item.contact_name} [source: funnel_items]`);
  if (item.contact_email) factual.push(`Email: ${item.contact_email} [source: funnel_items]`);
  if (bookingForm?.stage) factual.push(`Fase declarada: ${bookingForm.stage} [source: booking_form]`);
  if (bookingForm?.what_you_need) factual.push(`Necessidade: ${bookingForm.what_you_need} [source: booking_form]`);

  const missing: string[] = [];
  if (!bookingForm?.website) missing.push('Website não indicado [source: booking_form]');
  if (!item.phone) missing.push('Telefone em falta [source: funnel_items]');
  if (!pitchAnalysis) missing.push('Sem pitch deck analisado [source: pitch_deck]');

  return {
    generated_at: new Date().toISOString(),
    generated_by: uid,
    model: null as string | null,
    confidence: 'low' as 'low' | 'medium' | 'high',
    sections: {
      factual_summary: factual,
      confirmed_vs_claimed: { confirmed: factual, claimed: bookingForm ? Object.keys(bookingForm) : [] },
      missing_information: missing,
      fit_signals: bookingForm?.stage ? [`Stage declarado: ${bookingForm.stage}`] : [],
      risks: missing.length > 3 ? ['Muitos dados em falta — qualificação parcial'] : [],
      discovery_questions: [
        'Qual é a métrica principal que estão a otimizar este trimestre?',
        'Que decisão precisam de tomar após esta conversa?',
      ],
      recommended_next_step: [
        'Confirmar dados essenciais na primeira chamada [source: staff_playbook]',
        ...(!pitchAnalysis ? ['Pedir pitch deck antes da reunião [source: staff_playbook]'] : []),
      ],
    },
    evidence,
  };
}

async function callAiGateway(prompt: string, apiKey: string, signal: AbortSignal): Promise<string | null> {
  const resp = await fetch(GATEWAY_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Lovable-API-Key': apiKey,
      'X-Lovable-AIG-SDK': 'edge-function',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are an incubator intake analyst. Produce a concise, evidence-anchored briefing for a staff consultant preparing a first-contact meeting. ' +
            'Every non-trivial claim MUST end with a [source: X] tag drawn from the provided evidence keys (booking_form, pitch_deck, communication_log, funnel_items). ' +
            'Never invent facts. If a section has no evidence, output an empty JSON array. Respond in Portuguese (Portugal).',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error(`ai_gateway status=${resp.status} body=${body.slice(0, 400)}`);
    return null;
  }
  const json = await resp.json().catch(() => null) as any;
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const aiKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const sbSvc = createClient(url, svc);

    const { data: userData } = await sbUser.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const { data: roles } = await sbSvc.from('user_roles').select('role').eq('user_id', uid);
    const isStaff = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'consultant');
    if (!isStaff) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = await req.json() as Body;
    if (!body?.funnel_item_id) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });

    const { data: item, error: itemErr } = await sbSvc
      .from('funnel_items')
      .select('id, organization_name, contact_name, contact_email, phone, stage, program_id, metadata_json')
      .eq('id', body.funnel_item_id)
      .maybeSingle();
    if (itemErr || !item) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: jsonHeaders });

    const meta = (item.metadata_json ?? {}) as any;
    const bookingForm = meta?.booking?.form ?? null;
    const pitchAnalysis = meta?.pitch_analysis ?? null;

    const { data: comms } = await sbSvc
      .from('communication_log')
      .select('kind, direction, subject, summary, occurred_at, original_timestamp')
      .eq('funnel_item_id', item.id)
      .order('occurred_at', { ascending: false })
      .limit(30);

    const scaffold = buildScaffold({ item, bookingForm, pitchAnalysis, comms: comms ?? [], uid });

    // Try the Lovable AI Gateway; fall back to scaffold on any failure.
    let brief: any = scaffold;
    let modelStatus: 'ok' | 'unavailable' | 'skipped' = 'skipped';

    if (aiKey) {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 20_000);
      try {
        const prompt = [
          'Contexto (JSON):',
          JSON.stringify({
            funnel_item: {
              id: item.id,
              organization_name: item.organization_name,
              contact_name: item.contact_name,
              contact_email: item.contact_email,
              phone: item.phone,
              stage: item.stage,
            },
            booking_form: bookingForm,
            pitch_deck: pitchAnalysis,
            communication_log: comms ?? [],
          }),
          '',
          'Devolve APENAS JSON com este shape:',
          '{ "sections": { "factual_summary": string[], "confirmed_vs_claimed": { "confirmed": string[], "claimed": string[] }, "missing_information": string[], "fit_signals": string[], "risks": string[], "discovery_questions": string[], "recommended_next_step": string[] }, "confidence": "low" | "medium" | "high" }',
        ].join('\n');

        const raw = await callAiGateway(prompt, aiKey, controller.signal);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.sections) {
              brief = {
                ...scaffold,
                model: MODEL,
                confidence: parsed.confidence ?? scaffold.confidence,
                sections: { ...scaffold.sections, ...parsed.sections },
              };
              modelStatus = 'ok';
            }
          } catch (e) {
            console.error('brief parse failed', (e as any)?.message);
            modelStatus = 'unavailable';
          }
        } else {
          modelStatus = 'unavailable';
        }
      } catch (e) {
        console.error('brief ai call failed', (e as any)?.message);
        modelStatus = 'unavailable';
      } finally {
        clearTimeout(to);
      }
    }

    const nextMeta = { ...meta, ai_brief: brief };
    const { error: updErr } = await sbSvc
      .from('funnel_items')
      .update({ metadata_json: nextMeta })
      .eq('id', item.id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ success: true, model_status: modelStatus, brief }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error('generate-first-contact-brief error', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'internal_error', message: e?.message ?? String(e) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
