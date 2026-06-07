import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, isToday, isTomorrow, differenceInHours, differenceInMinutes } from 'date-fns';
import { 
  Calendar, 
  Clock, 
  ArrowRight,
  AlertCircle,
  Target,
  FileText,
  MessageSquare,
  TrendingUp,
  CheckCircle2,
  Users,
  Sparkles,
  BookOpen,
  ListChecks,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { Separator } from '@/components/ui/separator';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { HealthScore } from '@/types/database';
import { cn } from '@/lib/utils';

interface MentorSessionPrepCardProps {
  workspace: WorkspaceWithDetails;
  meetingDate: Date;
  className?: string;
}

export function MentorSessionPrepCard({ workspace, meetingDate, className }: MentorSessionPrepCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const hoursUntil = differenceInHours(meetingDate, new Date());
  const minutesUntil = differenceInMinutes(meetingDate, new Date());
  const isImminent = hoursUntil <= 1;
  const isUrgent = hoursUntil <= 3;

  const health = workspace.health_score_override || workspace.health_score;

  const getTimeLabel = () => {
    if (isToday(meetingDate)) {
      if (minutesUntil <= 60) {
        return t('session.inMinutes', 'In {{minutes}} min', { minutes: minutesUntil });
      }
      return t('session.todayAt', 'Today at {{time}}', { time: format(meetingDate, 'h:mm a') });
    }
    if (isTomorrow(meetingDate)) {
      return t('session.tomorrowAt', 'Tomorrow at {{time}}', { time: format(meetingDate, 'h:mm a') });
    }
    return format(meetingDate, 'MMM d, h:mm a');
  };

  // Split suggestions into "read" and "do"
  const { readItems, doItems } = useMemo(() => {
    const read: { icon: typeof Target; text: string; priority: 'high' | 'medium' | 'low' }[] = [];
    const doList: { icon: typeof Target; text: string; priority: 'high' | 'medium' | 'low' }[] = [];

    if (workspace.lastSession) {
      read.push({
        icon: FileText,
        text: t('sessionPrep.reviewLastSession', 'Review notes from last session'),
        priority: 'low',
      });
    }

    if (workspace.overdueActionsCount > 0) {
      read.push({
        icon: AlertCircle,
        text: t('sessionPrep.reviewOverdue', 'Review {{count}} overdue actions', { count: workspace.overdueActionsCount }),
        priority: 'high',
      });
    }

    if (!workspace.hasCurrentMonthKpi) {
      doList.push({
        icon: TrendingUp,
        text: t('sessionPrep.askAboutKpis', 'Ask about this month\'s KPIs'),
        priority: 'medium',
      });
    }

    if (health === 'at_risk' || health === 'critical') {
      doList.push({
        icon: MessageSquare,
        text: t('sessionPrep.discussChallenges', 'Discuss current challenges'),
        priority: 'high',
      });
    }

    return { readItems: read, doItems: doList };
  }, [workspace, health, t]);

  return (
    <Card className={cn(
      'overflow-hidden transition-all duration-300 hover:shadow-md',
      isImminent 
        ? 'border-destructive/40 bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent' 
        : isUrgent
        ? 'border-warning/40 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent'
        : 'border-primary/30 bg-gradient-to-br from-primary/5 via-accent/5 to-transparent',
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              'h-10 w-10 rounded-xl flex items-center justify-center',
              isImminent 
                ? 'bg-destructive text-destructive-foreground animate-pulse' 
                : isUrgent
                ? 'bg-warning text-warning-foreground'
                : 'bg-primary/10 text-primary'
            )}>
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">
                {t('sessionPrep.upcomingSession', 'Upcoming Session')}
              </CardTitle>
              <p className={cn(
                'text-sm font-medium',
                isImminent ? 'text-destructive' : isUrgent ? 'text-warning' : 'text-muted-foreground'
              )}>
                {getTimeLabel()}
              </p>
            </div>
          </div>
          <Button 
            variant={isUrgent ? 'default' : 'outline'} 
            size="sm"
            onClick={() => navigate(`/workspace/${workspace.id}?tab=agenda`)}
            className={cn(isUrgent && 'shadow-md', 'gap-1.5')}
          >
            {t('sessionPrep.prepare', 'Prepare')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Startup Info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border">
          <Avatar className="h-12 w-12 rounded-xl ring-1 ring-border/50">
            <AvatarImage src={workspace.startup?.logo_url || undefined} className="object-cover" />
            <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-semibold">
              {workspace.startup?.name?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{workspace.startup?.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <HealthBadge score={health as HealthScore | null} size="sm" />
              <StageBadge stage={workspace.stage} size="sm" />
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-muted/50">
            <p className="text-lg font-bold">{workspace.pendingActionsCount}</p>
            <p className="text-xs text-muted-foreground">{t('sessionPrep.pending', 'Pending')}</p>
          </div>
          <div className="p-2 rounded-xl bg-muted/50">
            <p className={cn('text-lg font-bold', workspace.overdueActionsCount > 0 && 'text-destructive')}>
              {workspace.overdueActionsCount}
            </p>
            <p className="text-xs text-muted-foreground">{t('common.overdue', 'Overdue')}</p>
          </div>
          <div className="p-2 rounded-xl bg-muted/50">
            <p className="text-lg font-bold flex items-center justify-center gap-1">
              {workspace.hasCurrentMonthKpi ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertCircle className="h-4 w-4 text-warning" />
              )}
            </p>
            <p className="text-xs text-muted-foreground">{t('sessionPrep.kpis', 'KPIs')}</p>
          </div>
        </div>

        {/* Prep: Read vs Do — clear delineation */}
        {(readItems.length > 0 || doItems.length > 0) && (
          <>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* What to READ */}
              {readItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <BookOpen className="h-3.5 w-3.5" />
                    {t('sessionPrep.toRead', 'To Review')}
                  </div>
                  <ul className="space-y-1.5">
                    {readItems.map((item, idx) => {
                      const Icon = item.icon;
                      return (
                        <li key={idx} className={cn(
                          'flex items-center gap-2 text-sm p-2 rounded-lg',
                          item.priority === 'high' && 'bg-destructive/5 text-destructive',
                          item.priority === 'medium' && 'bg-amber-500/5 text-amber-700 dark:text-amber-400',
                          item.priority === 'low' && 'bg-muted/50 text-muted-foreground'
                        )}>
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-xs">{item.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* What to DO */}
              {doItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" />
                    {t('sessionPrep.toDo', 'To Discuss')}
                  </div>
                  <ul className="space-y-1.5">
                    {doItems.map((item, idx) => {
                      const Icon = item.icon;
                      return (
                        <li key={idx} className={cn(
                          'flex items-center gap-2 text-sm p-2 rounded-lg',
                          item.priority === 'high' && 'bg-destructive/5 text-destructive',
                          item.priority === 'medium' && 'bg-amber-500/5 text-amber-700 dark:text-amber-400',
                          item.priority === 'low' && 'bg-muted/50 text-muted-foreground'
                        )}>
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-xs">{item.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* Last Session Reference */}
        {workspace.lastSession && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>{t('sessionPrep.lastSession', 'Last session')}: </span>
              <span className="font-medium text-foreground">{workspace.lastSession.title}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
