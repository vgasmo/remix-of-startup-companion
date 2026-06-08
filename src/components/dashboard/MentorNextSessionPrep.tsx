import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, isToday, isTomorrow, differenceInHours } from 'date-fns';
import { 
  Calendar, 
  Clock, 
  ArrowRight,
  AlertCircle,
  Target,
  Activity,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { HealthScore } from '@/types/database';

interface MentorNextSessionPrepProps {
  workspaces: WorkspaceWithDetails[];
}

/**
 * Hero card showing the next upcoming session with prep context
 * Shows when a session is within 48 hours (expanded from 24h)
 */
export function MentorNextSessionPrep({ workspaces }: MentorNextSessionPrepProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Find the next session within 24 hours
  const nextSession = useMemo(() => {
    const now = new Date();
    
    for (const workspace of workspaces) {
      if (workspace.nextMeetingDate) {
        const meetingDate = new Date(workspace.nextMeetingDate);
        const hoursUntil = differenceInHours(meetingDate, now);
        
        if (hoursUntil >= 0 && hoursUntil <= 48) {
          return {
            workspace,
            meetingDate,
            hoursUntil,
          };
        }
      }
    }
    return null;
  }, [workspaces]);

  if (!nextSession) return null;

  const { workspace, meetingDate, hoursUntil } = nextSession;
  const health = workspace.health_score_override || workspace.health_score;
  const isUrgent = hoursUntil <= 2;

  const getTimeLabel = () => {
    if (isToday(meetingDate)) {
      return `${t('common.today')} ${format(meetingDate, 'HH:mm')}`;
    }
    if (isTomorrow(meetingDate)) {
      return `${t('common.tomorrow', { defaultValue: 'Tomorrow' })} ${format(meetingDate, 'HH:mm')}`;
    }
    return format(meetingDate, 'dd MMM, HH:mm');
  };

  return (
    <Card className={`overflow-hidden ${isUrgent ? 'border-warning/50 bg-warning/5 dark:bg-warning/5' : 'border-primary/20 bg-primary/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Left: Startup info */}
          <Avatar className="h-12 w-12 rounded-xl shrink-0">
            <AvatarImage src={workspace.startup?.logo_url || undefined} className="object-cover" />
            <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-semibold">
              {workspace.startup?.name?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 mb-1">
              {isUrgent && (
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              )}
              <span className="text-xs font-medium text-primary uppercase tracking-wide">
                {t('mentor.nextSession', 'Next Session')}
              </span>
            </div>

            {/* Startup name + health */}
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold truncate">{workspace.startup?.name}</h3>
              <HealthBadge score={health as HealthScore | null} size="sm" />
            </div>

            {/* Quick prep insights */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getTimeLabel()}
              </span>
              {workspace.pendingActionsCount > 0 && (
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {workspace.pendingActionsCount} {t('mentor.pendingActionsCount', 'actions')}
                </span>
              )}
              {workspace.overdueActionsCount > 0 && (
                <Badge variant="destructive" className="text-xs py-0 px-1.5">
                  {workspace.overdueActionsCount} {t('common.overdue')}
                </Badge>
              )}
            </div>

            {/* CTA */}
            <Button 
              size="sm" 
              onClick={() => navigate(`/workspace/${workspace.id}?tab=agenda`)}
              className="gap-1.5"
            >
              {t('mentor.prepareSession', 'Prepare')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}