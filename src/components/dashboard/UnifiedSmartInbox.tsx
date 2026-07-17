import { useState } from 'react';
import { clickableProps } from '@/lib/clickable';

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Inbox,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

type InboxCategory = 'all' | 'actions' | 'mentorship' | 'insights';

interface InboxItem {
  id: string;
  category: InboxCategory;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  timestamp: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  href?: string;
  read: boolean;
}

interface UnifiedSmartInboxProps {
  overdueCount?: number;
  pendingSessionsCount?: number;
  missingKpiCount?: number;
  workspaceId?: string;
}

export function UnifiedSmartInbox({
  overdueCount = 0,
  pendingSessionsCount = 0,
  missingKpiCount = 0,
  workspaceId,
}: UnifiedSmartInboxProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<InboxCategory>('all');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Build items from real props
  const items: InboxItem[] = [];

  if (overdueCount > 0) {
    items.push({
      id: 'overdue-actions',
      category: 'actions',
      icon: <AlertTriangle className="h-4 w-4 text-health-critical" />,
      title: t('inbox.overdueActions', { count: overdueCount, defaultValue: `${overdueCount} overdue action items` }),
      subtitle: t('inbox.overdueActionsDesc', { defaultValue: 'Review and update your pending tasks to stay on track.' }),
      timestamp: t('inbox.today', { defaultValue: 'Today' }),
      priority: 'critical',
      href: workspaceId ? `/workspace/${workspaceId}?tab=milestones-actions&sub=actions` : '/my-workspaces?filter=attention',
      read: false,
    });
  }

  if (pendingSessionsCount > 0) {
    items.push({
      id: 'pending-sessions',
      category: 'mentorship',
      icon: <Users className="h-4 w-4 text-primary" />,
      title: t('inbox.pendingSessions', { count: pendingSessionsCount, defaultValue: `${pendingSessionsCount} session(s) awaiting confirmation` }),
      subtitle: t('inbox.pendingSessionsDesc', { defaultValue: 'Confirm or reschedule your upcoming mentorship sessions.' }),
      timestamp: t('inbox.thisWeek', { defaultValue: 'This week' }),
      priority: 'high',
      href: workspaceId ? `/workspace/${workspaceId}?tab=agenda` : undefined,
      read: false,
    });
  }

  if (missingKpiCount > 0) {
    items.push({
      id: 'missing-kpis',
      category: 'insights',
      icon: <TrendingUp className="h-4 w-4 text-health-at-risk" />,
      title: t('inbox.missingKpis', { defaultValue: 'KPI data missing for this month' }),
      subtitle: t('inbox.missingKpisDesc', { defaultValue: 'Update your metrics to keep your health score accurate.' }),
      timestamp: t('inbox.thisMonth', { defaultValue: 'This month' }),
      priority: 'medium',
      href: workspaceId ? `/workspace/${workspaceId}?tab=kpis` : undefined,
      read: false,
    });
  }

  const visibleItems = items.filter(i => !dismissedIds.has(i.id));
  const filteredItems = activeTab === 'all'
    ? visibleItems
    : visibleItems.filter(i => i.category === activeTab);

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const priorityBorder: Record<string, string> = {
    critical: 'border-l-health-critical',
    high: 'border-l-health-at-risk',
    medium: 'border-l-health-stable',
    low: 'border-l-border',
  };

  const categoryCount = (cat: InboxCategory) =>
    cat === 'all' ? visibleItems.length : visibleItems.filter(i => i.category === cat).length;

  return (
    <Card className="rounded-2xl border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Inbox className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t('inbox.title', { defaultValue: 'Smart Inbox' })}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t('inbox.subtitle', { count: visibleItems.length, defaultValue: `${visibleItems.length} item(s) need attention` })}
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InboxCategory)} className="px-4">
        <TabsList className="h-8 bg-muted/50 p-0.5 w-full justify-start gap-0.5">
          {(['all', 'actions', 'mentorship', 'insights'] as const).map(tab => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="text-[11px] h-7 px-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1"
            >
              {t(`inbox.tab.${tab}`, { defaultValue: tab.charAt(0).toUpperCase() + tab.slice(1) })}
              {categoryCount(tab) > 0 && (
                <Badge variant="secondary" className="h-4 min-w-[16px] px-1 text-[10px] leading-none">
                  {categoryCount(tab)}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-2 mb-3">
          {filteredItems.length === 0 ? (
            <EmptyState
              illustration="empty-inbox"
              title={t('inbox.empty.title', { defaultValue: 'Inbox Zero!' })}
              description={t('inbox.empty.description', { defaultValue: "You're all caught up. Great work staying on top of things." })}
              variant="inline"
            />
          ) : (
            <ScrollArea  viewportClassName="max-h-[280px]">
              <div className="space-y-1.5">
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={cn(
                      'group flex items-start gap-3 p-3 rounded-xl border border-border/40 border-l-2 bg-card transition-all duration-200',
                      'hover:bg-muted/40 hover:shadow-sm cursor-pointer',
                      priorityBorder[item.priority],
                      !item.read && 'bg-primary/[0.02]'
                    )}
                    {...clickableProps(() => { if (item.href) navigate(item.href); })}
                  >

                    <div className="mt-0.5 shrink-0">{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.timestamp}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(item.id);
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
