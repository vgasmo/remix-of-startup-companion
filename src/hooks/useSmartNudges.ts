import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { format, subDays, startOfMonth } from 'date-fns';

export interface SmartNudge {
  id: string;
  type: 'kpi_stale' | 'milestone_overdue' | 'action_overdue' | 'checkin_pending' | 'no_sessions';
  severity: 'info' | 'warning';
  message: string;
  cta: string;
  href: string;
}

export function useSmartNudges(workspaceId: string | undefined) {
  const { t } = useTranslation();
  const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  // Fetch KPI freshness
  const { data: kpiData } = useQuery({
    queryKey: ['smart-nudges-kpi', workspaceId, currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_values')
        .select('id')
        .eq('workspace_id', workspaceId!)
        .eq('period_month', currentMonth)
        .not('value', 'is', null)
        .limit(1);
      if (error) throw error;
      return { hasCurrentMonthKpis: (data?.length || 0) > 0 };
    },
    enabled: !!workspaceId,
  });

  // Fetch overdue actions count
  const { data: actionData } = useQuery({
    queryKey: ['smart-nudges-actions', workspaceId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { count, error } = await supabase
        .from('action_items')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId!)
        .lt('due_date', today)
        .not('status', 'in', '(completed,awaiting_validation,cancelled)');
      if (error) throw error;
      return { overdueCount: count || 0 };
    },
    enabled: !!workspaceId,
  });

  // Fetch last session date
  const { data: sessionData } = useQuery({
    queryKey: ['smart-nudges-sessions', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('scheduled_at')
        .eq('workspace_id', workspaceId!)
        .order('scheduled_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const lastSession = data?.[0]?.scheduled_at;
      const isStale = !lastSession || lastSession < thirtyDaysAgo;
      return { noRecentSession: isStale };
    },
    enabled: !!workspaceId,
  });

  // Fetch pending checkins
  const { data: checkinData } = useQuery({
    queryKey: ['smart-nudges-checkins', workspaceId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('checkin_instances')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId!)
        .eq('status', 'pending');
      if (error) throw error;
      return { pendingCheckins: count || 0 };
    },
    enabled: !!workspaceId,
  });

  const nudges = useMemo<SmartNudge[]>(() => {
    if (!workspaceId) return [];
    const result: SmartNudge[] = [];

    // KPI nudge
    if (kpiData && !kpiData.hasCurrentMonthKpis) {
      result.push({
        id: 'kpi-stale',
        type: 'kpi_stale',
        severity: 'warning',
        message: t('smartNudges.kpiStale', { defaultValue: "Your KPIs haven't been updated this month. Keep your data fresh!" }),
        cta: t('smartNudges.updateKpis', { defaultValue: 'Update KPIs' }),
        href: `/workspace/${workspaceId}?tab=kpis`,
      });
    }

    // Overdue actions
    if (actionData && actionData.overdueCount > 0) {
      result.push({
        id: 'actions-overdue',
        type: 'action_overdue',
        severity: 'warning',
        message: t('smartNudges.actionsOverdue', { 
          count: actionData.overdueCount,
          defaultValue: `You have ${actionData.overdueCount} overdue action(s). Tackle them to stay on track.`,
        }),
        cta: t('smartNudges.viewActions', { defaultValue: 'View Actions' }),
        href: `/workspace/${workspaceId}?tab=milestones-actions&sub=actions`,
      });
    }

    // No recent sessions
    if (sessionData?.noRecentSession) {
      result.push({
        id: 'no-sessions',
        type: 'no_sessions',
        severity: 'info',
        message: t('smartNudges.noRecentSession', { defaultValue: "No mentoring session in 30+ days. Regular sessions accelerate growth." }),
        cta: t('smartNudges.scheduleSession', { defaultValue: 'Schedule Session' }),
        href: `/workspace/${workspaceId}?tab=agenda`,
      });
    }

    // Pending check-ins
    if (checkinData && checkinData.pendingCheckins > 0) {
      result.push({
        id: 'checkin-pending',
        type: 'checkin_pending',
        severity: 'info',
        message: t('smartNudges.checkinPending', { 
          count: checkinData.pendingCheckins,
          defaultValue: `You have ${checkinData.pendingCheckins} pending check-in(s). Submit to keep your team informed.`,
        }),
        cta: t('smartNudges.completeCheckin', { defaultValue: 'Complete Check-in' }),
        href: `/workspace/${workspaceId}?tab=overview`,
      });
    }

    return result;
  }, [workspaceId, kpiData, actionData, sessionData, checkinData, t]);

  return nudges;
}
