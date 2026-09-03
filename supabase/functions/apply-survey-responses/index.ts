import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { validateUUID, parseAndValidateBody } from '../_shared/validation.ts';

/**
 * apply-survey-responses
 *
 * Turns a submitted survey into canonical platform data. Without this the
 * answers stay in `survey_responses` and nothing on the founder's workspace
 * changes — which is exactly why nobody fills the surveys twice.
 *
 * Mapping lives in `survey_definitions.write_back_mappings`:
 *   question_id -> { target, key?, valueMap?, overwrite?, dateQuestionId? }
 *
 * Every attempt (applied, skipped or failed) is recorded in
 * `survey_writebacks`, so staff can see what a survey wrote and why.
 */

type TargetType = 'kpi' | 'startup' | 'workspace' | 'milestone';

interface WriteBackMapping {
  target: TargetType;
  /** kpi_definition_id for `kpi`; column name for `startup` / `workspace`. */
  key?: string;
  /** Answer value -> stored value (e.g. "Validação" -> "validation"). */
  valueMap?: Record<string, string>;
  /** Overwrite a field that already holds a value. Default: false. */
  overwrite?: boolean;
  /** For `milestone`: question holding the target date. */
  dateQuestionId?: string;
}

interface WriteBackResult {
  question_id: string;
  target_type: TargetType;
  target_key: string | null;
  target_row_id: string | null;
  value_text: string | null;
  value_number: number | null;
  status: 'applied' | 'skipped' | 'error';
  detail: string | null;
}

/** Columns a survey answer is allowed to write. Anything else is rejected. */
const STARTUP_FIELDS = [
  'description',
  'website',
  'founded_date',
  'main_contact_name',
  'main_contact_email',
  'main_contact_phone',
  'phone',
  'address',
  'nif',
];

const WORKSPACE_FIELDS = ['stage'];

const STAGE_VALUES = ['ideation', 'validation', 'mvp', 'growth', 'scale'];

