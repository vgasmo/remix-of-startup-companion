/**
 * Mentor Impact Panel
 * Lightweight read-only card showing mentor engagement quality.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, Calendar, Users, AlertTriangle, CheckCircle2, Sparkles, Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';


interface MentorImpactPanelProps {
  workspaces: WorkspaceWithDetails[];
}

export function MentorImpactPanel({ workspaces }: MentorImpactPanelProps) {
  const { t } = useTranslation();

  const metrics = useMemo(() => {
    if (!workspaces?.length) return null;

    const now = new Date();
    const activeCount = workspaces.length;
    const withRecentSession = workspaces.filter(w => {
      if (!w.lastSession?.scheduled_at) return false;
      return differenceInDays(now, new Date(w.lastSession.scheduled_at)) <= 30;
    }).length;
    const staleCount = workspaces.filter(w => {
      if (!w.lastSession?.scheduled_at) return true;
      return differenceInDays(now, new Date(w.lastSession.scheduled_at)) > 30;
    }).length;
    const healthyCount = workspaces.filter(w => {
      const h = w.health_score_override || w.health_score;
      return h === 'healthy' || h === 'thriving';
    }).length;

    return { activeCount, withRecentSession, staleCount, healthyCount };
  }, [workspaces]);

  if (!metrics) {
    return (
      <EmptyState
        icon={Heart}
        title={t('mentorImpact.emptyTitle', { defaultValue: 'O seu impacto aparecerá aqui' })}
        description={t('mentorImpact.emptyDesc', { defaultValue: 'Após as suas primeiras sessões, verá métricas sobre o seu contributo para as startups.' })}
      />
    );
  }


  const items = [
    { 
      label: t('mentorImpact.activeStartups', { defaultValue: 'Startups ativas' }), 
      value: metrics.activeCount, 
      icon: Users, 
      color: 'text-primary' 
    },
    { 
      label: t('mentorImpact.recentSessions', { defaultValue: 'Sessões recentes (30d)' }), 
      value: metrics.withRecentSession, 
      icon: Calendar, 
      color: 'text-success' 
    },
    { 
      label: t('mentorImpact.staleFollowup', { defaultValue: 'Follow-up em atraso' }), 
      value: metrics.staleCount, 
      icon: AlertTriangle, 
      color: metrics.staleCount > 0 ? 'text-warning' : 'text-muted-foreground' 
    },
    { 
      label: t('mentorImpact.healthyMomentum', { defaultValue: 'Momentum saudável' }), 
      value: metrics.healthyCount, 
      icon: TrendingUp, 
      color: 'text-success' 
    },
  ];

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('mentorImpact.title', { defaultValue: 'O Seu Impacto' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="p-2.5 rounded-lg border border-border/40 bg-background">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={cn('h-3.5 w-3.5', item.color)} />
                  <span className="text-lg font-semibold">{item.value}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">{item.label}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
