import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Building2, AlertTriangle, Calendar, ArrowRight, CheckCircle2, Clock, ShieldCheck, UserCog } from 'lucide-react';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

interface CockpitPortfolioOverviewProps {
  workspaces: WorkspaceWithDetails[];
}

export function CockpitPortfolioOverview({ workspaces }: CockpitPortfolioOverviewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [onlyStartupPortugal, setOnlyStartupPortugal] = useState(false);

  if (workspaces.length === 0) {
    return null;
  }

  const healthColorMap: Record<string, string> = {
    critical: 'bg-destructive text-destructive-foreground',
    at_risk: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    healthy: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  };

  const healthLabelMap: Record<string, string> = {
    critical: t('health.critical', { defaultValue: 'Crítico' }),
    at_risk: t('health.atRisk', { defaultValue: 'Em Risco' }),
    healthy: t('health.healthy', { defaultValue: 'Saudável' }),
  };

  const startupPortugalCount = useMemo(
    () => workspaces.filter(w => w.startup?.has_startup_portugal_status === true).length,
    [workspaces],
  );

  const filtered = useMemo(
    () => onlyStartupPortugal
      ? workspaces.filter(w => w.startup?.has_startup_portugal_status === true)
      : workspaces,
    [workspaces, onlyStartupPortugal],
  );

  const sorted = [...filtered].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, at_risk: 1, healthy: 2 };
    const aScore = order[a.health_score || 'healthy'] ?? 2;
    const bScore = order[b.health_score || 'healthy'] ?? 2;
    return aScore - bScore;
  });

  const criticalCount = filtered.filter(w => w.health_score === 'critical').length;
  const atRiskCount = filtered.filter(w => w.health_score === 'at_risk').length;
  const overdueTotal = filtered.reduce((sum, w) => sum + w.overdueActionsCount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            {t('staffCockpit.myPortfolio', { defaultValue: 'O Meu Portfólio' })}
            <Badge variant="secondary" className="ml-1 text-xs">{filtered.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="cockpit-only-sp"
                checked={onlyStartupPortugal}
                onCheckedChange={setOnlyStartupPortugal}
                disabled={startupPortugalCount === 0}
              />
              <Label
                htmlFor="cockpit-only-sp"
                className="text-xs cursor-pointer flex items-center gap-1"
                title={t('staffCockpit.onlyStartupPortugalHint', { defaultValue: 'Mostrar apenas startups com estatuto Startup Portugal ativo' })}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                {t('staffCockpit.onlyStartupPortugal', { defaultValue: 'Apenas Startup Portugal' })}
                <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                  {startupPortugalCount}
                </Badge>
              </Label>
            </div>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/my-workspaces')}>
              {t('common.viewAll', { defaultValue: 'Ver Todas' })}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('staffCockpit.portfolioDesc', { defaultValue: 'Gestão aprofundada das startups que acompanha. Para triagem diária, use a Fila de Trabalho.' })}
        </p>
        {(criticalCount > 0 || atRiskCount > 0 || overdueTotal > 0) && (
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 text-destructive font-medium">
                <AlertTriangle className="h-3 w-3" /> {criticalCount} {t('health.critical', { defaultValue: 'crítico(s)' })}
              </span>
            )}
            {atRiskCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-3 w-3" /> {atRiskCount} {t('health.atRisk', { defaultValue: 'em risco' })}
              </span>
            )}
            {overdueTotal > 0 && (
              <span className="flex items-center gap-1 font-medium">
                {overdueTotal} {t('staffCockpit.overdueActions', { defaultValue: 'ações atrasadas' })}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t('staffCockpit.noStartupPortugalInPortfolio', { defaultValue: 'Nenhuma startup do seu portfólio tem o estatuto Startup Portugal ativo.' })}
          </p>
        ) : (
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {sorted.slice(0, 15).map((ws) => {
              const health = ws.health_score || 'healthy';
              const hasSp = ws.startup?.has_startup_portugal_status === true;
              return (
                <button
                  key={ws.id}
                  onClick={() => navigate(`/workspace/${ws.id}`)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left group"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    {ws.startup?.logo_url && <AvatarImage src={ws.startup.logo_url} />}
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {ws.startup?.name?.slice(0, 2).toUpperCase() || '??'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {ws.startup?.name || t('common.unknown', { defaultValue: 'Desconhecido' })}
                      </span>
                      {hasSp && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 shrink-0 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                          title={t('ecosystem.startupPortugalBadge', { defaultValue: 'Estatuto Startup Portugal' })}
                        >
                          <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                          SP
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${healthColorMap[health] || ''}`}>
                        {healthLabelMap[health] || health}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      {ws.program && <span>{ws.program.name}</span>}
                      {ws.lastSession?.scheduled_at ? (
                        <span className="flex items-center gap-0.5" title={t('staffCockpit.lastSession', { defaultValue: 'Última sessão' })}>
                          <Clock className="h-2.5 w-2.5" />
                          {format(parseISO(ws.lastSession.scheduled_at), 'dd MMM', { locale: pt })}
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-muted-foreground/50 italic">
                          <Clock className="h-2.5 w-2.5" />
                          {t('staffCockpit.noSessions', { defaultValue: 'Sem sessões' })}
                        </span>
                      )}
                      {ws.nextMeetingDate && (
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {format(parseISO(ws.nextMeetingDate), 'dd MMM', { locale: pt })}
                        </span>
                      )}
                      {ws.overdueActionsCount > 0 && (
                        <span className="text-destructive font-medium">
                          {ws.overdueActionsCount} {t('staffCockpit.overdue', { defaultValue: 'atrasada(s)' })}
                        </span>
                      )}
                      {ws.overdueActionsCount === 0 && ws.pendingActionsCount === 0 && (
                        <span className="flex items-center gap-0.5 text-emerald-600">
                          <CheckCircle2 className="h-2.5 w-2.5" /> {t('staffCockpit.upToDate', { defaultValue: 'Em dia' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
            {sorted.length > 15 && (
              <p className="text-xs text-center text-muted-foreground py-2">
                +{sorted.length - 15} {t('staffCockpit.moreStartups', { defaultValue: 'mais startups' })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
