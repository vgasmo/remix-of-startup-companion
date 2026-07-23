import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";
import { requireCronOrGovernance } from "../_shared/security.ts";
import { withCronRunLogging } from '../_shared/cronRun.ts';

/**
 * compute-cohort-benchmarks
 * Scheduled (daily 04:00 UTC) and admin-callable.
 * Aggregates kpi_values into anonymized percentiles per program/stage/metric.
 * k-anonymity: only writes rows where cohort_size >= 5.
 */

const MIN_COHORT = 5;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

serve(withCronRunLogging('compute-cohort-benchmarks', async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    // SECURITY: Fail-closed — timing-safe cron secret OR governance JWT (admin/backoffice).
    const authCheck = await requireCronOrGovernance(req, supabaseUserClient as any, supabase as any);
    if ('error' in authCheck) {
      console.error('[compute-cohort-benchmarks] Unauthorized invocation');
      return authCheck.error;
    }

    console.log('[compute-cohort-benchmarks] starting aggregation');

    // Pull all active workspaces with program + stage
    const { data: workspaces, error: wsErr } = await supabase
      .from('workspaces')
      .select('id, program_id, stage, status')
      .not('program_id', 'is', null);
    if (wsErr) throw wsErr;

    const active = (workspaces ?? []).filter((w: any) => w.status !== 'archived' && w.stage);

    // Pull all kpi values (latest per workspace+kpi_definition)
    const { data: kpiValues, error: kvErr } = await supabase
      .from('kpi_values')
      .select('workspace_id, kpi_definition_id, value, period_month');
    if (kvErr) throw kvErr;

    const { data: kpiDefs, error: kdErr } = await supabase
      .from('kpi_definitions')
      .select('id, name, unit');
    if (kdErr) throw kdErr;

    const defMap = new Map((kpiDefs ?? []).map((d: any) => [d.id, d]));

    // Pick latest value per workspace+kpi
    const latestByWsKpi = new Map<string, { value: number; workspace_id: string; kpi_definition_id: string }>();
    for (const row of kpiValues ?? []) {
      if (row.value == null) continue;
      const key = `${row.workspace_id}:${row.kpi_definition_id}`;
      const cur = latestByWsKpi.get(key);
      if (!cur || (cur as any).period_month < row.period_month) {
        latestByWsKpi.set(key, { ...row, value: Number(row.value) } as any);
      }
    }

    // Build cohort buckets: program_id|stage|metric_key -> values[]
    const wsIndex = new Map((active ?? []).map((w: any) => [w.id, w]));
    const cohorts = new Map<string, { program_id: string; stage: string; metric_key: string; metric_label: string | null; values: number[] }>();

    for (const v of latestByWsKpi.values()) {
      const ws = wsIndex.get(v.workspace_id);
      if (!ws) continue;
      const def = defMap.get(v.kpi_definition_id);
      if (!def) continue;
      const key = `${ws.program_id}|${ws.stage}|kpi:${v.kpi_definition_id}`;
      let c = cohorts.get(key);
      if (!c) {
        c = {
          program_id: ws.program_id,
          stage: ws.stage,
          metric_key: `kpi:${v.kpi_definition_id}`,
          metric_label: (def as any).name + ((def as any).unit ? ` (${(def as any).unit})` : ''),
          values: [],
        };
        cohorts.set(key, c);
      }
      c.values.push(v.value);
    }

    // Also: health_score per program+stage
    for (const w of active as Array<Record<string, unknown>>) {
      if ((w as { health_score_numeric?: number | null }).health_score_numeric == null) continue;
    }

    // (health requires the column — fetch explicitly)
    const { data: healthRows } = await supabase
      .from('workspaces')
      .select('program_id, stage, health_score_numeric')
      .not('program_id', 'is', null)
      .not('stage', 'is', null)
      .not('health_score_numeric', 'is', null);
    for (const w of healthRows ?? []) {
      const key = `${w.program_id}|${w.stage}|health_score`;
      let c = cohorts.get(key);
      if (!c) {
        c = { program_id: w.program_id, stage: w.stage, metric_key: 'health_score', metric_label: 'Health Score', values: [] };
        cohorts.set(key, c);
      }
      c.values.push(Number(w.health_score_numeric));
    }

    // Compute percentiles and upsert
    const rows: any[] = [];
    for (const c of cohorts.values()) {
      if (c.values.length < MIN_COHORT) continue;
      const sorted = [...c.values].sort((a, b) => a - b);
      const avg = sorted.reduce((s, n) => s + n, 0) / sorted.length;
      rows.push({
        program_id: c.program_id,
        stage: c.stage,
        metric_key: c.metric_key,
        metric_label: c.metric_label,
        cohort_size: sorted.length,
        p25: percentile(sorted, 25),
        p50: percentile(sorted, 50),
        p75: percentile(sorted, 75),
        p90: percentile(sorted, 90),
        avg,
        computed_at: new Date().toISOString(),
      });
    }

    // Replace strategy: delete then insert (small dataset)
    if (rows.length > 0) {
      await supabase.from('cohort_benchmarks').delete().not('id', 'is', null);
      const { error: insErr } = await supabase.from('cohort_benchmarks').insert(rows);
      if (insErr) throw insErr;
    }

    console.log(`[compute-cohort-benchmarks] wrote ${rows.length} cohort rows`);

    return corsJsonResponse({ ok: true, rows_written: rows.length, cohorts_skipped: cohorts.size - rows.length }, req);
  } catch (err: any) {
    console.error('[compute-cohort-benchmarks] error', err);
    return corsJsonResponse({ error: err?.message || 'Failed' }, req, 500);
  }
}));
