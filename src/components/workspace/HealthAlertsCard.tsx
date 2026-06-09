import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bell, BellOff, Check, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHealthAlerts, useAcknowledgeAlert, useSnoozeAlert, HealthAlert } from '@/hooks/useHealthHistory';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notify";

interface HealthAlertsCardProps {
  workspaceId: string;
  canManage?: boolean;
  className?: string;
}

export function HealthAlertsCard({ workspaceId, canManage = false, className }: HealthAlertsCardProps) {
  const { t } = useTranslation();
  const { data: alerts, isLoading } = useHealthAlerts(workspaceId);
  const acknowledgeAlert = useAcknowledgeAlert();
  const snoozeAlert = useSnoozeAlert();

  const activeAlerts = alerts?.filter(a => a.status === 'active') || [];
  const recentAlerts = alerts?.slice(0, 5) || [];

  const handleAcknowledge = async (alert: HealthAlert) => {
    try {
      await acknowledgeAlert.mutateAsync({ alertId: alert.id, workspaceId });
      notify.success(t('alerts.acknowledged', 'Alert acknowledged'));
    } catch (error) {
      notify.error(t('alerts.acknowledgeFailed', 'Failed to acknowledge alert'));
    }
  };

  const handleSnooze = async (alert: HealthAlert, days: number) => {
    try {
      await snoozeAlert.mutateAsync({ alertId: alert.id, workspaceId, days });
      notify.success(t('alerts.snoozedDays', 'Alert snoozed for {{days}} days', { days }));
    } catch (error) {
      notify.error(t('alerts.snoozeFailed', 'Failed to snooze alert'));
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t('alerts.healthAlerts', 'Health Alerts')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Calmer alert icons - use amber instead of harsh red for critical
  const getAlertIcon = (alert: HealthAlert) => {
    if (alert.status === 'snoozed') return <BellOff className="h-4 w-4 text-muted-foreground" />;
    if (alert.status === 'acknowledged') return <Check className="h-4 w-4 text-health-healthy" />;
    if (alert.status === 'resolved') return <Check className="h-4 w-4 text-muted-foreground" />;
    if (alert.severity === 'critical') return <AlertTriangle className="h-4 w-4 text-health-at-risk" />;
    return <Bell className="h-4 w-4 text-muted-foreground" />;
  };

  // Softer alert styling - reduce visual intensity
  const getAlertStyles = (alert: HealthAlert) => {
    if (alert.status !== 'active') return 'bg-muted/30 opacity-60';
    if (alert.severity === 'critical') return 'bg-health-at-risk/5 border-health-at-risk/20';
    return 'bg-muted/30 border-border/60';
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            {t('alerts.healthAlerts', 'Health Alerts')}
          </CardTitle>
          {activeAlerts.length > 0 && (
            <Badge variant="secondary" className="text-xs bg-health-at-risk/10 text-health-at-risk">
              {activeAlerts.length} {t('alerts.active', 'active')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {recentAlerts.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Check className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {t('alerts.noRecentAlerts', 'No recent alerts')}
          </div>
        ) : (
          <div className="space-y-2">
            {recentAlerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                  getAlertStyles(alert)
                )}
              >
                {getAlertIcon(alert)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{alert.reason}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {alert.status}
                    </Badge>
                  </div>
                </div>
                {canManage && alert.status === 'active' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('common._iconHistory')}>
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleAcknowledge(alert)}>
                        <Check className="h-4 w-4 mr-2" />
                        {t('alerts.acknowledge', 'Acknowledge')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSnooze(alert, 1)}>
                        <BellOff className="h-4 w-4 mr-2" />
                        {t('alerts.snooze1Day', 'Snooze 1 day')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSnooze(alert, 7)}>
                        <BellOff className="h-4 w-4 mr-2" />
                        {t('alerts.snooze7Days', 'Snooze 7 days')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
