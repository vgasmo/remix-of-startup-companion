import { useState, useEffect } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, isPast, isToday, addDays } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { 
  ListTodo, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar,
  ChevronRight,
  Filter,
  RefreshCw,
  Bell,
  Loader2,
  MessageSquare,
  TrendingUp,
  Shield,
  Users,
  Hourglass,
  ClipboardCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkQueueBulkActions } from './WorkQueueBulkActions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkQueue, useMarkWorkQueueItemDone, useSnoozeWorkQueueItem, useRecomputeWorkQueue } from '@/hooks/useWorkQueue';
import { notify } from "@/lib/notify";

interface WorkQueuePanelProps {
  compact?: boolean;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  triage: <Users className="h-4 w-4" />,
  outreach: <MessageSquare className="h-4 w-4" />,
  schedule_session: <Calendar className="h-4 w-4" />,
  post_session_followup: <CheckCircle2 className="h-4 w-4" />,
  overdue_actions: <AlertTriangle className="h-4 w-4" />,
  missing_kpis: <TrendingUp className="h-4 w-4" />,
  stage_gate_review: <Shield className="h-4 w-4" />,
  escalation: <Bell className="h-4 w-4" />,
  validate_actions: <Hourglass className="h-4 w-4" />,
  review_checkin: <ClipboardCheck className="h-4 w-4" />,
};

// Note: Type labels are used dynamically with i18n keys workQueue.types.{key}
const TYPE_KEYS = [
  'triage',
  'outreach',
  'schedule_session',
  'post_session_followup',
  'overdue_actions',
  'missing_kpis',
  'stage_gate_review',
  'escalation',
  'validate_actions',
  'review_checkin',
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-destructive text-destructive-foreground',
  high: 'bg-warning text-white',
  medium: 'bg-info text-white',
  low: 'bg-muted text-muted-foreground',
};

