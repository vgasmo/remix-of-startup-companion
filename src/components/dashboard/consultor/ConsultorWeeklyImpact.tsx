import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Target, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ConsultorWeeklyImpactProps {
  /** RC13 L1-8: completed sessions this week; null when unavailable (shown as —, never 0). */
  sessionsCount: number | null;
  overdueCount: number;
  contractedCount: number;
}

export const ConsultorWeeklyImpact = memo(function ConsultorWeeklyImpact({ sessionsCount, overdueCount, contractedCount }: ConsultorWeeklyImpactProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t('consultor.weeklyImpact.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold">{sessionsCount ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              {t('consultor.weeklyImpact.sessionsCompleted')}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold">{overdueCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('consultor.weeklyImpact.overdueActions')}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-health-healthy/10">
            <p className="text-2xl font-bold text-health-healthy">{contractedCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('consultor.weeklyImpact.leadsConverted')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

interface ConsultorDataAlertsProps {
  dataAlerts: { type: string; count: number; message: string }[];
}

export const ConsultorDataAlerts = memo(function ConsultorDataAlerts({ dataAlerts }: ConsultorDataAlertsProps) {
  const { t } = useTranslation();

  if (dataAlerts.length === 0) return null;

  return (
    <Card className="border-health-at-risk/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-health-at-risk" />
          {t('consultor.dataQuality.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {dataAlerts.map((alert, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-health-at-risk/5">
              <div className="flex items-center gap-2">
                {alert.type === 'kpi' ? (
                  <TrendingUp className="h-4 w-4 text-health-at-risk" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-health-at-risk" />
                )}
                <span className="text-sm">{alert.message}</span>
              </div>
              <Badge variant="outline" className="text-health-at-risk border-health-at-risk/30">
                {alert.count}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
