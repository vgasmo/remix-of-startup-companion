import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Rocket, CheckCircle, Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaybookProgress } from '@/hooks/usePlaybookProgress';
import { formatShortDate } from '@/lib/dateUtils';

interface PlaybookProgressWidgetProps {
  workspaceId: string;
}

/**
 * Compact widget showing active playbook progress.
 * Designed for WorkspaceOverview / FounderDashboard.
 */
export function PlaybookProgressWidget({ workspaceId }: PlaybookProgressWidgetProps) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const { data: progress, isLoading } = usePlaybookProgress(workspaceId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  // No active playbook
  if (!progress?.activePlaybook) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                <Rocket className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{t('playbookProgress.noActivePlaybook')}</p>
                <p className="text-xs text-muted-foreground">{t('playbookProgress.activateToTrack')}</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSearchParams({ tab: 'playbooks' })}
            >
              {t('playbookProgress.viewPlaybooks')}
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { activePlaybook, progressPercent, pendingActions, overdueActions, nextActionDue } = progress;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            {t('playbookProgress.activePlaybook')}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {progressPercent}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="font-medium truncate">{activePlaybook.title}</p>
          <Progress value={progressPercent} className="h-2 mt-2" />
        </div>

        <div className="flex items-center gap-4 text-xs">
          {overdueActions > 0 ? (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3 w-3" />
              {t('playbookProgress.overdueCount', { count: overdueActions })}
            </span>
          ) : pendingActions > 0 ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t('playbookProgress.pendingCount', { count: pendingActions })}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[hsl(var(--success))]">
              <CheckCircle className="h-3 w-3" />
              {t('playbookProgress.allComplete')}
            </span>
          )}

          {nextActionDue && (
            <span className="text-muted-foreground">
              {t('playbookProgress.nextDue')}: {formatShortDate(nextActionDue)}
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-xs"
            onClick={() => setSearchParams({ tab: 'milestones-actions' })}
          >
            {t('playbookProgress.viewActions')}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs"
            onClick={() => setSearchParams({ tab: 'milestones-actions' })}
          >
            {t('playbookProgress.viewMilestones')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