export function WorkQueuePanel({ compact = false }: WorkQueuePanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: workQueueItems, isLoading } = useWorkQueue({ status: statusFilter !== 'all' ? statusFilter : undefined });
  const markAsDone = useMarkWorkQueueItemDone();
  const snoozeItem = useSnoozeWorkQueueItem();
  const recomputeWorkQueue = useRecomputeWorkQueue();

  const [isRecomputing, setIsRecomputing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRecompute = async () => {
    setIsRecomputing(true);
    try {
      await recomputeWorkQueue.mutateAsync();
      notify.success(t('workQueue.updated'));
    } catch (error) {
      notify.error(t('workQueue.updateFailed'));
    } finally {
      setIsRecomputing(false);
    }
  };

  const handleMarkDone = async (itemId: string, opts?: { bulk?: boolean }) => {
    try {
      const item = workQueueItems?.find((i) => i.id === itemId);
      // G1: validate_actions is a review shortcut, not a closable task.
      if (item?.type === 'validate_actions' && item.workspace_id) {
        const { supabase } = await import('@/lib/supabaseClient');
        const { count, error: countErr } = await supabase
          .from('action_items')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', item.workspace_id)
          .eq('status', 'awaiting_validation');
        if (countErr) throw countErr;

        if ((count ?? 0) > 0) {
          // Bulk mode: don't navigate mid-loop or the rest of the selection is abandoned.
          // Treat as a soft-failure so the bulk counter reports it as such.
          if (opts?.bulk) {
            throw new Error(t('workQueue.stillPendingValidation', { count, defaultValue: `Ainda há ${count} ações por validar.` }));
          }
          notify.info(t('workQueue.stillPendingValidation', { count, defaultValue: `Ainda há ${count} ações por validar.` }));
          navigate(`/workspace/${item.workspace_id}?tab=milestones-actions&sub=actions&status=awaiting_validation`);
          return;
        }
      }
      // Special-case: review_checkin also stamps the check-in as reviewed and notifies the founder.
      // G0: check EVERY supabase error. Previously the empty catch swallowed RLS
      // failures (backoffice role wasn't in the UPDATE policy), the queue item
      // was marked done, reviewed_at stayed null, and recompute resurrected it.
      if (item?.type === 'review_checkin' && item.workspace_id) {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        const { data: pendings, error: pendErr } = await supabase
          .from('checkin_instances')
          .select('id, week_start, submitted_by')
          .eq('workspace_id', item.workspace_id)
          .eq('status', 'submitted')
          .is('reviewed_at', null);
        if (pendErr) throw pendErr;

        const nowIso = new Date().toISOString();
        for (const inst of pendings || []) {
          const { error: updErr } = await supabase
            .from('checkin_instances')
            .update({ reviewed_at: nowIso, reviewed_by: user?.id ?? null })
            .eq('id', inst.id);
          if (updErr) throw updErr;

          if (inst.submitted_by) {
            const monthLabel = inst.week_start ? new Date(inst.week_start).toLocaleDateString('pt-PT', { month: 'long' }) : '';
            const { error: notifErr } = await supabase.from('notifications').insert({
              user_id: inst.submitted_by,
              type: 'system',
              title: t('notifications.checkinReviewedTitle', 'Check-in visto'),
              message: t('notifications.checkinReviewedBody', { month: monthLabel, defaultValue: `O seu check-in de ${monthLabel} foi visto ✓` }),
              link: `/workspace/${item.workspace_id}?tab=overview`,
              entity_type: 'checkin_instance',
              entity_id: inst.id,
              read: false,
            });
            if (notifErr) throw notifErr;
          }
        }
      }
      await markAsDone.mutateAsync(itemId);
      if (!opts?.bulk) notify.success(t('workQueue.markedDone'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('workQueue.updateFailed');
      // Bulk mode: rethrow so the caller counts real failures instead of a blanket success.
      if (opts?.bulk) throw error instanceof Error ? error : new Error(msg);
      notify.error(msg);
    }
  };

  const handleSnooze = async (itemId: string, days: number) => {
    try {
      await snoozeItem.mutateAsync({ id: itemId, days });
      notify.success(t('workQueue.snoozedForDays', { days }));
    } catch (error) {
      notify.error(t('workQueue.snoozeFailed'));
    }
  };


  // Filter items
  const filteredItems = workQueueItems?.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    return true;
  }) || [];

  // Stats
  const openCount = workQueueItems?.filter(i => i.status === 'open').length || 0;
  const overdueCount = workQueueItems?.filter(i =>
    i.status === 'open' && i.due_at && isPast(new Date(i.due_at))
  ).length || 0;
  const dueThisWeekCount = workQueueItems?.filter(i => {
    if (i.status !== 'open' || !i.due_at) return false;
    const dueDate = new Date(i.due_at);
    const weekFromNow = addDays(new Date(), 7);
    return dueDate <= weekFromNow && !isPast(dueDate);
  }).length || 0;

  // ⌨️ Keyboard navigation: j/k move focus, e opens detail, c marks done
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    if (focusIdx >= filteredItems.length) setFocusIdx(Math.max(0, filteredItems.length - 1));
  }, [filteredItems.length, focusIdx]);

  const skipInInput = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;
  };

  useHotkeys('j', (e) => {
    if (skipInInput(e)) return;
    e.preventDefault();
    setFocusIdx((i) => Math.min(filteredItems.length - 1, i + 1));
  }, [filteredItems.length]);

  useHotkeys('k', (e) => {
    if (skipInInput(e)) return;
    e.preventDefault();
    setFocusIdx((i) => Math.max(0, i - 1));
  }, [filteredItems.length]);

  useHotkeys('e', (e) => {
    if (skipInInput(e)) return;
    const item = filteredItems[focusIdx];
    if (item?.workspace_id) {
      e.preventDefault();
      navigate(`/workspace/${item.workspace_id}`);
    }
  }, [filteredItems, focusIdx, navigate]);

  useHotkeys('c', (e) => {
    if (skipInInput(e)) return;
    const item = filteredItems[focusIdx];
    if (item) {
      e.preventDefault();
      handleMarkDone(item.id);
    }
  }, [filteredItems, focusIdx]);

  useHotkeys('x', (e) => {
    if (skipInInput(e)) return;
    const item = filteredItems[focusIdx];
    if (item) {
      e.preventDefault();
      toggleSelect(item.id);
    }
  }, [filteredItems, focusIdx]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </CardContent>
      </Card>
    );
  }

  const displayItems = compact ? filteredItems.slice(0, 5) : filteredItems;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-primary" />
            {t('workQueue.title')}
          </CardTitle>
          <div className="flex items-center gap-2">
            {!compact && (
              <>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('workQueue.statusAll')}</SelectItem>
                    <SelectItem value="open">{t('workQueue.statusOpen')}</SelectItem>
                    <SelectItem value="in_progress">{t('workQueue.statusInProgress')}</SelectItem>
                    <SelectItem value="done">{t('workQueue.statusDone')}</SelectItem>
                    <SelectItem value="snoozed">{t('workQueue.statusSnoozed')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue placeholder={t('workQueue.allTypes')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('workQueue.allTypes')}</SelectItem>
                    {TYPE_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>{t(`workQueue.types.${key}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={handleRecompute}
              disabled={isRecomputing}
             aria-label={t('common.loading')}>
              {isRecomputing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Stats */}
        {!compact && (
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm">{openCount} {t('workQueue.open')}</span>
            </div>
            {overdueCount > 0 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-sm font-medium">{overdueCount} {t('workQueue.overdue')}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-sm">{dueThisWeekCount} {t('workQueue.dueThisWeek')}</span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 opacity-50" />
            <p className="text-sm">{t('workQueue.noItems')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayItems.map((item, idx) => {
              const isOverdue = item.due_at && isPast(new Date(item.due_at));
              const isDueToday = item.due_at && isToday(new Date(item.due_at));
              const isFocused = idx === focusIdx;

              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`group p-3 rounded-lg border transition-colors hover:bg-muted/50 cursor-pointer ${
                    isOverdue ? 'border-destructive/30 bg-destructive/5' : ''
                  } ${isFocused ? 'ring-2 ring-primary/60' : ''} ${
                    isSelected ? 'bg-primary/5 border-primary/40' : ''
                  }`}
                  {...clickableProps(() => item.workspace_id && navigate(`/workspace/${item.workspace_id}`))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div {...clickableProps((e) => e.stopPropagation())} className="pt-1">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.id)}
                          aria-label={t('workQueue.selectItem')}
                        />
                      </div>
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-muted'
                      }`}>
                        {TYPE_ICONS[item.type] || <ListTodo className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate group-hover:text-primary group-hover:underline transition-colors">{item.title}</p>
                          <Badge className={`text-xs ${PRIORITY_COLORS[item.priority] || ''}`}>
                            {item.priority}
                          </Badge>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {t(`workQueue.types.${item.type}`, item.type)}
                          </Badge>
                          {item.due_at && (
                            <span className={`text-xs ${
                              isOverdue ? 'text-destructive font-medium' : 
                              isDueToday ? 'text-warning font-medium' : 
                              'text-muted-foreground'
                            }`}>
                              {isOverdue ? `${t('workQueue.overdueLabel')}: ` : isDueToday ? t('common.today') : ''}
                              {!isDueToday && format(new Date(item.due_at), 'MMM d', { locale: dateLocale })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-8">
                          {t('workQueue.actions')}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleMarkDone(item.id);
                        }}>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {t('workQueue.markDone')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleSnooze(item.id, 1);
                        }}>
                          <Clock className="h-4 w-4 mr-2" />
                          {t('workQueue.snooze1Day')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleSnooze(item.id, 7);
                        }}>
                          <Calendar className="h-4 w-4 mr-2" />
                          {t('workQueue.snooze7Days')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}

            {compact && filteredItems.length > 5 && (
              <Button 
                variant="ghost" 
                className="w-full text-sm"
                onClick={() => navigate('/my-workspaces?tab=queue')}
              >
                {t('workQueue.viewAll', { count: filteredItems.length })}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {!compact && (
        <WorkQueueBulkActions
          selectedIds={selectedIds}
          totalCount={displayItems.length}
          onDeselectAll={() => setSelectedIds(new Set())}
          onSelectAll={() => setSelectedIds(new Set(displayItems.map((i) => i.id)))}
          onMarkDoneItem={handleMarkDone}
        />
      )}
    </Card>
  );
}
