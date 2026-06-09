import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Download, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface EcosystemHeatmapProps {
  workspaces: WorkspaceWithDetails[];
  onExport?: () => void;
}

const STAGES = ['idea', 'mvp', 'validation', 'scaling', 'growth'] as const;
const HEALTH_LEVELS = ['thriving', 'healthy', 'stable', 'at_risk', 'critical'] as const;

const healthColors: Record<string, string> = {
  thriving: 'bg-[hsl(var(--success))]/80 hover:bg-[hsl(var(--success))]/10',
  healthy: 'bg-[hsl(var(--success))]/70 hover:bg-[hsl(var(--success))]',
  stable: 'bg-[hsl(var(--warning))]/60 hover:bg-[hsl(var(--warning))]',
  at_risk: 'bg-[hsl(var(--warning))]/70 hover:bg-[hsl(var(--warning))]/10',
  critical: 'bg-destructive/80 hover:bg-destructive',
};

const healthLabels: Record<string, string> = {
  thriving: 'Thriving',
  healthy: 'Healthy',
  stable: 'Stable',
  at_risk: 'At Risk',
  critical: 'Critical',
};

export const EcosystemHeatmap = memo(function EcosystemHeatmap({ workspaces, onExport }: EcosystemHeatmapProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const grid = useMemo(() => {
    const matrix: Record<string, Record<string, WorkspaceWithDetails[]>> = {};
    STAGES.forEach(stage => {
      matrix[stage] = {};
      HEALTH_LEVELS.forEach(health => {
        matrix[stage][health] = [];
      });
    });

    workspaces.forEach(ws => {
      const stage = (ws.stage || 'idea') as string;
      const health = (ws.health_score_override || ws.health_score || 'stable') as string;
      const s = STAGES.includes(stage as any) ? stage : 'idea';
      const h = HEALTH_LEVELS.includes(health as any) ? health : 'stable';
      matrix[s]?.[h]?.push(ws);
    });

    return matrix;
  }, [workspaces]);

  const maxCount = useMemo(() => {
    let max = 1;
    STAGES.forEach(s => HEALTH_LEVELS.forEach(h => {
      max = Math.max(max, grid[s]?.[h]?.length || 0);
    }));
    return max;
  }, [grid]);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{t('admin.ecosystemHeatmap', { defaultValue: 'Ecosystem Heatmap' })}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('admin.heatmapSubtitle', { defaultValue: 'Stage × Health distribution' })}</p>
          </div>
        </div>
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport} className="gap-2 text-xs">
            <Download className="h-3.5 w-3.5" />
            {t('admin.exportAnalytics', { defaultValue: 'Export' })}
          </Button>
        )}
      </CardHeader>
      <CardContent className="pb-4">
        <TooltipProvider delayDuration={200}>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              {/* Column headers */}
              <div className="grid grid-cols-[100px_repeat(5,1fr)] gap-1.5 mb-1.5">
                <div />
                {STAGES.map(stage => (
                  <div key={stage} className="text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(`stages.${stage}`, stage)}
                    </span>
                  </div>
                ))}
              </div>
              {/* Rows */}
              {HEALTH_LEVELS.map((health, rowIdx) => (
                <div key={health} className="grid grid-cols-[100px_repeat(5,1fr)] gap-1.5 mb-1.5">
                  <div className="flex items-center justify-end pr-2">
                    <span className="text-[10px] font-medium text-muted-foreground capitalize">
                      {t(`health.levels.${health}`, healthLabels[health])}
                    </span>
                  </div>
                  {STAGES.map((stage, colIdx) => {
                    const items = grid[stage]?.[health] || [];
                    const count = items.length;
                    const intensity = count / maxCount;
                    return (
                      <Tooltip key={`${stage}-${health}`}>
                        <TooltipTrigger asChild>
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: (rowIdx * 5 + colIdx) * 0.03, duration: 0.3 }}
                            className={cn(
                              'aspect-square rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200',
                              'border border-border/30',
                              count > 0 ? healthColors[health] : 'bg-muted/30',
                              count > 0 && 'shadow-sm hover:shadow-md hover:scale-105',
                            )}
                            style={{ opacity: count > 0 ? Math.max(0.4, intensity) : 0.15 }}
                            onClick={() => count > 0 && navigate(`/ecosystem?stage=${stage}&health=${health}`)}
                          >
                            {count > 0 && (
                              <span className="text-sm font-bold text-white drop-shadow-sm">{count}</span>
                            )}
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px]">
                          <p className="font-semibold text-xs">{t(`stages.${stage}`, stage)} × {t(`health.levels.${health}`, healthLabels[health])}</p>
                          <p className="text-xs text-muted-foreground">
                            {count} {count === 1 ? 'startup' : 'startups'}
                          </p>
                          {items.slice(0, 3).map(ws => (
                            <p key={ws.id} className="text-xs truncate">• {ws.startup?.name || 'Unnamed'}</p>
                          ))}
                          {count > 3 && <p className="text-xs text-muted-foreground">+{count - 3} more</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t">
          <Zap className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {HEALTH_LEVELS.map(h => (
              <div key={h} className="flex items-center gap-1">
                <div className={cn('h-2.5 w-2.5 rounded-sm', healthColors[h])} style={{ opacity: 0.8 }} />
                <span className="text-[10px] text-muted-foreground capitalize">{t(`health.levels.${h}`, healthLabels[h])}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
