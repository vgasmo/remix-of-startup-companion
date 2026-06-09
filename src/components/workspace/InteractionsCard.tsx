import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  FileText,
  Calendar,
  CheckSquare,
  Sparkles,
  MessageCircle,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import { useActivityTimeline, useRelationshipRecap, ActivityEntry, ActivityType } from '@/hooks/useActivityTimeline';
import { useFeatureFlag } from '@/hooks/useFeatureFlags';
import { formatRelativeTime } from '@/lib/dateUtils';

interface InteractionsCardProps {
  workspaceId: string;
  onViewAll?: () => void;
}

/**
 * Compact interactions card for WorkspaceOverview
 * Shows recent shared interactions for founders
 */
export function InteractionsCard({ workspaceId, onViewAll }: InteractionsCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith('pt') ? 'pt' : 'en';
  
  const [isExpanded, setIsExpanded] = useState(false);
  
  const aiRecapEnabled = useFeatureFlag('crm_ai_recap');
  
  // Only show 'shared' visibility items to founders
  const { data: activities, isLoading } = useActivityTimeline({
    workspaceId,
    visibility: 'shared',
    limit: 5,
  });
  
  const { data: recap } = useRelationshipRecap({
    workspaceId,
    language,
  });
  
  // Don't render if no activities and no recap
  if (!isLoading && !activities?.length && !recap) {
    return null;
  }

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-primary" />
              {t('crm.interactions')}
            </CardTitle>
            <div className="flex items-center gap-2">
              {activities?.length ? (
                <span className="text-xs text-muted-foreground">{activities.length} recentes</span>
              ) : null}
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* AI Recap Summary (if available and enabled) */}
            {aiRecapEnabled && recap && (
              <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{t('crm.sinceLast')}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{recap.summary}</p>
                {recap.next_best_actions?.length > 0 && (
                  <div className="mt-2 text-xs text-primary">
                    → {recap.next_best_actions[0]}
                  </div>
                )}
              </div>
            )}
            
            {/* Recent Interactions List */}
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : activities?.length === 0 ? (
              <div className="flex flex-col items-center text-center py-6">
                <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center mb-2">
                  <MessageCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-0.5">
                  {t('crm.noInteractionsYet', { defaultValue: 'Sem interações registadas' })}
                </p>
                <p className="text-xs text-muted-foreground max-w-[220px]">
                  {t('crm.noInteractionsHint', { defaultValue: 'As interações serão registadas aqui à medida que a relação evolui.' })}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activities?.slice(0, 3).map((activity) => (
                  <CompactActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            )}
            
            {/* View All Button */}
            {(activities?.length || 0) > 0 && onViewAll && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 h-8 text-xs"
                onClick={onViewAll}
              >
                {t('crm.viewAll')}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function CompactActivityItem({ activity }: { activity: ActivityEntry }) {
  const { t } = useTranslation();
  
  const iconMap: Record<ActivityType, typeof Mail> = {
    email: Mail,
    call: Phone,
    meeting: Calendar,
    task: CheckSquare,
    note: FileText,
    system: Sparkles,
  };
  
  const Icon = iconMap[activity.activity_type] || FileText;
  
  return (
    <div className="flex gap-2 items-start p-2 rounded hover:bg-muted/50 transition-colors">
      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">
            {activity.subject || t(`crm.founder.${activity.activity_type}`)}
          </p>
          {activity.direction && (
            <span className="shrink-0">
              {activity.direction === 'inbound' ? (
                <ArrowDownRight className="h-3 w-3 text-[hsl(var(--info))]" />
              ) : (
                <ArrowUpRight className="h-3 w-3 text-[hsl(var(--success))]" />
              )}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{formatRelativeTime(activity.occurred_at)}</p>
      </div>
    </div>
  );
}
