/**
 * useKpiAnomalyNudge — Pure client-side anomaly detection over already-fetched KPI data.
 *
 * Detects three patterns from `kpi_values` (the canonical KPI store):
 *   • declining — latest value is >20% below the previous period
 *   • stale     — last 3 periods all share the same value
 *   • missing   — KPI has fewer than 2 recorded periods
 *
 * Returns at most one anomaly (the first KPI that trips a rule) so the dashboard
 * shows a single focused nudge instead of a wall of warnings.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export type KpiAnomalyTrend = 'declining' | 'stale' | 'missing';

export interface KpiAnomaly {
  kpiName: string;
  trend: KpiAnomalyTrend;
  message: string;
}

interface KpiValueRow {
  kpi_definition_id: string | null;
  value: number | null;
  period_month: string | null;
  kpi_definitions: { name: string | null } | null;
}

export function useKpiAnomalyNudge(workspaceId: string | undefined) {
  return useQuery<KpiAnomaly | null>({
    queryKey: ['kpi-anomaly', workspaceId],
    enabled: !!workspaceId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_values')
        .select('kpi_definition_id, value, period_month, kpi_definitions(name)')
        .eq('workspace_id', workspaceId!)
        .order('period_month', { ascending: false })
        .limit(60);

      if (error || !data || data.length === 0) return null;

      // Group most-recent-first values by KPI definition.
      const byKpi = new Map<string, { name: string; values: number[]; latestPeriod: string | null }>();
      for (const row of data as unknown as KpiValueRow[]) {
        const defId = row.kpi_definition_id;
        if (!defId) continue;
        const name = row.kpi_definitions?.name ?? '';
        if (!name) continue;
        const value = typeof row.value === 'number' ? row.value : Number(row.value);
        if (!Number.isFinite(value)) continue;
        const bucket = byKpi.get(defId) ?? { name, values: [], latestPeriod: null };
        bucket.values.push(value);
        if (!bucket.latestPeriod && row.period_month) bucket.latestPeriod = row.period_month;
        byKpi.set(defId, bucket);
      }

      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      for (const { name, values, latestPeriod } of byKpi.values()) {
        if (values.length < 2) continue;

        if (latestPeriod && new Date(latestPeriod) < twoMonthsAgo) {
          return {
            kpiName: name,
            trend: 'missing',
            message: `${name} sem registos há mais de 2 meses. Considere atualizar.`,
          };
        }

        if (values.length >= 3 && values.slice(0, 3).every((v) => v === values[0])) {
          return {
            kpiName: name,
            trend: 'stale',
            message: `${name} está estagnado há 3 períodos.`,
          };
        }

        const [latest, previous] = values;
        if (previous > 0 && (previous - latest) / previous > 0.2) {
          return {
            kpiName: name,
            trend: 'declining',
            message: `${name} desceu mais de 20% face ao período anterior.`,
          };
        }
      }

      return null;
    },
  });
}