/**
 * Parse a number typed by a founder: "1.234,56", "1,234.56", "€ 12 000", "12%".
 * Whichever separator comes last is the decimal one.
 */
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma > -1 && lastDot > -1) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = cleaned.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma > -1) {
    // A single comma is a decimal separator unless it groups thousands (1,000).
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals === 3 && !cleaned.startsWith('0,')
      ? cleaned.split(',').join('')
      : cleaned.replace(',', '.');
  } else {
    const decimals = lastDot > -1 ? cleaned.length - lastDot - 1 : 0;
    normalized = lastDot > -1 && decimals === 3 && !cleaned.startsWith('0.')
      ? cleaned.split('.').join('')
      : cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** First day of the month, as `yyyy-MM-dd`. */
function startOfMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function skip(
  questionId: string,
  mapping: WriteBackMapping,
  detail: string,
  valueText: string | null = null,
): WriteBackResult {
  return {
    question_id: questionId,
    target_type: mapping.target,
    target_key: mapping.key ?? null,
    target_row_id: null,
    value_text: valueText,
    value_number: null,
    status: 'skipped',
    detail,
  };
}

async function applyKpi(
  supabase: SupabaseClient,
  workspaceId: string,
  instanceId: string,
  userId: string | null,
  questionId: string,
  mapping: WriteBackMapping,
  answer: string,
  periodMonth: string,
  campaignName: string,
): Promise<WriteBackResult> {
  if (!mapping.key) return skip(questionId, mapping, 'Mapeamento sem kpi_definition_id');

  const value = parseNumber(answer);
  if (value === null) return skip(questionId, mapping, 'Resposta não numérica', answer);

  const { data: definition } = await supabase
    .from('kpi_definitions')
    .select('id')
    .eq('id', mapping.key)
    .maybeSingle();

  if (!definition) return skip(questionId, mapping, 'KPI não existe', answer);

  // A value locked by another source (financial model) wins over the survey.
  const { data: existing } = await supabase
    .from('kpi_values')
    .select('id, locked_by_source')
    .eq('workspace_id', workspaceId)
    .eq('kpi_definition_id', mapping.key)
    .eq('period_month', periodMonth)
    .maybeSingle();

  if (existing?.locked_by_source) {
    return skip(questionId, mapping, 'Valor bloqueado por outra fonte', answer);
  }

  // Make sure the KPI is tracked in the workspace, otherwise the value would
  // land in the database without ever showing up in the workspace KPI tab.
  await supabase
    .from('workspace_kpis')
    .upsert(
      { workspace_id: workspaceId, kpi_definition_id: mapping.key, active: true },
      { onConflict: 'workspace_id,kpi_definition_id', ignoreDuplicates: true },
    );

  const { data: written, error } = await supabase
    .from('kpi_values')
    .upsert(
      {
        workspace_id: workspaceId,
        kpi_definition_id: mapping.key,
        period_month: periodMonth,
        value,
        source_type: 'survey',
        created_by: userId,
        notes: `Inquérito: ${campaignName}`,
      },
      { onConflict: 'workspace_id,kpi_definition_id,period_month' },
    )
    .select('id')
    .single();

  if (error) {
    return {
      question_id: questionId,
      target_type: 'kpi',
      target_key: mapping.key,
      target_row_id: null,
      value_text: answer,
      value_number: value,
      status: 'error',
      detail: error.message,
    };
  }

  return {
    question_id: questionId,
    target_type: 'kpi',
    target_key: mapping.key,
    target_row_id: written.id,
    value_text: answer,
    value_number: value,
    status: 'applied',
    detail: `período ${periodMonth}`,
  };
}

async function applyRecordField(
  supabase: SupabaseClient,
  table: 'startups' | 'workspaces',
  rowId: string,
  questionId: string,
  mapping: WriteBackMapping,
  answer: string,
): Promise<WriteBackResult> {
  const allowed = table === 'startups' ? STARTUP_FIELDS : WORKSPACE_FIELDS;
  if (!mapping.key || !allowed.includes(mapping.key)) {
    return skip(questionId, mapping, `Campo não permitido: ${mapping.key ?? '—'}`, answer);
  }

  const value = mapping.valueMap?.[answer] ?? answer;

  if (mapping.key === 'stage' && !STAGE_VALUES.includes(value)) {
    return skip(questionId, mapping, `Fase desconhecida: ${answer}`, answer);
  }
  if (mapping.key === 'founded_date' && !parseDate(value)) {
    return skip(questionId, mapping, 'Data inválida', answer);
  }

  const { data: current } = await supabase
    .from(table)
    .select(mapping.key)
    .eq('id', rowId)
    .maybeSingle();

  const currentValue = (current as Record<string, unknown> | null)?.[mapping.key];
  const isEmpty = currentValue === null || currentValue === undefined || currentValue === '';

  if (!isEmpty && !mapping.overwrite) {
    return skip(questionId, mapping, 'Campo já preenchido (sem overwrite)', answer);
  }
  if (String(currentValue ?? '') === value) {
    return skip(questionId, mapping, 'Valor inalterado', answer);
  }

  const { error } = await supabase
    .from(table)
    .update({ [mapping.key]: mapping.key === 'founded_date' ? parseDate(value) : value })
    .eq('id', rowId);

  if (error) {
    return {
      question_id: questionId,
      target_type: mapping.target,
      target_key: mapping.key,
      target_row_id: rowId,
      value_text: answer,
      value_number: null,
      status: 'error',
      detail: error.message,
    };
  }

  return {
    question_id: questionId,
    target_type: mapping.target,
    target_key: mapping.key,
    target_row_id: rowId,
    value_text: value,
    value_number: null,
    status: 'applied',
    // Keep the replaced value so staff can see (and undo) what the survey changed.
    detail: isEmpty ? null : `anterior: ${String(currentValue).slice(0, 200)}`,
  };
}

async function applyMilestone(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
  questionId: string,
  mapping: WriteBackMapping,
  answer: string,
  targetDate: string | null,
): Promise<WriteBackResult> {
  const title = answer.trim().slice(0, 200);

  const { data: existing } = await supabase
    .from('milestones')
    .select('id')
    .eq('workspace_id', workspaceId)
    .ilike('title', title)
    .maybeSingle();

  if (existing) {
    return {
      question_id: questionId,
      target_type: 'milestone',
      target_key: null,
      target_row_id: existing.id,
      value_text: title,
      value_number: null,
      status: 'skipped',
      detail: 'Marco já existe',
    };
  }

  const { data: created, error } = await supabase
    .from('milestones')
    .insert({
      workspace_id: workspaceId,
      title,
      target_date: targetDate,
      created_by: userId,
      description: 'Criado a partir do inquérito de dados base.',
    })
    .select('id')
    .single();

  if (error) {
    return {
      question_id: questionId,
      target_type: 'milestone',
      target_key: null,
      target_row_id: null,
      value_text: title,
      value_number: null,
      status: 'error',
      detail: error.message,
    };
  }

  return {
    question_id: questionId,
    target_type: 'milestone',
    target_key: null,
    target_row_id: created.id,
    value_text: title,
    value_number: null,
    status: 'applied',
    detail: targetDate ? `alvo ${targetDate}` : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

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

    const bodyResult = await parseAndValidateBody<{ instance_id: string }>(req);
    if (!bodyResult.valid) return json({ error: bodyResult.error }, 400);

    const instanceIdResult = validateUUID(bodyResult.value?.instance_id, 'instance_id');
    if (!instanceIdResult.valid) return json({ error: instanceIdResult.error }, 400);
    const instanceId = instanceIdResult.value!;

    const { data: instance, error: instanceError } = await supabase
      .from('survey_instances')
      .select(`
        id, workspace_id, status, submitted_by,
        campaign:survey_campaigns(
          id, name,
          survey_definition:survey_definitions(id, write_back_mappings)
        )
      `)
      .eq('id', instanceId)
      .maybeSingle();

    if (instanceError) throw instanceError;
    if (!instance) return json({ error: 'Survey instance not found' }, 404);

    // Auth: the founder's own JWT, or an internal call carrying the cron secret.
    const isInternal = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    let userId: string | null = null;

    if (!isInternal) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Unauthorized' }, 401);

      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', ''),
      );
      if (authError || !user) return json({ error: 'Unauthorized' }, 401);

      const { data: hasAccess } = await supabase.rpc('has_workspace_access', {
        _user_id: user.id,
        _workspace_id: instance.workspace_id,
      });
      if (!hasAccess) return json({ error: 'Access denied' }, 403);

      userId = user.id;
    } else {
      userId = instance.submitted_by ?? null;
    }

    if (instance.status !== 'submitted') {
      return json({ error: 'Survey is not submitted yet' }, 400);
    }

    const campaign = instance.campaign as unknown as {
      id: string;
      name: string;
      survey_definition: { id: string; write_back_mappings: Record<string, WriteBackMapping> | null } | null;
    } | null;

    const mappings = (campaign?.survey_definition?.write_back_mappings ?? {}) as Record<string, WriteBackMapping>;
    if (Object.keys(mappings).length === 0) {
      return json({ success: true, applied: 0, skipped: 0, errors: 0, results: [] });
    }

    const { data: responses, error: responsesError } = await supabase
      .from('survey_responses')
      .select('question_id, response_value, response_json')
      .eq('instance_id', instanceId);

    if (responsesError) throw responsesError;

    const answers = new Map<string, string>();
    for (const response of responses ?? []) {
      const raw = response.response_value
        ?? (Array.isArray(response.response_json) ? response.response_json.join(', ') : null);
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        answers.set(response.question_id, String(raw).trim());
      }
    }

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, startup_id')
      .eq('id', instance.workspace_id)
      .single();

    const periodMonth = startOfMonth(new Date());
    const results: WriteBackResult[] = [];

    for (const [questionId, mapping] of Object.entries(mappings)) {
      const answer = answers.get(questionId);
      if (!answer) {
        results.push(skip(questionId, mapping, 'Sem resposta'));
        continue;
      }

      try {
        switch (mapping.target) {
          case 'kpi':
            results.push(await applyKpi(
              supabase, instance.workspace_id, instanceId, userId, questionId,
              mapping, answer, periodMonth, campaign?.name ?? 'inquérito',
            ));
            break;
          case 'startup':
            if (!workspace?.startup_id) {
              results.push(skip(questionId, mapping, 'Workspace sem startup', answer));
              break;
            }
            results.push(await applyRecordField(
              supabase, 'startups', workspace.startup_id, questionId, mapping, answer,
            ));
            break;
          case 'workspace':
            results.push(await applyRecordField(
              supabase, 'workspaces', instance.workspace_id, questionId, mapping, answer,
            ));
            break;
          case 'milestone': {
            const rawDate = mapping.dateQuestionId ? answers.get(mapping.dateQuestionId) : undefined;
            results.push(await applyMilestone(
              supabase, instance.workspace_id, userId, questionId, mapping, answer,
              rawDate ? parseDate(rawDate) : null,
            ));
            break;
          }
          default:
            results.push(skip(questionId, mapping, `Destino desconhecido: ${mapping.target}`, answer));
        }
      } catch (error) {
        console.error(`[apply-survey-responses] ${questionId} failed:`, error);
        results.push({
          question_id: questionId,
          target_type: mapping.target,
          target_key: mapping.key ?? null,
          target_row_id: null,
          value_text: answer,
          value_number: null,
          status: 'error',
          detail: error instanceof Error ? error.message : 'Erro inesperado',
        });
      }
    }

    // Re-running the survey replaces the previous audit rows for the instance.
    await supabase.from('survey_writebacks').delete().eq('instance_id', instanceId);
    await supabase.from('survey_writebacks').insert(
      results.map((result) => ({
        ...result,
        instance_id: instanceId,
        workspace_id: instance.workspace_id,
        applied_by: userId,
      })),
    );

    const applied = results.filter((r) => r.status === 'applied').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;

    await supabase.from('activity_log').insert({
      workspace_id: instance.workspace_id,
      user_id: userId ?? 'system',
      entity_type: 'survey',
      entity_id: instanceId,
      action: 'write_back',
      metadata: { campaign: campaign?.name, applied, skipped, errors, period_month: periodMonth },
    });

    // Fresh KPI data changes the health score; recompute for this workspace only.
    if (applied > 0 && cronSecret) {
      fetch(`${supabaseUrl}/functions/v1/recompute-health-scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({ workspace_id: instance.workspace_id }),
      }).catch(() => {});
    }

    console.log(`[apply-survey-responses] instance=${instanceId} applied=${applied} skipped=${skipped} errors=${errors}`);

    return json({ success: true, applied, skipped, errors, results });
  } catch (error) {
    console.error('[apply-survey-responses] Error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
