import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle, ExternalLink, RefreshCw, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAllActiveAlerts, useResolveAlert, useRecomputeAlerts, getAlertCTA, getSeverityConfig, getRuleTypeLabel } from '@/hooks/useWorkspaceAlerts';
import { useState } from 'react';

export function AlertsPanel() {
  const { t } = useTranslation();
  const { data: alerts, isLoading } = useAllActiveAlerts();
  const resolveAlert = useResolveAlert();
  const recompute = useRecomputeAlerts();
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const filteredAlerts = alerts?.filter(alert => 
    severityFilter === 'all' || alert.severity === severityFilter
  ) || [];

  const criticalCount = alerts?.filter(a => a.severity === 'critical').length || 0;
  const warningCount = alerts?.filter(a => a.severity === 'warning').length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('alerts.activeAlerts', 'Active Alerts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={criticalCount > 0 ? 'border-warning/40' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${criticalCount > 0 ? 'text-destructive' : 'text-warning'}`} />
            <CardTitle>{t('alerts.activeAlerts', 'Active Alerts')}</CardTitle>
            <div className="flex gap-1 ml-2">
              {criticalCount > 0 && (
                <Badge variant="destructive">{criticalCount}</Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="outline" className="border-warning text-warning">{warningCount}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[130px] h-8">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                <SelectItem value="critical">🔴 {t('alerts.critical', 'Critical')}</SelectItem>
                <SelectItem value="warning">🟠 {t('alerts.warning', 'Warning')}</SelectItem>
                <SelectItem value="info">🔵 {t('alerts.info', 'Info')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recompute.mutate()}
              disabled={recompute.isPending} loading={recompute.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${recompute.isPending ? 'animate-spin' : ''}`} />
              {t('alerts.recalculate', 'Recalculate')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success opacity-50" />
            <p className="font-medium">{t('alerts.noActiveAlerts', 'No active alerts')}</p>
            <p className="text-sm">{t('alerts.allOnTrack', 'All startups are on track!')}</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredAlerts.map(alert => {
              const severityConfig = getSeverityConfig(alert.severity);
              const cta = alert.workspace?.id ? getAlertCTA(alert.rule_type, alert.workspace.id) : null;

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${
                    alert.severity === 'critical' 
                      ? 'bg-muted/50 border-warning/40'
                      : alert.severity === 'warning'
                      ? 'bg-muted/30 border-border'
                      : 'bg-muted/20 border-border/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Startup Avatar */}
                    <Link to={`/workspace/${alert.workspace?.id}`}>
                      <Avatar className="h-10 w-10 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-sm font-semibold">
                          {alert.workspace?.startup?.name?.slice(0, 2).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Link 
                          to={`/workspace/${alert.workspace?.id}`}
                          className="font-medium text-sm hover:underline truncate"
                        >
                          {alert.workspace?.startup?.name || 'Unknown'}
                        </Link>
                        <Badge className={severityConfig.color} variant="secondary">
                          {severityConfig.icon} {getRuleTypeLabel(alert.rule_type)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.reason}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {alert.workspace?.program?.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {cta && (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={cta.href}>
                            {cta.label}
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveAlert.mutate(alert.id)}
                        disabled={resolveAlert.isPending} loading={resolveAlert.isPending}
                      >
                        <CheckCircle className="h-4 w-4 text-success" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
