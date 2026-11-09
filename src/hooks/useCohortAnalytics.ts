import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { HealthScore } from '@/types/database';

export interface CohortStats {
  programId: string;
  programName: string;
  programType: 'incubation' | 'acceleration' | null;
  totalStartups: number;
  healthDistribution: Record<HealthScore, number>;
  avgPendingActions: number;
  avgOverdueActions: number;
  kpiCompletionRate: number;
  stageDistribution: Record<string, number>;
  weekDistribution: Record<string, number>;
}

export function useCohortAnalytics(programId?: string) {
  return useQuery({
    queryKey: ['cohort-analytics', programId],
    queryFn: async (): Promise<CohortStats[]> => {
      // Get all programs
      const { data: programs, error: progError } = await supabase
        .from('programs')
        .select('id, name, program_type')
        .eq('is_active', true);

      if (progError) throw progError;
      if (!programs?.length) return [];

      // Get workspaces with stats
      const { data: workspaces, error: wsError } = await supabase
        .from('workspaces')
        .select(`
          id,
          program_id,
          stage,
          current_week,
          health_score,
          health_score_override
        `)
        .eq('status', 'active')
        .limit(1000);

      if (wsError) throw wsError;

      // Get action stats
      const wsIds = workspaces?.map(w => w.id) || [];
      const { data: actions, error: actionsErr } = await supabase
        .from('action_items')
        .select('workspace_id, status, due_date')
        .in('workspace_id', wsIds)
        .in('status', ['pending', 'in_progress']);

      // Get KPI completion
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const { data: kpis, error: kpisErr } = await supabase
        .from('kpi_values')
        .select('workspace_id')
        .in('workspace_id', wsIds)
        .eq('period_month', currentMonth);

      // A failed read must not become "0 pending actions / 0% KPIs".
      if (actionsErr) throw actionsErr;
      if (kpisErr) throw kpisErr;

      const today = new Date().toISOString().split('T')[0];

      // Build stats per program
      const stats: CohortStats[] = programs
        .filter(p => !programId || p.id === programId)
        .map(program => {
          const programWorkspaces = workspaces?.filter(w => w.program_id === program.id) || [];
          const wsIdsInProgram = programWorkspaces.map(w => w.id);

          const healthDist: Record<HealthScore, number> = {
            critical: 0,
            at_risk: 0,
            stable: 0,
            healthy: 0,
            thriving: 0,
          };

          const stageDist: Record<string, number> = {};
          const weekDist: Record<string, number> = {};

          programWorkspaces.forEach(w => {
            const health = (w.health_score_override || w.health_score || 'stable') as HealthScore;
            healthDist[health]++;
            stageDist[w.stage] = (stageDist[w.stage] || 0) + 1;
            if (w.current_week != null) {
              const weekLabel = `S${w.current_week}`;
              weekDist[weekLabel] = (weekDist[weekLabel] || 0) + 1;
            }
          });

          const programActions = actions?.filter(a => wsIdsInProgram.includes(a.workspace_id)) || [];
          const overdueActions = programActions.filter(a => a.due_date && a.due_date < today);
          const kpisWithData = kpis?.filter(k => wsIdsInProgram.includes(k.workspace_id)) || [];

          const total = programWorkspaces.length || 1;

          return {
            programId: program.id,
            programName: program.name,
            programType: (program.program_type as 'incubation' | 'acceleration' | null) || null,
            totalStartups: programWorkspaces.length,
            healthDistribution: healthDist,
            avgPendingActions: programActions.length / total,
            avgOverdueActions: overdueActions.length / total,
            kpiCompletionRate: (new Set(kpisWithData.map(k => k.workspace_id)).size / total) * 100,
            stageDistribution: stageDist,
            weekDistribution: weekDist,
          };
        });

      return stats;
    },
  });
}
