import { memo } from 'react';
import { clickableProps } from '@/lib/clickable';

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface ConsultorHealthMatrixProps {
  workspaces: WorkspaceWithDetails[];
  healthCounts: Record<string, number>;
  total: number;
}

export const ConsultorHealthMatrix = memo(function ConsultorHealthMatrix({ workspaces, healthCounts, total }: ConsultorHealthMatrixProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Card className="p-4 rounded-2xl border-border/60">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('consultor.healthMatrix.title', { defaultValue: 'Matriz de Saúde do Portefólio' })}</p>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/my-workspaces')}>
          {t('common.viewAll')}
        </Button>
      </div>
      {/* Distribution bar */}
      <div className="flex gap-1 h-2.5 rounded-full overflow-hidden bg-muted/50 mb-4">
        {Object.entries(healthCounts).map(([health, count]) => {
          if (count === 0) return null;
          const colors: Record<string, string> = {
            critical: 'bg-health-critical',
            at_risk: 'bg-health-at-risk',
            stable: 'bg-health-stable',
            healthy: 'bg-health-healthy',
            thriving: 'bg-health-thriving',
          };
          const width = (count / total) * 100;
          return (
            <Tooltip key={health}>
              <TooltipTrigger asChild>
                <div 
                  className={`${colors[health]} cursor-pointer transition-opacity hover:opacity-80`}
                  style={{ width: `${width}%`, minWidth: count > 0 ? '8px' : 0 }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <span>{t(`health.levels.${health}`)}: {count}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {/* Startup tiles grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
        {workspaces.slice(0, 24).map(w => {
          const health = (w.health_score_override || w.health_score || 'stable') as string;
          const bgColors: Record<string, string> = {
            critical: 'bg-health-critical',
            at_risk: 'bg-health-at-risk',
            stable: 'bg-health-stable',
            healthy: 'bg-health-healthy',
            thriving: 'bg-health-thriving',
          };
          return (
            <Tooltip key={w.id}>
              <TooltipTrigger asChild>
                <div 
                  className={`h-8 rounded-md cursor-pointer transition-all hover:scale-110 hover:shadow-sm flex items-center justify-center text-[9px] font-bold text-primary-foreground ${bgColors[health] || 'bg-muted'}`}
                  {...clickableProps(() => navigate(`/workspace/${w.id}`), { label: w.startup?.name })}
                >
                  {w.startup?.name?.slice(0, 2).toUpperCase()}
                </div>

              </TooltipTrigger>
              <TooltipContent>
                <span>{w.startup?.name} — {t(`health.levels.${health}`)}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </Card>
  );
});
