import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isThisWeek, isThisMonth } from 'date-fns';
import { pt, enUS } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Target,
  Lightbulb,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import { useActivityTimeline, useRelationshipRecap, useGenerateRecap, ActivityEntry, ActivityType } from '@/hooks/useActivityTimeline';
import { useSessions } from '@/hooks/useSessions';
import { useFeatureFlag } from '@/hooks/useFeatureFlags';
import { formatRelativeTime } from '@/lib/dateUtils';

interface FounderInteractionsTabProps {
  workspaceId: string;
}

export function FounderInteractionsTab({ workspaceId }: FounderInteractionsTabProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith('pt') ? 'pt' : 'en';
  const dateLocale = language === 'pt' ? pt : enUS;
  
  const [recapExpanded, setRecapExpanded] = useState(false);
  
  const aiRecapEnabled = useFeatureFlag('crm_ai_recap');
  
  // Only show 'shared' visibility items to founders
  const { data: activities, isLoading: loadingActivities } = useActivityTimeline({
    workspaceId,
    visibility: 'shared',
    limit: 20,
  });
  
  const { data: recap, isLoading: loadingRecap } = useRelationshipRecap({
    workspaceId,
    language,
  });
  
  const { data: sessions } = useSessions(workspaceId);
  const upcomingSession = useMemo(() => {
    if (!sessions?.length) return null;
    const now = new Date();
    return sessions.find(s => new Date(s.scheduled_at) > now);
  }, [sessions]);
  
  const generateRecap = useGenerateRecap();

  // Group activities by time period
  const groupedActivities = useMemo(() => {
    if (!activities?.length) return {};
    
    const groups: Record<string, ActivityEntry[]> = {};
    
    activities.forEach(activity => {
      const date = new Date(activity.occurred_at);
      let key: string;
      
      if (isThisWeek(date)) {
        key = t('crm.thisWeek');
      } else if (isThisMonth(date)) {
        key = t('crm.thisMonth');
      } else {
        key = format(date, 'MMMM yyyy', { locale: dateLocale });
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(activity);
    });
    
    return groups;
  }, [activities, t, dateLocale]);

  return (
    <div className="space-y-6">
      {/* AI Recap Card - collapsed by default */}
      {aiRecapEnabled && (
        <Collapsible open={recapExpanded} onOpenChange={setRecapExpanded}>
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-4">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-semibold">{t('crm.sinceLast')}</span>
                </div>
                {recapExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              
              {loadingRecap ? (
                <Skeleton className="h-12 w-full mt-3" />
              ) : recap ? (
                <>
                  <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                    {recap.summary}
                  </p>
                  <CollapsibleContent className="mt-4 space-y-4">
                    {recap.key_points?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
                          <Target className="h-4 w-4 text-primary" /> {t('crm.keyPoints')}
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1 pl-5">
                          {recap.key_points.map((p, i) => (
                            <li key={i} className="list-disc">{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {recap.next_best_actions?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5 mb-2 text-primary">
                          <Lightbulb className="h-4 w-4" /> {t('crm.suggestedNextSteps')}
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1 pl-5">
                          {recap.next_best_actions.map((p, i) => (
                            <li key={i} className="list-disc">{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CollapsibleContent>
                </>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">{t('crm.noRecapYet')}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-8 text-xs"
                    onClick={() => generateRecap.mutate({ workspaceId, language })}
                    disabled={generateRecap.isPending} loading={generateRecap.isPending}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {generateRecap.isPending ? t('common.generating') : t('crm.generateRecap')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </Collapsible>
      )}

      {/* Upcoming Session CTA */}
      {upcomingSession && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{t('crm.upcomingSession')}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(upcomingSession.scheduled_at), 'PPp', { locale: dateLocale })}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  const params = new URLSearchParams({ tab: 'agenda', session: upcomingSession.id });
                  window.location.assign(`/workspace/${workspaceId}?${params.toString()}`);
                }}
              >
                {t('crm.viewSession')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactions Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5" />
            {t('crm.recentInteractions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingActivities ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : Object.keys(groupedActivities).length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t('crm.noInteractionsYet')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('crm.noInteractionsHint')}</p>
            </div>
          ) : (
            <ScrollArea  viewportClassName="max-h-[400px]">
              <div className="space-y-5">
                {Object.entries(groupedActivities).map(([period, items]) => (
                  <div key={period}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      {period}
                    </p>
                    <div className="space-y-2">
                      {items.map((activity) => (
                        <FounderActivityItem key={activity.id} activity={activity} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FounderActivityItem({ activity }: { activity: ActivityEntry }) {
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
  
  // Friendly labels for founders (no CRM jargon)
  const labelMap: Record<ActivityType, string> = {
    email: t('crm.founder.email'),
    call: t('crm.founder.call'),
    meeting: t('crm.founder.meeting'),
    task: t('crm.founder.task'),
    note: t('crm.founder.note'),
    system: t('crm.founder.update'),
  };
  
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="shrink-0">
        <div className="h-9 w-9 rounded-full bg-background flex items-center justify-center shadow-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{activity.subject || labelMap[activity.activity_type]}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(activity.occurred_at)}</p>
          </div>
          {activity.direction && (
            <span className="shrink-0">
              {activity.direction === 'inbound' ? (
                <ArrowDownRight className="h-3.5 w-3.5 text-[hsl(var(--info))]" />
              ) : (
                <ArrowUpRight className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
              )}
            </span>
          )}
        </div>
        {activity.preview && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{activity.preview}</p>
        )}
      </div>
    </div>
  );
}
