import { useTranslation } from 'react-i18next';
import { 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  Target, 
  MessageSquare,
  Lightbulb,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessionPrep } from '@/hooks/useSessionPrep';
import { useWorkspaceHealth } from '@/hooks/useHealthScore';
import { useWorkspaceAlerts } from '@/hooks/useWorkspaceAlerts';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';

interface RoleSpecificPrepCardProps {
  sessionId: string;
  workspaceId: string;
}

/**
 * Shows different session prep content based on user role:
 * - Founders: Agenda, goals, questions to ask, action items to review
 * - Consultants: Health trends, risks, KPI analysis, recommended focus areas
 */
export function RoleSpecificPrepCard({ sessionId, workspaceId }: RoleSpecificPrepCardProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { isAdmin, isConsultor } = useAuth();
  const { data: prepData, isLoading: prepLoading } = useSessionPrep(sessionId, workspaceId);
  const { data: healthData, isLoading: healthLoading } = useWorkspaceHealth(workspaceId);
  const { data: alerts } = useWorkspaceAlerts(workspaceId);

  const isStaff = isAdmin || isConsultor;
  const isLoading = prepLoading || healthLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  if (!prepData) return null;

  // Consultant/Admin prep view - focus on health, risks, data analysis
  if (isStaff) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('sessionPrep.consultantView', 'Consultant Prep')}</CardTitle>
          </div>
          <CardDescription>
            {t('sessionPrep.consultantViewDesc', 'Key insights and focus areas for this session')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Health Overview */}
          {healthData && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t('sessionPrep.healthOverview', 'Health Overview')}
              </h4>
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className={cn(
                  "text-2xl font-bold",
                  healthData.health_score === 'critical' && "text-destructive",
                  healthData.health_score === 'at_risk' && "text-[hsl(var(--warning))]",
                  (healthData.health_score === 'healthy' || healthData.health_score === 'thriving') && "text-[hsl(var(--success))]"
                )}>
                  {healthData.health_score_numeric ?? '—'}%
                </div>
                <div className="flex-1">
                  <Badge variant={healthData.health_score === 'healthy' || healthData.health_score === 'thriving' ? 'default' : 'destructive'}>
                    {t(`health.levels.${healthData.health_score || 'unknown'}`)}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Active Alerts / Risks */}
          {alerts && alerts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2 text-[hsl(var(--warning))]">
                <AlertTriangle className="h-4 w-4" />
                {t('sessionPrep.activeAlerts', 'Active Alerts')} ({alerts.length})
              </h4>
              <div className="space-y-1.5">
                {alerts.slice(0, 3).map((alert, idx) => (
                  <div key={idx} className="p-2 rounded bg-[hsl(var(--warning))]/10 text-xs">
                    <span className="font-medium">{alert.rule_type}</span>
                    {alert.reason && <span className="text-muted-foreground ml-1">- {alert.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI Trends Summary */}
          {prepData.recentKpis.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                {t('sessionPrep.kpiTrends', 'KPI Trends')}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {prepData.recentKpis.slice(0, 4).map((kpi) => (
                  <div key={kpi.name} className="p-2 rounded bg-muted/30 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-muted-foreground">{kpi.name}</span>
                      {kpi.trend && (
                        <Badge variant={kpi.trend === 'up' ? 'default' : kpi.trend === 'down' ? 'destructive' : 'secondary'} className="text-xs">
                          {kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→'}
                        </Badge>
                      )}
                    </div>
                    <div className="font-semibold mt-1">
                      {kpi.currentValue?.toLocaleString() ?? '—'}
                      {kpi.unit && <span className="text-muted-foreground ml-1">{kpi.unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Focus Areas */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-[hsl(var(--warning))]" />
              {t('sessionPrep.recommendedFocus', 'Recommended Focus')}
            </h4>
            <ul className="space-y-1 text-xs">
              {prepData.pendingActions.filter(a => a.isOverdue).length > 0 && (
                <li className="flex items-center gap-2 text-destructive">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('sessionPrep.reviewOverdueActions', { defaultValue: 'Rever {{count}} ações em atraso', count: prepData.pendingActions.filter(a => a.isOverdue).length })}
                </li>
              )}
              {prepData.milestones.filter(m => m.isOverdue).length > 0 && (
                <li className="flex items-center gap-2 text-[hsl(var(--warning))]">
                  <Target className="h-3 w-3" />
                  {t('sessionPrep.discussDelayedMilestones', { defaultValue: 'Discutir {{count}} milestones em atraso', count: prepData.milestones.filter(m => m.isOverdue).length })}
                </li>
              )}
              {healthData && (healthData.health_score_numeric ?? 100) < 60 && (
                <li className="flex items-center gap-2 text-[hsl(var(--warning))]">
                  <Activity className="h-3 w-3" />
                  {t('sessionPrep.addressHealthScore', { defaultValue: 'Abordar preocupações de saúde ({{score}}%)', score: healthData.health_score_numeric })}
                </li>
              )}
              {prepData.recentKpis.filter(k => k.trend === 'down').length > 0 && (
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3" />
                  {t('sessionPrep.exploreDecliningKpis', { defaultValue: 'Explorar KPIs em declínio: {{kpis}}', kpis: prepData.recentKpis.filter(k => k.trend === 'down').map(k => k.name).join(', ') })}
                </li>
              )}
            </ul>
          </div>

          {/* Previous Session Notes */}
          {prepData.previousSessions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('sessionPrep.lastSessionNotes', 'Last Session Notes')}
              </h4>
              <div className="p-2 rounded bg-muted/30 text-xs">
                <div className="font-medium mb-1">
                  {prepData.previousSessions[0].title} ({format(new Date(prepData.previousSessions[0].scheduled_at), 'MMM d', { locale: dateLocale })})
                </div>
                {prepData.previousSessions[0].ai_summary ? (
                  <p className="text-muted-foreground line-clamp-3">{prepData.previousSessions[0].ai_summary}</p>
                ) : prepData.previousSessions[0].decisions ? (
                  <p className="text-muted-foreground line-clamp-2">
                    <span className="font-medium">{t('sessionPrep.decisions', { defaultValue: 'Decisões' })}:</span> {prepData.previousSessions[0].decisions}
                  </p>
                ) : (
                  <p className="text-muted-foreground italic">{t('sessionPrep.noSummaryAvailable', { defaultValue: 'Sem resumo disponível' })}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Founder prep view - focus on agenda, questions, action items
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{t('sessionPrep.founderView', 'Session Prep')}</CardTitle>
        </div>
        <CardDescription>
          {t('sessionPrep.founderViewDesc', 'Prepare for your upcoming session')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Session Agenda */}
        {prepData.session.agenda && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t('sessionPrep.agenda', 'Agenda')}
            </h4>
            <div className="p-3 rounded-lg bg-muted/50 text-sm whitespace-pre-wrap">
              {prepData.session.agenda}
            </div>
          </div>
        )}

        {/* Questions to Ask */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {t('sessionPrep.questionsToAsk', 'Questions to Consider')}
          </h4>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2 p-2 rounded bg-muted/30">
              <span className="text-primary">•</span>
              {t('sessionPrep.questionBlockers', { defaultValue: 'Que bloqueios encontrou esta semana/mês?' })}
            </li>
            <li className="flex items-start gap-2 p-2 rounded bg-muted/30">
              <span className="text-primary">•</span>
              {t('sessionPrep.questionDecisions', { defaultValue: 'Que decisões precisa de ajuda para tomar?' })}
            </li>
            <li className="flex items-start gap-2 p-2 rounded bg-muted/30">
              <span className="text-primary">•</span>
              {t('sessionPrep.questionMetrics', { defaultValue: 'Que métricas chave gostaria de discutir?' })}
            </li>
          </ul>
        </div>

        {/* Action Items to Review */}
        {prepData.pendingActions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {t('sessionPrep.actionsToReview', 'Actions to Review')} ({prepData.pendingActions.length})
            </h4>
            <div className="space-y-1.5">
              {prepData.pendingActions.slice(0, 4).map((action) => (
                <div key={action.id} className={cn(
                  "flex items-center justify-between p-2 rounded text-xs",
                  action.isOverdue ? "bg-destructive/10" : "bg-muted/30"
                )}>
                  <span className="truncate">{action.title}</span>
                  {action.isOverdue && (
                    <Badge variant="destructive" className="text-xs">{t('sessionPrep.overdue', { defaultValue: 'Atrasado' })}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Milestones */}
        {prepData.milestones.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              {t('sessionPrep.upcomingMilestones', 'Upcoming Milestones')}
            </h4>
            <div className="space-y-1.5">
              {prepData.milestones.slice(0, 3).map((milestone) => (
                <div key={milestone.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                  <span className="truncate">{milestone.title}</span>
                  {milestone.target_date && (
                    <span className={cn(
                      "text-muted-foreground",
                      milestone.isOverdue && "text-destructive"
                    )}>
                      {format(new Date(milestone.target_date), 'MMM d', { locale: dateLocale })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
