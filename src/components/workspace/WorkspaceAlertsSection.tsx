import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle, EyeOff, ExternalLink, Info, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkspaceAlerts, useResolveAlert, useIgnoreAlert, getAlertCTA, getSeverityConfig, getRuleTypeLabel } from '@/hooks/useWorkspaceAlerts';
import { useAuth } from '@/contexts/AuthContext';

interface WorkspaceAlertsSectionProps {
  workspaceId: string;
  canManage?: boolean;
}

export function WorkspaceAlertsSection({ workspaceId, canManage = false }: WorkspaceAlertsSectionProps) {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const isStaff = roles.includes('admin') || roles.includes('consultor');
  const { data: alerts, isLoading } = useWorkspaceAlerts(workspaceId);
  const resolveAlert = useResolveAlert();
  const ignoreAlert = useIgnoreAlert();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('alerts.title', 'Alerts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />
            {t('alerts.title', 'Alerts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 text-[hsl(var(--success))] opacity-50" />
            <p className="font-medium">{t('alerts.noActiveAlerts', 'No active alerts')}</p>
            <p className="text-sm">{t('alerts.everythingOnTrack', 'Everything is on track!')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  return (
    <Card className={criticalCount > 0 ? 'border-destructive/30' : warningCount > 0 ? 'border-[hsl(var(--warning))]/30' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${criticalCount > 0 ? 'text-destructive' : 'text-[hsl(var(--warning))]'}`} />
            {t('alerts.title', 'Alerts')}
          </CardTitle>
          <div className="flex gap-1">
            {criticalCount > 0 && (
              <Badge variant="destructive">{criticalCount} {t('alerts.critical', 'critical')}</Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]">{warningCount} {t('alerts.warning', 'warning')}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map(alert => {
            const severityConfig = getSeverityConfig(alert.severity);
            const cta = getAlertCTA(alert.rule_type, workspaceId);
            const evidence = alert.evidence_json as Record<string, unknown>;

            return (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border ${
                  alert.severity === 'critical' 
                    ? 'bg-destructive/10 border-destructive/30 '
                    : alert.severity === 'warning'
                    ? 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30 '
                    : 'bg-[hsl(var(--info))]/10 border-[hsl(var(--info))]/30 '
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={severityConfig.color} variant="secondary">
                        {severityConfig.icon} {getRuleTypeLabel(alert.rule_type)}
                      </Badge>
                    </div>
                    <p className="font-medium text-sm">{alert.reason}</p>
                    
                    {/* Evidence details */}
                    {Object.keys(evidence).length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="flex items-center gap-1 text-xs text-muted-foreground mt-1 hover:text-foreground">
                            <Info className="h-3 w-3" />
                            {t('alerts.viewDetails', 'View details')}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <pre className="text-xs whitespace-pre-wrap">
                            {JSON.stringify(evidence, null, 2)}
                          </pre>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* CTA Button */}
                    {cta && (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={cta.href}>
                          {cta.label}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    )}

                    {/* Resolve/Ignore (staff only) */}
                    {isStaff && (canManage || true) && (
                      <div className="flex gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={()=> resolveAlert.mutate(alert.id)}
                              disabled={resolveAlert.isPending}
                             aria-label={t('common.confirm')}>
                              <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('alerts.markResolved', 'Mark as resolved')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={()=> ignoreAlert.mutate(alert.id)}
                              disabled={ignoreAlert.isPending}
                             aria-label={t('common._iconHide')}>
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('alerts.ignoreAlert', 'Ignore alert')}</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
