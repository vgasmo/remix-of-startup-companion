import { useState, useMemo } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ChaseActionsButton } from './ChaseActionsButton';
import { Calendar, MessageSquare, ExternalLink, AlertTriangle, Clock, TrendingDown, BarChart3 } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { HealthScore } from '@/types/database';

interface WorkspaceWithDetails {
  id: string;
  startup_id: string;
  program_id: string | null;
  stage: string;
  health_score: number | null;
  health_label: HealthScore | null;
  created_at: string;
  updated_at: string;
  startup?: {
    name: string;
    logo_url?: string | null;
  };
  program?: {
    name: string;
  } | null;
  overdue_actions_count?: number;
  last_session_date?: string | null;
  next_session_date?: string | null;
  top_overdue_action?: string | null;
  missing_kpis_count?: number;
}

interface TriageWorkspaceListProps {
  workspaces: WorkspaceWithDetails[];
  onScheduleSession?: (workspaceId: string) => void;
  onMessage?: (workspaceId: string) => void;
}

type QuickFilter = 'all' | 'no_activity_14d' | 'missing_kpis' | 'overdue_actions' | 'at_risk';

export function TriageWorkspaceList({ 
  workspaces, 
  onScheduleSession,
  onMessage 
}: TriageWorkspaceListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [triageMode, setTriageMode] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  const calculateUrgencyScore = (workspace: WorkspaceWithDetails): number => {
    let score = 0;
    score += (workspace.overdue_actions_count || 0) * 3;
    if (workspace.last_session_date) {
      const daysSince = differenceInDays(new Date(), new Date(workspace.last_session_date));
      score += Math.min(daysSince, 30) * 2;
    } else {
      score += 60;
    }
    score += (workspace.missing_kpis_count || 0) * 2;
    const healthLabel = workspace.health_label?.toLowerCase();
    if (healthLabel === 'critical') score += 25;
    else if (healthLabel === 'at_risk' || healthLabel === 'at risk') score += 15;
    else if (healthLabel === 'needs_attention' || healthLabel === 'needs attention') score += 8;
    return score;
  };

  const filteredAndSortedWorkspaces = useMemo(() => {
    let filtered = [...workspaces];
    switch (quickFilter) {
      case 'no_activity_14d':
        filtered = filtered.filter(w => {
          if (!w.last_session_date) return true;
          return differenceInDays(new Date(), new Date(w.last_session_date)) >= 14;
        });
        break;
      case 'missing_kpis':
        filtered = filtered.filter(w => (w.missing_kpis_count || 0) > 0);
        break;
      case 'overdue_actions':
        filtered = filtered.filter(w => (w.overdue_actions_count || 0) > 0);
        break;
      case 'at_risk':
        filtered = filtered.filter(w => {
          const label = w.health_label?.toLowerCase();
          return label === 'critical' || label === 'at_risk' || label === 'at risk';
        });
        break;
    }
    if (triageMode) {
      filtered.sort((a, b) => calculateUrgencyScore(b) - calculateUrgencyScore(a));
    }
    return filtered;
  }, [workspaces, triageMode, quickFilter]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'dd/MM');
  };

  const getDaysSinceSession = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    return differenceInDays(new Date(), new Date(dateStr));
  };

  // Count items per filter for badges
  const filterCounts = useMemo(() => ({
    no_activity_14d: workspaces.filter(w => !w.last_session_date || differenceInDays(new Date(), new Date(w.last_session_date)) >= 14).length,
    missing_kpis: workspaces.filter(w => (w.missing_kpis_count || 0) > 0).length,
    overdue_actions: workspaces.filter(w => (w.overdue_actions_count || 0) > 0).length,
    at_risk: workspaces.filter(w => { const l = w.health_label?.toLowerCase(); return l === 'critical' || l === 'at_risk' || l === 'at risk'; }).length,
  }), [workspaces]);

  const filters: { key: QuickFilter; label: string; icon?: React.ReactNode; count?: number }[] = [
    { key: 'all', label: t('triage.filters.all', 'All') },
    { key: 'no_activity_14d', label: t('triage.filters.noActivity', 'No activity 14d'), icon: <Clock className="h-3 w-3" />, count: filterCounts.no_activity_14d },
    { key: 'missing_kpis', label: t('triage.filters.missingKpis', 'Missing KPIs'), icon: <TrendingDown className="h-3 w-3" />, count: filterCounts.missing_kpis },
    { key: 'overdue_actions', label: t('triage.filters.overdueActions', 'Overdue actions'), icon: <AlertTriangle className="h-3 w-3" />, count: filterCounts.overdue_actions },
    { key: 'at_risk', label: t('triage.filters.atRisk', 'At risk'), icon: <AlertTriangle className="h-3 w-3" />, count: filterCounts.at_risk },
  ];

  const getHealthBadgeStyle = (label: HealthScore | null) => {
    const l = label?.toLowerCase();
    if (l === 'critical') return 'bg-destructive/10 text-destructive border-destructive/30 font-semibold';
    if (l === 'at_risk' || l === 'at risk') return 'bg-warning/10 text-warning border-warning/30 font-semibold';
    if (l === 'healthy' || l === 'thriving') return 'bg-success/10 text-success border-success/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {t('triage.title', 'Workspace Triage')}
            <Badge variant="secondary" className="text-xs ml-1">
              {filteredAndSortedWorkspaces.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="triage-mode"
              checked={triageMode}
              onCheckedChange={setTriageMode}
            />
            <Label htmlFor="triage-mode" className="text-sm cursor-pointer">
              {t('triage.triageMode', 'Triage Mode')}
            </Label>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 pt-3">
          {filters.map((filter) => (
            <Badge
              key={filter.key}
              variant={quickFilter === filter.key ? 'default' : 'outline'}
              className={cn(
                "cursor-pointer transition-all duration-200 gap-1",
                quickFilter === filter.key && "bg-primary shadow-sm",
                filter.key === 'overdue_actions' && (filter.count ?? 0) > 0 && quickFilter !== filter.key && 'border-destructive/30 text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20',
                filter.key === 'at_risk' && (filter.count ?? 0) > 0 && quickFilter !== filter.key && 'border-warning/30 text-warning hover:bg-warning/10 dark:hover:bg-warning/20',
              )}
              onClick={() => setQuickFilter(filter.key)}
            >
              {filter.icon}
              <span>{filter.label}</span>
              {filter.count !== undefined && filter.count > 0 && filter.key !== 'all' && (
                <span className={cn(
                  'ml-0.5 text-[10px] font-bold px-1 py-0 rounded-full min-w-[16px] text-center',
                  quickFilter === filter.key ? 'bg-primary-foreground/20' : 'bg-current/10',
                )}>
                  {filter.count}
                </span>
              )}
            </Badge>
          ))}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-1.5">
        {filteredAndSortedWorkspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('triage.noWorkspaces', 'No workspaces match the current filter')}
          </p>
        ) : (
          filteredAndSortedWorkspaces.map((workspace) => {
            const daysSince = getDaysSinceSession(workspace.last_session_date);
            const urgencyScore = triageMode ? calculateUrgencyScore(workspace) : null;
            const hasOverdue = (workspace.overdue_actions_count || 0) > 0;
            const hasMissingKpis = (workspace.missing_kpis_count || 0) > 0;
            const isCritical = workspace.health_label?.toLowerCase() === 'critical';
            
            return (
              <div
                key={workspace.id}
                className={cn(
                  'group flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer',
                  'hover:bg-accent/60 hover:shadow-sm hover:border-border/80',
                  isCritical && 'border-destructive/60 bg-destructive/30 dark:bg-destructive/10',
                )}
                {...clickableProps(() => navigate(`/workspace/${workspace.id}`))}
              >
                {/* Urgency indicator */}
                {triageMode && urgencyScore !== null && (
                  <div className={cn(
                    "w-1.5 h-10 rounded-full flex-shrink-0 transition-all",
                    urgencyScore >= 50 ? "bg-destructive shadow-sm shadow-destructive/30" :
                    urgencyScore >= 30 ? "bg-warning shadow-sm shadow-warning/20" :
                    urgencyScore >= 15 ? "bg-warning" :
                    "bg-success"
                  )} />
                )}
                
                {/* Startup info + health inline */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{workspace.startup?.name || 'Unknown'}</p>
                    {workspace.program?.name && (
                      <p className="text-xs text-muted-foreground truncate">{workspace.program.name}</p>
                    )}
                  </div>
                  
                  {/* Health badge */}
                  <Badge 
                    variant="outline"
                    className={cn("text-xs flex-shrink-0 border", getHealthBadgeStyle(workspace.health_label))}
                  >
                    {workspace.health_label || 'N/A'}
                  </Badge>
                </div>
                
                {/* Risk indicators */}
                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                  {hasOverdue && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-0.5 animate-pulse">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {workspace.overdue_actions_count}
                    </Badge>
                  )}
                  {hasMissingKpis && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-warning/50 text-warning">
                      <TrendingDown className="h-2.5 w-2.5" />
                      KPI
                    </Badge>
                  )}
                  <span className={cn(
                    "flex items-center gap-1 text-muted-foreground",
                    daysSince !== null && daysSince >= 14 && 'text-warning font-medium'
                  )}>
                    <Clock className="h-3 w-3" />
                    {daysSince !== null ? `${daysSince}d` : '-'}
                  </span>
                </div>
                
                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" {...clickableProps((e) => e.stopPropagation())}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => navigate(`/workspace/${workspace.id}`)}
                   aria-label={t('common.open')}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  
                  {onScheduleSession && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onScheduleSession(workspace.id)}
                     aria-label={t('common._iconOpenCalendar')}>
                      <Calendar className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  
                  <ChaseActionsButton
                    workspaceId={workspace.id}
                    startupName={workspace.startup?.name || 'Startup'}
                    overdueCount={workspace.overdue_actions_count || 0}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
