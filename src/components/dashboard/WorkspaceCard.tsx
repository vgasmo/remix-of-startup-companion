import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { Calendar, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { Sparkline } from '@/components/ui/Sparkline';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { HealthScore } from '@/types/database';
import { cn } from '@/lib/utils';

interface WorkspaceCardProps {
  workspace: WorkspaceWithDetails;
  onClick: () => void;
  kpiTrend?: number[];
}

export const WorkspaceCard = memo(function WorkspaceCard({ workspace, onClick, kpiTrend }: WorkspaceCardProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const effectiveHealth = workspace.health_score_override || workspace.health_score;
  const hasOverdue = workspace.overdueActionsCount > 0;

  return (
    <Card
      interactive
      className={cn(
        'surface-raised cursor-pointer group',
        hasOverdue && 'border-[hsl(var(--warning))]/30'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <Avatar className="h-12 w-12 rounded-xl ring-2 ring-primary/10 group-hover:ring-primary/30 transition-all">
            <AvatarImage 
              src={workspace.startup?.logo_url || undefined} 
              className="object-cover"
              alt={workspace.startup?.name || 'Startup logo'}
            />
            <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-semibold text-sm">
              {workspace.startup?.name?.slice(0, 2).toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {workspace.startup?.name}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {workspace.program?.name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1" data-tour="health-badge">
            <HealthBadge score={effectiveHealth as HealthScore | null} size="sm" />
            {workspace.priority_level && workspace.priority_level !== 'standard' && (
              <PriorityBadge priority={workspace.priority_level} size="sm" showLabel={false} />
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-muted/50 rounded-lg p-2.5 group-hover:bg-muted/70 transition-colors">
            <p className="text-[11px] text-muted-foreground mb-1">{t('workspaceCard.stage')}</p>
            <StageBadge stage={workspace.stage} size="sm" />
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 group-hover:bg-muted/70 transition-colors">
            <p className="text-[11px] text-muted-foreground mb-1">{t('workspaceCard.actions')}</p>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm">{workspace.pendingActionsCount}</span>
              {hasOverdue && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 leading-tight">
                  {workspace.overdueActionsCount} {t('workspaceCard.overdue')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* KPI Trend */}
        {kpiTrend && kpiTrend.length >= 2 && (
          <div className="bg-muted/30 rounded-lg p-2.5 mb-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">{t('workspaceCard.kpiTrend')}</p>
              <Sparkline data={kpiTrend} width={80} height={24} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2.5 border-t border-border/50">
          {workspace.nextMeetingDate ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <Calendar className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
              <span className="truncate">{format(new Date(workspace.nextMeetingDate), 'MMM d', { locale: dateLocale })}</span>
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-[11px]">{t('workspaceCard.noMeetings')}</span>
          )}
          {workspace.lastSession ? (
            <div className="flex items-center gap-1.5 max-w-[45%] min-w-0">
              <FileText className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
              <span className="truncate">{workspace.lastSession.title}</span>
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-[11px]">{t('workspaceCard.noSessions')}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
