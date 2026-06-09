import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Target, 
  ListTodo, 
  Clock, 
  AlertTriangle,
  Calendar,
  Tag,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSessionPrep, SessionPrepData } from '@/hooks/useSessionPrep';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { SmartPrepButton, SmartPrepSheet } from '@/components/sessions/SmartPrepSheet';

interface SessionPrepCardProps {
  sessionId: string;
  workspaceId: string;
}

export function SessionPrepCard({ sessionId, workspaceId }: SessionPrepCardProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useSessionPrep(sessionId, workspaceId);
  const [showPrepSheet, setShowPrepSheet] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    kpis: true,
    actions: true,
    milestones: true,
    history: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const overdueActions = data.pendingActions.filter(a => a.isOverdue);
  const overdueMilestones = data.milestones.filter(m => m.isOverdue);
  const hasUrgentItems = overdueActions.length > 0 || overdueMilestones.length > 0;

  return (
    <Card className={cn(hasUrgentItems && "border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/30")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('sessionPrep.title')}</CardTitle>
          </div>
          {hasUrgentItems && (
            <Badge variant="outline" className="border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {t('sessionPrep.needsAttention')}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <CardDescription>
            {t('sessionPrep.context')}
          </CardDescription>
          <SmartPrepButton onClick={() => setShowPrepSheet(true)} />
        </div>
      </CardHeader>

      {/* AI Prep Sheet Slide-over */}
      <SmartPrepSheet
        open={showPrepSheet}
        onOpenChange={setShowPrepSheet}
        workspaceName={(data as any)?.workspaceName}
        stage={(data as any)?.workspaceStage || (data as any)?.stage}
        health={(data as any)?.healthScore || (data as any)?.health}
      />
      
      <CardContent className="space-y-4">
        {/* Tags */}
        {(data.workspaceTags.length > 0 || data.sessionTags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {data.workspaceTags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))}
            {data.sessionTags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Recent KPIs */}
        {data.recentKpis.length > 0 && (
          <Collapsible open={expandedSections.kpis} onOpenChange={() => toggleSection('kpis')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4 text-[hsl(var(--info))]" />
                {t('sessionPrep.recentKpis')}
                <Badge variant="secondary" className="text-xs">{data.recentKpis.length}</Badge>
              </div>
              {expandedSections.kpis ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="grid grid-cols-2 gap-2">
                {data.recentKpis.slice(0, 6).map((kpi) => (
                  <div key={kpi.name} className="p-2 rounded bg-muted/50 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-muted-foreground truncate">{kpi.name}</span>
                      {kpi.trend && (
                        <span className={cn(
                          "flex items-center",
                          kpi.trend === 'up' && "text-[hsl(var(--success))]",
                          kpi.trend === 'down' && "text-destructive",
                          kpi.trend === 'stable' && "text-muted-foreground"
                        )}>
                          {kpi.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                          {kpi.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                          {kpi.trend === 'stable' && <Minus className="h-3 w-3" />}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold">
                      {kpi.currentValue?.toLocaleString() ?? '—'}
                      {kpi.unit && <span className="text-muted-foreground ml-1">{kpi.unit}</span>}
                    </div>
                    {kpi.previousValue !== null && (
                      <div className="text-muted-foreground">
                        {t('sessionPrep.prev')}: {kpi.previousValue.toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Pending Actions */}
        {data.pendingActions.length > 0 && (
          <Collapsible open={expandedSections.actions} onOpenChange={() => toggleSection('actions')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ListTodo className="h-4 w-4 text-primary" />
                {t('sessionPrep.pendingActions')}
                <Badge variant="secondary" className="text-xs">{data.pendingActions.length}</Badge>
                {overdueActions.length > 0 && (
                  <Badge variant="destructive" className="text-xs">{overdueActions.length} {t('sessionPrep.overdue')}</Badge>
                )}
              </div>
              {expandedSections.actions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1.5">
              {data.pendingActions.map((action) => (
                <div 
                  key={action.id} 
                  className={cn(
                    "flex items-center justify-between p-2 rounded text-xs",
                    action.isOverdue ? "bg-destructive/10" : "bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {action.isOverdue && <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />}
                    <span className="truncate">{action.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {action.priority && (
                      <Badge variant="outline" className={cn("text-xs",
                        action.priority === 'high' && "border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]",
                        action.priority === 'urgent' && "border-destructive/30 text-destructive"
                      )}>
                        {action.priority}
                      </Badge>
                    )}
                    {action.due_date && (
                      <span className={cn(
                        "text-muted-foreground",
                        action.isOverdue && "text-destructive"
                      )}>
                        {format(new Date(action.due_date), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Milestones */}
        {data.milestones.length > 0 && (
          <Collapsible open={expandedSections.milestones} onOpenChange={() => toggleSection('milestones')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-[hsl(var(--success))]" />
                {t('sessionPrep.milestones')}
                <Badge variant="secondary" className="text-xs">{data.milestones.length}</Badge>
                {overdueMilestones.length > 0 && (
                  <Badge variant="destructive" className="text-xs">{overdueMilestones.length} {t('sessionPrep.overdue')}</Badge>
                )}
              </div>
              {expandedSections.milestones ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1.5">
              {data.milestones.map((milestone) => (
                <div 
                  key={milestone.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded text-xs",
                    milestone.isOverdue ? "bg-destructive/10" : "bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      milestone.status === 'in_progress' ? "bg-[hsl(var(--info))]" :
                      milestone.status === 'delayed' ? "bg-destructive" : "bg-muted"
                    )} />
                    <span className="truncate">{milestone.title}</span>
                  </div>
                  {milestone.target_date && (
                    <span className={cn(
                      "text-muted-foreground flex-shrink-0",
                      milestone.isOverdue && "text-destructive"
                    )}>
                      {format(new Date(milestone.target_date), 'MMM d')}
                    </span>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Previous Sessions */}
        {data.previousSessions.length > 0 && (
          <Collapsible open={expandedSections.history} onOpenChange={() => toggleSection('history')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {t('sessionPrep.previousSessions')}
                <Badge variant="secondary" className="text-xs">{data.previousSessions.length}</Badge>
              </div>
              {expandedSections.history ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              {data.previousSessions.map((session) => (
                <div key={session.id} className="p-2 rounded bg-muted/30 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{session.title}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(session.scheduled_at), 'MMM d')}
                    </span>
                  </div>
                  {session.ai_summary && (
                    <p className="text-muted-foreground line-clamp-2">{session.ai_summary}</p>
                  )}
                  {session.decisions && (
                    <p className="text-muted-foreground line-clamp-1">
                      <span className="font-medium">{t('sessions.decisions', 'Decisões')}:</span> {session.decisions}
                    </p>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty state */}
        {data.recentKpis.length === 0 && data.pendingActions.length === 0 && 
         data.milestones.length === 0 && data.previousSessions.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-4">
            {t('sessionPrep.noContext')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
