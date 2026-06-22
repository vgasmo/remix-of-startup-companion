import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Calendar, Users, AlertTriangle } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';

interface ConsultorStatsBarProps {
  stats: {
    total: number;
    needsAttention: number;
    upcomingMeetingsCount: number;
    overdueActionsCount: number;
  };
}

export const ConsultorStatsBar = memo(function ConsultorStatsBar({ stats }: ConsultorStatsBarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <MetricStrip
      metrics={[
        {
          id: 'total',
          label: t('dashboard.totalStartups'),
          value: stats.total,
          icon: Users,
        },
        {
          id: 'attention',
          label: t('dashboard.needsAttention'),
          value: stats.needsAttention,
          icon: AlertCircle,
          tone: stats.needsAttention > 0 ? 'critical' : 'default',
          onClick: () => navigate('/my-workspaces?filter=attention'),
        },
        {
          id: 'meetings',
          label: t('dashboard.meetingsThisWeek'),
          value: stats.upcomingMeetingsCount,
          icon: Calendar,
        },
        {
          id: 'overdue',
          label: t('dashboard.overdueActions'),
          value: stats.overdueActionsCount,
          icon: AlertTriangle,
          tone: stats.overdueActionsCount > 0 ? 'critical' : 'default',
        },
      ]}
    />
  );
});
