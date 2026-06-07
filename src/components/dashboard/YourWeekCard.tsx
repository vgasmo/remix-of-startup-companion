import { useMemo } from 'react';
import { clickableProps } from '@/lib/clickable';

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { isThisWeek, differenceInDays } from 'date-fns';
import { formatWeekdayDate } from '@/lib/dateUtils';
import { 
  Zap,
  Calendar,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Flame,
  ClipboardCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface YourWeekCardProps {
  workspace: WorkspaceWithDetails;
  streakWeeks?: number;
}

interface PriorityItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  urgency: 'high' | 'medium' | 'low';
  action: string;
  tab: string;
}

export function YourWeekCard({ workspace, streakWeeks = 0 }: YourWeekCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // P0: Limit to 2 priorities for less clutter
  const priorities = useMemo<PriorityItem[]>(() => {
    const items: PriorityItem[] = [];

    // 1. Overdue actions (highest priority)
    if (workspace.overdueActionsCount > 0) {
      items.push({
        id: 'overdue',
        label: t('yourWeek.overdueActions', { count: workspace.overdueActionsCount }),
        description: t('yourWeek.overdueActionsDesc'),
        icon: <AlertTriangle className="h-4 w-4" />,
        urgency: 'high',
        action: t('yourWeek.viewActions'),
        tab: 'actions',
      });
    }

    // 2. KPIs need update (important for founder habit)
    if (!workspace.hasCurrentMonthKpi && items.length < 2) {
      items.push({
        id: 'kpis',
        label: t('yourWeek.updateKpis'),
        description: t('yourWeek.kpisThisMonth'),
        icon: <TrendingUp className="h-4 w-4" />,
        urgency: 'medium',
        action: t('yourWeek.addKpis'),
        tab: 'kpis',
      });
    }

    // 3. Pending actions (only if space)
    if (workspace.pendingActionsCount > 0 && items.length < 2) {
      items.push({
        id: 'pending',
        label: t('yourWeek.pendingActions', { count: workspace.pendingActionsCount }),
        description: t('yourWeek.pendingActionsDesc'),
        icon: <Target className="h-4 w-4" />,
        urgency: 'medium',
        action: t('yourWeek.viewActions'),
        tab: 'actions',
      });
    }

    // 4. Upcoming meeting (only if high priority slot available)
    if (workspace.nextMeetingDate && items.length < 2) {
      const meetingDate = new Date(workspace.nextMeetingDate);
      const daysUntil = differenceInDays(meetingDate, new Date());
      if (daysUntil <= 3 && daysUntil >= 0) {
        items.push({
          id: 'meeting',
          label: t('yourWeek.upcomingSession'),
          description: formatWeekdayDate(meetingDate),
          icon: <Calendar className="h-4 w-4" />,
          urgency: daysUntil <= 1 ? 'high' : 'low',
          action: t('yourWeek.prepare'),
          tab: 'agenda',
        });
      }
    }

    // P0: Max 2 priorities for clean UX
    return items.slice(0, 2);
  }, [workspace, t]);

  const primaryAction = priorities[0];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            {t('yourWeek.title')}
          </CardTitle>
          {streakWeeks > 0 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Flame className="h-3 w-3 text-warning" />
              {streakWeeks}w
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Priorities - max 2 */}
        {priorities.length > 0 ? (
          <div className="space-y-2">
            {priorities.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                  item.urgency === 'high'
                    ? 'border-warning/40 bg-warning/5'
                    : item.urgency === 'medium'
                    ? 'border-border bg-muted/30'
                    : 'border-border/50 bg-muted/20'
                }`}
                {...clickableProps(() => navigate(`/workspace/${workspace.id}?tab=${item.tab}`))}
              >

                <div className="flex items-center gap-2.5">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center ${
                    item.urgency === 'high'
                      ? 'bg-warning/15 text-warning'
                      : item.urgency === 'medium'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm leading-tight">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-success/5 border border-success/30">
            <div className="h-8 w-8 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="font-medium text-sm text-success">
                {t('yourWeek.allCaughtUp')}
              </p>
              <p className="text-xs text-success/80">
                {t('yourWeek.greatWork')}
              </p>
            </div>
          </div>
        )}

        {/* Single primary CTA */}
        {primaryAction && (
          <Button 
            className="w-full" 
            size="sm"
            onClick={() => navigate(`/workspace/${workspace.id}?tab=${primaryAction.tab}`)}
          >
            {primaryAction.action}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}