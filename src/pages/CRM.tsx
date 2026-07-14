import { useState, useEffect, useCallback, useMemo } from 'react';
import { clickableProps } from '@/lib/clickable';

import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { 
  AlertTriangle, 
  Calendar, 
  Clock, 
  CheckSquare,
  ChevronRight,
  Inbox,
  ListTodo,
  Search,
  Ghost,
  Focus,
  Zap,
  LayoutGrid,
  TrendingUp,
  Link2,
} from 'lucide-react';
import { PipelineView } from '@/components/crm/PipelineView';
import { useCrmInbox, useCrmTasksDue, CrmInboxItem } from '@/hooks/useCrmInbox';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { usePrograms } from '@/hooks/useWorkspaces';
import { notify } from "@/lib/notify";
import { useConsultors } from '@/hooks/useWorkspaceOwner';
import { useCompleteTask } from '@/hooks/useCrmTasks';
import { useAuth } from '@/contexts/AuthContext';
import { RecordDrawer } from '@/components/crm/RecordDrawer';
import { formatRelativeTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { SavedViewsDropdown } from '@/components/crm/SavedViewsDropdown';
import { supabase } from '@/lib/supabaseClient';
import { getRelationshipStatus, getRelationshipStatusConfig, shouldShowInFocusMode, sortByFocusUrgency } from '@/lib/crmUtils';
import { CrmAnalyticsDashboard } from '@/components/crm/CrmAnalyticsDashboard';
import { PipelineForecastCard } from '@/components/crm/PipelineForecastCard';
import { CsvLeadImport } from '@/components/crm/CsvLeadImport';
import { NewLeadDialog } from '@/components/crm/NewLeadDialog';
import { EmailReviewQueue } from '@/components/crm/EmailReviewQueue';
import { EmailSyncHealthPanel } from '@/components/crm/EmailSyncHealthPanel';
import { IntakeRoutingManager } from '@/components/admin/IntakeRoutingManager';
import { BookingLinksManager } from '@/components/admin/BookingLinksManager';
import type { FunnelItem, FunnelStage } from '@/hooks/useFunnel';
import { logger } from '@/lib/logger';

const STAGE_COLORS: Record<FunnelStage, string> = {
  new: 'bg-muted',
  first_contact_booked: 'bg-[hsl(var(--info))]',
  met: 'bg-[hsl(var(--info))]/10',
  qualified: 'bg-primary/10',
  proposal_sent: 'bg-[hsl(var(--warning))]',
  negotiating: 'bg-[hsl(var(--warning))]/10',
  intake_requested: 'bg-[hsl(var(--info))]/10',
  intake_filling: 'bg-[hsl(var(--info))]/10',
  intake_submitted: 'bg-[hsl(var(--success))]/10',
  intake_review: 'bg-[hsl(var(--success))]/10',
  intake_changes_requested: 'bg-[hsl(var(--warning))]',
  approved_for_signature: 'bg-lime-500',
  sent_for_signature: 'bg-[hsl(var(--success))]',
  contracted: 'bg-[hsl(var(--success))]',
  incubating: 'bg-[hsl(var(--success))]/10',
  accelerating: 'bg-primary',
  rejected: 'bg-destructive',
  archived: 'bg-muted-foreground',
};

const ACTIVE_STAGES: FunnelStage[] = ['new', 'first_contact_booked', 'met', 'qualified', 'proposal_sent', 'negotiating', 'intake_requested', 'intake_filling', 'intake_submitted', 'intake_review', 'intake_changes_requested', 'approved_for_signature', 'sent_for_signature', 'contracted', 'incubating', 'accelerating'];

const COMMERCIAL_STAGES: FunnelStage[] = ['new', 'first_contact_booked', 'met', 'qualified', 'proposal_sent', 'negotiating', 'intake_requested', 'intake_filling', 'intake_submitted', 'intake_review', 'intake_changes_requested', 'approved_for_signature', 'sent_for_signature'];
const ACTIVE_CUSTOMER_STAGES: FunnelStage[] = ['contracted', 'incubating', 'accelerating'];

type CrmSegment = 'all' | 'commercial' | 'active_customers';
const SEGMENT_STAGES: Record<CrmSegment, FunnelStage[] | undefined> = {
  all: undefined,
  commercial: COMMERCIAL_STAGES,
  active_customers: ACTIVE_CUSTOMER_STAGES,
};

export default function CRM() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedItem, setSelectedItem] = useState<FunnelItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filters live in the URL so refresh survives and views are shareable
  const programFilter = searchParams.get('program') || 'all';
  const stageFilter = searchParams.get('stage') || 'all';
  const assigneeFilter = searchParams.get('assignee') || 'all';
  const urlSearchQuery = searchParams.get('q') || '';
  // Local input state → debounce → URL, so we don't hit Supabase on every keystroke.
  const [searchInput, setSearchInput] = useState(urlSearchQuery);
  const searchQuery = useDebounce(searchInput, 300);
  const myItemsOnly = searchParams.get('mine') === '1';
  const focusMode = searchParams.get('focus') === '1';

  const updateFilterParam = useCallback((key: string, value: string | boolean, defaultValue: string | boolean = 'all') => {
    const next = new URLSearchParams(searchParams);
    const stringVal = typeof value === 'boolean' ? (value ? '1' : '') : value;
    const stringDefault = typeof defaultValue === 'boolean' ? '' : defaultValue;
    if (!stringVal || stringVal === stringDefault) next.delete(key);
    else next.set(key, stringVal);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const setProgramFilter = (v: string) => updateFilterParam('program', v, 'all');
  const setStageFilter = (v: string) => updateFilterParam('stage', v, 'all');
  const setAssigneeFilter = (v: string) => updateFilterParam('assignee', v, 'all');
  const setSearchQuery = (v: string) => setSearchInput(v);
  const setMyItemsOnly = (v: boolean) => updateFilterParam('mine', v, false);
  const setFocusMode = (v: boolean) => updateFilterParam('focus', v, false);

  // Push debounced search into the URL (survives refresh + shareable)
  useEffect(() => {
    if (searchQuery === urlSearchQuery) return;
    const next = new URLSearchParams(searchParams);
    if (searchQuery) next.set('q', searchQuery); else next.delete('q');
    setSearchParams(next, { replace: true });
  }, [searchQuery]);


  const { data: programs } = usePrograms();
  const { data: consultors } = useConsultors();
  const { data: inbox, isLoading: loadingInbox } = useCrmInbox({
    programId: programFilter !== 'all' ? programFilter : undefined,
    stage: stageFilter !== 'all' ? stageFilter as FunnelStage : undefined,
    assigneeId: assigneeFilter !== 'all' ? assigneeFilter : undefined,
    search: searchQuery || undefined,
    myItemsOnly: focusMode ? true : myItemsOnly, // Focus mode implies my items
    currentUserId: user?.id,
  });
  const { data: tasksDue, isLoading: loadingTasks } = useCrmTasksDue({
    assigneeId: assigneeFilter !== 'all' ? assigneeFilter : undefined,
    myItemsOnly: focusMode ? true : myItemsOnly,
    currentUserId: user?.id,
  });
  // Forecast needs deals grouped by pipeline stage (new/qualified/…), not by
  // inbox bucket (overdue/today/…). Previously we cast the inbox groups to the
  // pipeline shape, so no stage ever matched and the forecast was empty.
  const { data: pipelineForForecast } = useCrmPipeline({
    programId: programFilter !== 'all' ? programFilter : undefined,
    assigneeId: assigneeFilter !== 'all' ? assigneeFilter : undefined,
    search: searchQuery || undefined,
    myItemsOnly: focusMode ? true : myItemsOnly,
    currentUserId: user?.id,
  });

  const completeTask = useCompleteTask();

  const crmView = searchParams.get('view') || 'pipeline';

  const handleViewChange = (view: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', view);
    next.delete('open');
    setSearchParams(next, { replace: false });
  };

  // Internal: open drawer without URL push (used by deep-link).
  // G0 fix: hydrate real values (notes, source, metadata_json…) from the inbox row
  // so subsequent saves don't wipe them out with hardcoded nulls.
  const openDrawerDirect = useCallback((item: CrmInboxItem) => {
    const funnelItem: FunnelItem = {
      id: item.id,
      stage: item.stage,
      type: 'lead',
      owner_consultant_id: item.owner_consultant_id,
      contact_name: item.contact_name,
      contact_email: item.contact_email,
      contact_phone: item.contact_phone ?? null,
      organization_name: item.organization_name,
      source: item.source ?? null,
      tags: [],
      notes: item.notes ?? null,
      linked_startup_id: null,
      linked_workspace_id: item.linked_workspace_id,
      linked_contract_id: null,
      program_id: item.program_id,
      first_contact_at: item.first_contact_at ?? null,
      qualified_at: null,
      converted_at: null,
      next_action_at: item.next_action_at,
      next_action_description: item.next_action_description,
      last_activity_at: item.last_activity_at,
      deal_value: item.deal_value ?? null,
      deal_currency: item.deal_currency ?? 'EUR',
      expected_close_date: item.expected_close_date ?? null,
      win_probability: item.win_probability ?? null,
      loss_reason: null,
      metadata_json: item.metadata_json ?? null,
      created_at: item.created_at,
      updated_at: item.created_at,
      owner: item.owner ? { ...item.owner, email: '' } : null,
      program: item.program,
    } as FunnelItem;
    setSelectedItem(funnelItem);
    setDrawerOpen(true);
  }, []);

  const handleOpenDrawer = useCallback((item: CrmInboxItem) => {
    openDrawerDirect(item);
    // Push to URL so back button closes drawer
    const next = new URLSearchParams(searchParams);
    next.set('open', item.id);
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams, openDrawerDirect]);

  // Deep-link support: ?open=<funnel_item_id>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) {
      // Back button removed ?open → close drawer
      if (drawerOpen) {
        setDrawerOpen(false);
        setSelectedItem(null);
      }
      return;
    }
    if (loadingInbox) return;
    // Already showing this item
    if (selectedItem?.id === openId && drawerOpen) return;

    const allItems = [
      ...(inbox?.overdue || []),
      ...(inbox?.today || []),
      ...(inbox?.upcoming || []),
      ...(inbox?.noNextAction || []),
      ...(inbox?.stale || []),
    ];
    
    const foundItem = allItems.find(item => item.id === openId);
    
    if (foundItem) {
      openDrawerDirect(foundItem);
    } else {
      const fetchAndOpen = async () => {
        try {
          const { data, error } = await supabase
            .from('funnel_items')
            .select('*, owner:profiles!funnel_items_owner_consultant_id_fkey(id, full_name), program:programs(id, name)')
            .eq('id', openId)
            .maybeSingle();
          
          if (error || !data) {
            logger.error('Failed to load funnel item', {}, error);
            notify.error(t('crm.itemNotFound'));
            const next = new URLSearchParams(searchParams);
            next.delete('open');
            setSearchParams(next, { replace: true });
            return;
          }
          
          const ownerData = Array.isArray(data.owner) ? data.owner[0] : data.owner;
          const programData = Array.isArray(data.program) ? data.program[0] : data.program;
          
          const crmItem: CrmInboxItem = {
            id: data.id,
            stage: data.stage as FunnelStage,
            contact_name: data.contact_name,
            contact_email: data.contact_email,
            contact_phone: data.contact_phone ?? null,
            organization_name: data.organization_name,
            owner_consultant_id: data.owner_consultant_id,
            linked_workspace_id: data.linked_workspace_id,
            program_id: data.program_id,
            next_action_at: data.next_action_at,
            next_action_description: data.next_action_description,
            last_activity_at: data.last_activity_at,
            notes: data.notes ?? null,
            source: data.source ?? null,
            first_contact_at: data.first_contact_at ?? null,
            metadata_json: data.metadata_json ?? null,
            deal_value: data.deal_value ?? null,
            deal_currency: data.deal_currency ?? null,
            expected_close_date: data.expected_close_date ?? null,
            win_probability: data.win_probability ?? null,
            created_at: data.created_at,
            owner: ownerData || null,
            program: programData || null,
          };
          
          openDrawerDirect(crmItem);
        } catch (err) {
          logger.error('Error fetching funnel item', {}, err);
          notify.error(t('crm.itemNotFound'));
          const next = new URLSearchParams(searchParams);
          next.delete('open');
          setSearchParams(next, { replace: true });
        }
      };
      fetchAndOpen();
    }
     
  }, [searchParams, inbox, loadingInbox]);

  // Compute Focus Mode items - only urgent items needing attention
  const focusItems = useMemo(() => {
    if (!focusMode || !inbox) return [];
    
    const allItems = [
      ...(inbox.overdue || []),
      ...(inbox.today || []),
      ...(inbox.upcoming || []),
      ...(inbox.noNextAction || []),
      ...(inbox.stale || []),
    ];
    
    // Filter to items that should show in focus mode
    const filtered = allItems.filter(item => 
      shouldShowInFocusMode({
        next_action_at: item.next_action_at,
        last_activity_at: item.last_activity_at,
        hasOverdueTasks: false, // We'll enhance this later with actual task data
        isMyItem: item.owner_consultant_id === user?.id,
      })
    );
    
    // Sort by urgency
    return sortByFocusUrgency(filtered);
  }, [focusMode, inbox, user?.id]);

  // Calculate total counts for tabs
  const inboxTotal = (inbox?.overdue.length || 0) + (inbox?.today.length || 0) + 
    (inbox?.upcoming.length || 0) + (inbox?.noNextAction.length || 0) + (inbox?.stale.length || 0);
  const tasksTotal = (tasksDue?.overdue.length || 0) + (tasksDue?.today.length || 0) + 
    (tasksDue?.upcoming.length || 0);

  // Ordered sibling list for drawer triage — Follow-Up Inbox is the priority consumer.
  // Priority order: overdue → today → upcoming → noNextAction → stale (matches column order).
  const siblingIds = useMemo(() => {
    if (focusMode) return focusItems.map(i => i.id);
    if (!inbox) return [];
    return [
      ...(inbox.overdue || []),
      ...(inbox.today || []),
      ...(inbox.upcoming || []),
      ...(inbox.noNextAction || []),
      ...(inbox.stale || []),
    ].map(i => i.id);
  }, [inbox, focusMode, focusItems]);

  const handleNavigateSibling = useCallback((id: string) => {
    // Reuse the deep-link path so the drawer refetches the correct item cleanly.
    const next = new URLSearchParams(searchParams);
    next.set('open', id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);


  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6" data-testid="crm-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('crm.crmDashboard')}</h1>
            <p className="text-muted-foreground">{t('crm.dashboardSubtitle')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('crm.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}

              className="pl-9"
            />
          </div>

          <Select value={programFilter} onValueChange={setProgramFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('crm.filterByProgram')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('crm.allPrograms')}</SelectItem>
              {programs?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('crm.filterByStage')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('crm.allStages')}</SelectItem>
              {ACTIVE_STAGES.map(s => (
                <SelectItem key={s} value={s}>{t(`pipeline.stages.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('crm.filterByAssignee')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('crm.allAssignees')}</SelectItem>
              {consultors?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.full_name || t('common.unnamed')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <SavedViewsDropdown
              viewType="crm"
              currentFilters={{
                programFilter,
                stageFilter,
                assigneeFilter,
                myItemsOnly,
                focusMode,
              }}
              onApplyView={(filters) => {
                const next = new URLSearchParams(searchParams);
                const setOrDel = (key: string, val: string | undefined, def = 'all') => {
                  if (!val || val === def) next.delete(key); else next.set(key, val);
                };
                if ('programFilter' in filters) setOrDel('program', filters.programFilter as string | undefined);
                if ('stageFilter' in filters) setOrDel('stage', filters.stageFilter as string | undefined);
                if ('assigneeFilter' in filters) setOrDel('assignee', filters.assigneeFilter as string | undefined);
                if (typeof filters.myItemsOnly === 'boolean') {
                  if (filters.myItemsOnly) next.set('mine', '1'); else next.delete('mine');
                }
                if (typeof filters.focusMode === 'boolean') {
                  if (filters.focusMode) next.set('focus', '1'); else next.delete('focus');
                }
                setSearchParams(next, { replace: true });
              }}

            />
            <div className="flex items-center gap-2">
              <Switch
                id="focus-mode"
                checked={focusMode}
                onCheckedChange={setFocusMode}
              />
              <Label htmlFor="focus-mode" className="text-sm cursor-pointer whitespace-nowrap flex items-center gap-1">
                <Zap className={cn('h-3.5 w-3.5', focusMode && 'text-[hsl(var(--warning))]')} />
                {t('crm.focusMode')}
              </Label>
            </div>
            {!focusMode && (
              <div className="flex items-center gap-2">
                <Switch
                  id="my-items"
                  checked={myItemsOnly}
                  onCheckedChange={setMyItemsOnly}
                />
                <Label htmlFor="my-items" className="text-sm cursor-pointer whitespace-nowrap">
                  {t('crm.myItemsOnly')}
                </Label>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div />
          <div className="flex items-center gap-2">
            <NewLeadDialog />
            <CsvLeadImport />
          </div>
        </div>
        <Tabs value={crmView} onValueChange={handleViewChange} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="pipeline" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              {t('crm.pipeline')}
            </TabsTrigger>
            <TabsTrigger value="inbox" className="gap-2">
              <Inbox className="h-4 w-4" />
              {t('crm.followUpInbox')}
              {inboxTotal > 0 && <Badge variant="secondary" className="ml-1">{inboxTotal}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <ListTodo className="h-4 w-4" />
              {t('crm.tasksDue')}
              {tasksTotal > 0 && <Badge variant="secondary" className="ml-1">{tasksTotal}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('crm.analytics')}
            </TabsTrigger>
            <TabsTrigger value="booking-links" className="gap-2">
              <Link2 className="h-4 w-4" />
              {t('crm.bookingLinks', { defaultValue: 'Links de Marcação' })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4">
            <PipelineView
              programFilter={programFilter}
              assigneeFilter={assigneeFilter}
              searchQuery={searchQuery}
              myItemsOnly={focusMode ? true : myItemsOnly}
              currentUserId={user?.id}
              onOpenDrawer={handleOpenDrawer}
            />
          </TabsContent>

          <TabsContent value="inbox" className="space-y-4">
            {loadingInbox ? (
              <ContentSkeleton type="list" count={6} />
            ) : focusMode ? (
              // Focus Mode View - single list of urgent items
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[hsl(var(--warning))]" />
                    {t('crm.focusItems')}
                    <Badge variant="secondary" className="ml-auto">{focusItems.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    {focusItems.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Focus className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="font-medium">{t('crm.noFocusItems')}</p>
                        <p className="text-xs mt-1">{t('crm.noFocusItemsHint', { defaultValue: 'Não existem leads que precisem de atenção imediata. Bom trabalho!' })}</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {focusItems.map(item => {
                          const status = getRelationshipStatus({
                            next_action_at: item.next_action_at,
                            last_activity_at: item.last_activity_at,
                          });
                          const statusConfig = getRelationshipStatusConfig(status);
                          
                          return (
                            <div 
                              key={item.id} 
                              className="p-3 hover:bg-muted/50 cursor-pointer flex items-center gap-3"
                              {...clickableProps(() => handleOpenDrawer(item))}
                            >

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">
                                    {item.organization_name || item.contact_name || t('common.unnamed')}
                                  </p>
                                  <Badge className={cn('h-5 text-[10px]', statusConfig.bgColor, statusConfig.color)}>
                                    {t(`crm.relationshipStatus.${status}`)}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <Badge className={cn('h-5 text-[10px]', STAGE_COLORS[item.stage], 'text-white')}>
                                    {t(`pipeline.stages.${item.stage}`)}
                                  </Badge>
                                  {item.next_action_at && (
                                    <span className={cn(
                                      new Date(item.next_action_at) < new Date() && 'text-[hsl(var(--warning))] font-medium'
                                    )}>
                                      {formatRelativeTime(item.next_action_at)}
                                    </span>
                                  )}
                                  {!item.next_action_at && item.last_activity_at && (
                                    <span className="text-[hsl(var(--warning))]">
                                      {t('crm.lastActivity')}: {formatRelativeTime(item.last_activity_at)}
                                    </span>
                                  )}
                                </div>
                                {item.next_action_description && (
                                  <p className="text-xs text-muted-foreground truncate mt-1">
                                    {item.next_action_description}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              // Normal View - grouped columns
              inboxTotal === 0 ? (
                <div className="text-center py-12">
                  <div className="h-16 w-16 mx-auto rounded-2xl bg-success/10 flex items-center justify-center mb-4">
                    <CheckSquare className="h-8 w-8 text-success" />
                  </div>
                  <p className="text-lg font-semibold">{t('crm.inboxZero.title', { defaultValue: 'Inbox limpo!' })}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('crm.inboxZero.description', { defaultValue: 'Todas as tarefas estão em dia. Bom trabalho!' })}</p>
                </div>
              ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                <InboxGroup 
                  title={t('crm.overdue')} 
                  items={inbox?.overdue || []} 
                  icon={AlertTriangle}
                  iconColor="text-[hsl(var(--warning))]"
                  onOpenDrawer={handleOpenDrawer}
                />
                <InboxGroup 
                  title={t('crm.today')} 
                  items={inbox?.today || []} 
                  icon={Clock}
                  iconColor="text-[hsl(var(--warning))]"
                  onOpenDrawer={handleOpenDrawer}
                />
                <InboxGroup 
                  title={t('crm.upcoming')} 
                  items={inbox?.upcoming || []} 
                  icon={Calendar}
                  iconColor="text-[hsl(var(--info))]"
                  onOpenDrawer={handleOpenDrawer}
                />
                <InboxGroup 
                  title={t('crm.noNextAction')} 
                  items={inbox?.noNextAction || []} 
                  icon={CheckSquare}
                  iconColor="text-muted-foreground"
                  onOpenDrawer={handleOpenDrawer}
                />
                <InboxGroup 
                  title={t('crm.stale')} 
                  items={inbox?.stale || []} 
                  icon={Ghost}
                  iconColor="text-[hsl(var(--warning))]"
                  onOpenDrawer={handleOpenDrawer}
                  tooltip={t('crm.staleTooltip', { defaultValue: 'Commercial opportunities with no recent activity and no scheduled next action.' })}
                />
              </div>
              )
            )}
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            {loadingTasks ? (
              <ContentSkeleton type="list" count={6} />
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                <TaskGroup 
                  title={t('crm.overdue')} 
                  tasks={tasksDue?.overdue || []} 
                  iconColor="text-destructive"
                  onComplete={(id) => completeTask.mutate({ taskId: id })}
                />
                <TaskGroup 
                  title={t('crm.today')} 
                  tasks={tasksDue?.today || []} 
                  iconColor="text-[hsl(var(--warning))]"
                  onComplete={(id) => completeTask.mutate({ taskId: id })}
                />
                <TaskGroup 
                  title={t('crm.upcoming')} 
                  tasks={tasksDue?.upcoming || []} 
                  iconColor="text-[hsl(var(--info))]"
                  onComplete={(id) => completeTask.mutate({ taskId: id })}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <PipelineForecastCard pipeline={pipelineForForecast} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <EmailSyncHealthPanel />
              <EmailReviewQueue />
            </div>
            <CrmAnalyticsDashboard />
          </TabsContent>

          <TabsContent value="booking-links" className="space-y-6">
            <BookingLinksManager />
            <IntakeRoutingManager showBookingLinks={false} />
          </TabsContent>
        </Tabs>

        <RecordDrawer
          item={selectedItem}
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setSelectedItem(null);
              const next = new URLSearchParams(searchParams);
              next.delete('open');
              setSearchParams(next, { replace: true });
            }
          }}
          siblingIds={siblingIds}
          onNavigateSibling={handleNavigateSibling}
        />
      </div>
    </AppLayout>
  );
}

function InboxGroup({ 
  title, 
  items, 
  icon: Icon, 
  iconColor,
  onOpenDrawer,
  tooltip,
}: { 
  title: string; 
  items: CrmInboxItem[];
  icon: typeof AlertTriangle;
  iconColor: string;
  onOpenDrawer: (item: CrmInboxItem) => void;
  tooltip?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className={cn('h-4 w-4', iconColor)} />
          <span title={tooltip} className={tooltip ? 'cursor-help' : undefined}>{title}</span>
          <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          {items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Icon className={cn('h-8 w-8 mx-auto mb-2 opacity-20', iconColor)} />
              <p className="text-sm font-medium">{t('crm.noItems')}</p>
              <p className="text-xs mt-1 opacity-70">{t('crm.emptyColumnHint', { defaultValue: 'Nenhum lead nesta categoria.' })}</p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map(item => (
                <div 
                  key={item.id} 
                  className="p-3 hover:bg-muted/50 cursor-pointer flex items-center gap-3"
                  {...clickableProps(() => onOpenDrawer(item))}
                >

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {item.organization_name || item.contact_name || t('common.unnamed')}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge className={cn('h-5 text-[10px]', STAGE_COLORS[item.stage], 'text-white')}>
                        {t(`pipeline.stages.${item.stage}`)}
                      </Badge>
                      {item.next_action_at && (
                        <span className={cn(
                          new Date(item.next_action_at) < new Date() && 'text-destructive'
                        )}>
                          {formatRelativeTime(item.next_action_at)}
                        </span>
                      )}
                    </div>
                    {item.next_action_description && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {item.next_action_description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function TaskGroup({ 
  title, 
  tasks, 
  iconColor,
  onComplete 
}: { 
  title: string; 
  tasks: any[];
  iconColor: string;
  onComplete: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CheckSquare className={cn('h-4 w-4', iconColor)} />
          {title}
          <Badge variant="secondary" className="ml-auto">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          {tasks.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">{t('crm.noTasks', { defaultValue: 'Sem tarefas' })}</p>
              <p className="text-xs mt-1 opacity-70">{t('crm.noTasksHint', { defaultValue: 'Nenhuma tarefa nesta categoria.' })}</p>
            </div>
          ) : (
            <div className="divide-y">
              {tasks.map(task => (
                <div key={task.id} className="p-3 flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => onComplete(task.id)}
                  >
                    <CheckSquare className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{task.subject}</p>
                    {task.due_at && (
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(task.due_at)}
                      </p>
                    )}
                  </div>
                  {task.priority && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        'text-xs shrink-0',
                        task.priority === 'high' && 'border-destructive text-destructive',
                        task.priority === 'medium' && 'border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]',
                      )}
                    >
                      {t(`crm.${task.priority}`)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

