import { memo, useMemo, useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { Sparkline } from '@/components/ui/Sparkline';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Table, Calendar, MessageSquare, Plus, ArrowUpDown, ArrowRight } from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { HealthScore } from '@/types/database';

interface PortfolioPerformanceTableProps {
  workspaces: WorkspaceWithDetails[];
  onLogSession?: (workspaceId: string) => void;
  onAddNote?: (workspaceId: string) => void;
}

type SortKey = 'name' | 'health' | 'lastInteraction' | 'strength';

function getInteractionStrength(ws: WorkspaceWithDetails): { level: 'hot' | 'warm' | 'cold' | 'frozen'; days: number } {
  const now = new Date();
  const lastDate = ws.lastSession?.scheduled_at ? new Date(ws.lastSession.scheduled_at) : null;
  const days = lastDate ? differenceInDays(now, lastDate) : 999;
  
  if (days <= 7) return { level: 'hot', days };
  if (days <= 14) return { level: 'warm', days };
  if (days <= 30) return { level: 'cold', days };
  return { level: 'frozen', days };
}

const strengthConfig: Record<string, { label: string; bg: string; text: string }> = {
  hot: { label: 'Hot', bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' },
  warm: { label: 'Warm', bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-400' },
  cold: { label: 'Cold', bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400' },
  frozen: { label: 'Frozen', bg: 'bg-red-500/15', text: 'text-red-700 dark:text-red-400' },
};

const healthOrder: Record<string, number> = { critical: 0, at_risk: 1, stable: 2, healthy: 3, thriving: 4 };
const strengthOrder: Record<string, number> = { frozen: 0, cold: 1, warm: 2, hot: 3 };

export const PortfolioPerformanceTable = memo(function PortfolioPerformanceTable({
  workspaces,
  onLogSession,
  onAddNote,
}: PortfolioPerformanceTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('health');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedWorkspaces = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...workspaces].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * (a.startup?.name || '').localeCompare(b.startup?.name || '');
        case 'health': {
          const aH = healthOrder[a.health_score_override || a.health_score || 'stable'] ?? 2;
          const bH = healthOrder[b.health_score_override || b.health_score || 'stable'] ?? 2;
          return dir * (aH - bH);
        }
        case 'lastInteraction': {
          const aD = a.lastSession?.scheduled_at ? new Date(a.lastSession.scheduled_at).getTime() : 0;
          const bD = b.lastSession?.scheduled_at ? new Date(b.lastSession.scheduled_at).getTime() : 0;
          return dir * (aD - bD);
        }
        case 'strength': {
          const aS = strengthOrder[getInteractionStrength(a).level];
          const bS = strengthOrder[getInteractionStrength(b).level];
          return dir * (aS - bS);
        }
        default:
          return 0;
      }
    });
  }, [workspaces, sortKey, sortAsc]);

  // Generate mock sparkline data from workspace stats
  const getSparklineData = (ws: WorkspaceWithDetails): number[] => {
    const health = ws.health_score_override || ws.health_score || 'stable';
    const base = healthOrder[health] ?? 2;
    // Generate a deterministic-ish sparkline
    const seed = ws.id.charCodeAt(0) + ws.id.charCodeAt(1);
    return Array.from({ length: 7 }, (_, i) => {
      const variation = Math.sin(seed + i * 1.3) * 1.5;
      return Math.max(0, Math.min(4, base + variation));
    });
  };

  const SortButton = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? 'text-primary' : 'opacity-40'}`} />
    </button>
  );

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Table className="h-4 w-4 text-primary" />
            {t('consultor.portfolioTable.title', { defaultValue: 'Portfolio Performance' })}
            <Badge variant="secondary" className="text-xs">{workspaces.length}</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/my-workspaces')}>
            {t('common.viewAll', { defaultValue: 'Ver Todas' })}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_100px_80px_90px_80px_80px] gap-2 px-2 pb-2 border-b border-border/40">
          <SortButton label={t('consultor.portfolioTable.startup', { defaultValue: 'Startup' })} field="name" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('consultor.portfolioTable.stage', { defaultValue: 'Etapa' })}
          </span>
          <SortButton label={t('consultor.portfolioTable.health', { defaultValue: 'Saúde' })} field="health" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('consultor.portfolioTable.trend', { defaultValue: 'Trend' })}
          </span>
          <SortButton label={t('consultor.portfolioTable.lastTouch', { defaultValue: 'Último' })} field="lastInteraction" />
          <SortButton label={t('consultor.portfolioTable.strength', { defaultValue: 'Força' })} field="strength" />
        </div>

        {/* Data rows */}
        <div className="divide-y divide-border/30 max-h-[480px] overflow-y-auto">
          {sortedWorkspaces.map(ws => {
            const health = (ws.health_score_override || ws.health_score || 'stable') as HealthScore;
            const strength = getInteractionStrength(ws);
            const cfg = strengthConfig[strength.level];
            const sparkData = getSparklineData(ws);

            return (
              <div
                key={ws.id}
                className="grid grid-cols-[1fr_100px_80px_90px_80px_80px] gap-2 items-center py-2 px-2 hover:bg-muted/40 cursor-pointer transition-colors group"
                {...clickableProps(() => navigate(`/workspace/${ws.id}`))}
              >
                {/* Startup Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-7 w-7 shrink-0 rounded-md">
                    <AvatarImage src={ws.startup?.logo_url || undefined} />
                    <AvatarFallback className="rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                      {ws.startup?.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium truncate group-hover:text-primary group-hover:underline transition-colors">{ws.startup?.name}</span>
                </div>

                {/* Stage */}
                <Badge variant="outline" className="text-[10px] w-fit">
                  {ws.stage}
                </Badge>

                {/* Health */}
                <HealthBadge score={health} size="sm" />

                {/* Sparkline */}
                <Sparkline data={sparkData} width={70} height={18} />

                {/* Last Interaction */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground">
                      {ws.lastSession?.scheduled_at
                        ? format(parseISO(ws.lastSession.scheduled_at), 'dd MMM', { locale: pt })
                        : '—'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {strength.days < 999
                      ? t('consultor.portfolioTable.daysAgo', { defaultValue: 'Há {{days}} dias', days: strength.days })
                      : t('consultor.portfolioTable.noInteraction', { defaultValue: 'Sem interações' })}
                  </TooltipContent>
                </Tooltip>

                {/* Interaction Strength */}
                <div className="flex items-center gap-1">
                  <Badge className={`text-[10px] px-1.5 py-0 ${cfg.bg} ${cfg.text} border-0`}>
                    {cfg.label}
                  </Badge>
                  {/* Quick actions on hover */}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onLogSession) onLogSession(ws.id);
                            else navigate(`/workspace/${ws.id}?tab=agenda`);
                          }}
                        >
                          <Calendar className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('consultor.portfolioTable.logSession', { defaultValue: 'Agendar sessão' })}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAddNote) onAddNote(ws.id);
                            else navigate(`/workspace/${ws.id}?tab=notes`);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('consultor.portfolioTable.addNote', { defaultValue: 'Adicionar nota' })}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
