import { useMemo } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckSquare, BarChart3, Flag } from 'lucide-react';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useWorkspaceActions, useWorkspaceKpis, useWorkspaceMilestones } from '@/hooks/useWorkspaceData';
import { cn } from '@/lib/utils';

interface FounderProgressRingsProps {
  workspaceId: string;
  className?: string;
}

export function FounderProgressRings({ workspaceId, className }: FounderProgressRingsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: actions } = useWorkspaceActions(workspaceId);
  const { data: kpiData } = useWorkspaceKpis(workspaceId);
  const { data: milestones } = useWorkspaceMilestones(workspaceId);

  const rings = useMemo(() => {
    // Actions completed this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const totalActions = actions?.length ?? 0;
    const completedActions = actions?.filter(a => 
      a.status === 'completed' && a.completed_at && new Date(a.completed_at) >= monthStart
    ).length ?? 0;
    const actionsPct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

    // KPIs reported this month
    const totalKpis = kpiData?.current?.length ?? 0;
    // Consider "reported" if there are any current month entries
    const kpiPct = totalKpis > 0 ? 100 : 0;

    // Milestones on track
    const totalMilestones = milestones?.length ?? 0;
    const onTrack = milestones?.filter((m: any) => m.status !== 'delayed' && m.status !== 'blocked').length ?? 0;
    const milestonesPct = totalMilestones > 0 ? Math.round((onTrack / totalMilestones) * 100) : 0;

    return [
      { label: t('founder.ring.actions', { defaultValue: 'Ações' }), pct: actionsPct, color: 'primary' as const, icon: CheckSquare, tab: 'milestones-actions' },
      { label: t('founder.ring.kpis', { defaultValue: 'KPIs' }), pct: kpiPct, color: 'success' as const, icon: BarChart3, tab: 'kpis' },
      { label: t('founder.ring.milestones', { defaultValue: 'Marcos' }), pct: milestonesPct, color: 'warning' as const, icon: Flag, tab: 'milestones-actions' },
    ];
  }, [actions, kpiData, milestones, t]);

  // Don't show if no data at all
  if (!actions?.length && !milestones?.length) return null;

  return (
    <div className={cn('flex items-center justify-center gap-6 sm:gap-8 py-4', className)}>
      {rings.map((ring) => {
        const Icon = ring.icon;
        return (
          <div 
            key={ring.label} 
            className="flex flex-col items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform"
            {...clickableProps(() => navigate(`/workspace/${workspaceId}?tab=${ring.tab}`))}
          >
            <ProgressRing progress={ring.pct} size="lg" color={ring.color} />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon className="h-3 w-3" />
              <span className="font-medium">{ring.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
