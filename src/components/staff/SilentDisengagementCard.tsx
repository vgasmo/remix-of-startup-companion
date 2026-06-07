import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Ghost, ArrowRight, MessageSquare } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface SilentDisengagementCardProps {
  workspaces: WorkspaceWithDetails[];
}

const SILENT_THRESHOLD_DAYS = 15;

export function SilentDisengagementCard({ workspaces }: SilentDisengagementCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const silentStartups = useMemo(() => {
    const now = new Date();
    return workspaces
      .filter(w => {
        const lastSessionDate = w.lastSession?.scheduled_at
          ? new Date(w.lastSession.scheduled_at)
          : null;
        const daysSinceSession = lastSessionDate
          ? differenceInDays(now, lastSessionDate)
          : 999;
        return daysSinceSession >= SILENT_THRESHOLD_DAYS;
      })
      .sort((a, b) => {
        const daysA = a.lastSession?.scheduled_at
          ? differenceInDays(now, new Date(a.lastSession.scheduled_at))
          : 999;
        const daysB = b.lastSession?.scheduled_at
          ? differenceInDays(now, new Date(b.lastSession.scheduled_at))
          : 999;
        return daysB - daysA;
      })
      .slice(0, 8);
  }, [workspaces]);

  if (silentStartups.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ghost className="h-4 w-4 text-warning" />
            {t('staffCockpit.silentDisengagement.title', { defaultValue: 'Disengagement Silencioso' })}
            <Badge variant="outline" className="text-xs border-warning/30 text-warning">
              {silentStartups.length}
            </Badge>
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('staffCockpit.silentDisengagement.desc', {
            defaultValue: 'Startups sem sessões ou notas nos últimos {{days}} dias.',
            days: SILENT_THRESHOLD_DAYS,
          })}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {silentStartups.map(ws => {
            const now = new Date();
            const days = ws.lastSession?.scheduled_at
              ? differenceInDays(now, new Date(ws.lastSession.scheduled_at))
              : null;

            return (
              <button
                key={ws.id}
                onClick={() => navigate(`/workspace/${ws.id}`)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60 transition-colors text-left group"
              >
                <Avatar className="h-7 w-7 shrink-0">
                  {ws.startup?.logo_url && <AvatarImage src={ws.startup.logo_url} />}
                  <AvatarFallback className="text-[10px] bg-warning/10 text-warning">
                    {ws.startup?.name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block group-hover:text-primary group-hover:underline transition-colors">{ws.startup?.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {days
                      ? t('staffCockpit.silentDisengagement.daysAgo', { defaultValue: '{{days}}d sem interação', days })
                      : t('staffCockpit.silentDisengagement.never', { defaultValue: 'Sem sessões registadas' })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/workspace/${ws.id}?tab=agenda`);
                  }}
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  {t('staffCockpit.silentDisengagement.reach', { defaultValue: 'Contactar' })}
                </Button>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
