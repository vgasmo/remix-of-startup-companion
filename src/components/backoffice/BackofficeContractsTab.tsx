import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, FileText, Search, Clock, AlertTriangle, Cake, Zap, Building2 } from 'lucide-react';
import { useContracts, useIncubationTypes, useBuildings, useCreateContract, useUpdateContract, type StartupContract, type IncubationType } from '@/hooks/useBackoffice';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { format, differenceInMonths, addYears, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";
import { supabase } from '@/lib/supabaseClient';
import { ContractUploadDropzone, type AIExtractedData } from './contracts/ContractUploadDropzone';
import { ContractReviewForm, type ContractFormValues } from './contracts/ContractReviewForm';
import { BulkActionsBar } from './contracts/BulkActionsBar';
import { ContractDetailDrawer } from './contracts/ContractDetailDrawer';
import { ProvenanceBadge } from '@/components/shared/ProvenanceBadge';
import { LifecycleMismatchPanel } from '@/components/staff/LifecycleMismatchPanel';
import { useContractIntakes } from '@/hooks/useContractIntakes';
import { useFunnelItems } from '@/hooks/useFunnel';
import { useUrlParam } from '@/hooks/useUrlParam';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pending_signature: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  suspended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  terminated: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-muted text-muted-foreground',
};

function getIncubationTenure(startDate: string) {
  const start = new Date(startDate);
  const now = new Date();
  const months = differenceInMonths(now, start);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return { months, years, remainingMonths };
}

function getAnniversaryAlert(startDate: string) {
  const start = new Date(startDate);
  const now = new Date();
  const { years, months } = getIncubationTenure(startDate);
  if (months >= 33) {
    return {
      type: 'year3' as const,
      severity: 'critical' as const,
      messageKey: months >= 36 ? 'over3Years' : 'approaching3Years',
    };
  }
  const nextAnniversary = addYears(start, years + 1);
  const daysUntil = differenceInDays(nextAnniversary, now);
  if (daysUntil > 0 && daysUntil <= 30) {
    return {
      type: 'anniversary' as const,
      severity: years >= 2 ? 'warning' as const : 'info' as const,
      messageKey: 'yearAnniversary',
      messageParams: { year: years + 1, days: daysUntil },
    };
  }
  return null;
}

type FlowState = 'idle' | 'upload' | 'review';

export function BackofficeContractsTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Upload + Review flow
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [aiData, setAiData] = useState<AIExtractedData>({});
  const [documentUrl, setDocumentUrl] = useState<string>('');
  const [isAIPopulated, setIsAIPopulated] = useState(false);
  const [crmFunnelId, setCrmFunnelId] = useState<string | null>(null);
  const [crmOrgName, setCrmOrgName] = useState<string | null>(null);
  const [crmWorkspaceId, setCrmWorkspaceId] = useState<string | null>(null);

  // Auto-open review form when coming from CRM with action=create
  const crmInitRef = useRef(false);
  useEffect(() => {
    if (crmInitRef.current) return;
    const action = searchParams.get('action');
    const funnelId = searchParams.get('funnel');
    const org = searchParams.get('org');
    const workspaceParam = searchParams.get('workspace');
    
    if (action === 'create' && funnelId) {
      crmInitRef.current = true;
      setCrmFunnelId(funnelId);
      setCrmOrgName(org);
      setCrmWorkspaceId(workspaceParam || null);
      setAiData({});
      setDocumentUrl('');
      setIsAIPopulated(false);
      setFlowState('review');
      // Clean URL params after consuming
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      newParams.delete('funnel');
      newParams.delete('contact');
      newParams.delete('email');
      newParams.delete('org');
      newParams.delete('workspace');
      setSearchParams(newParams, { replace: true });
    }
  }, []);

  // Bulk contract creation state
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<string>>(new Set());
  const [bulkIncubationType, setBulkIncubationType] = useState<string>('');
  const [bulkBuilding, setBulkBuilding] = useState<string>('');
  const [isBulkCreating, setIsBulkCreating] = useState(false);

  // Table row selection for bulk actions
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(new Set());
  const [isArchiving, setIsArchiving] = useState(false);
  const [detailContract, setDetailContract] = useState<StartupContract | null>(null);
  const [contractIdFromUrl, setContractIdInUrl] = useUrlParam('contract');

  const openContractDrawer = useCallback((contract: StartupContract | null) => {
    // URL is the source of truth — push a history entry so browser back/forward toggles the drawer.
    setContractIdInUrl(contract ? contract.id : null);
  }, [setContractIdInUrl]);

  const { data: contracts, isLoading } = useContracts(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );
  const { data: incubationTypes } = useIncubationTypes();
  const { data: buildings } = useBuildings();
  const { data: workspaces } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);
  const { data: intakes } = useContractIntakes();
  const { data: crmItems } = useFunnelItems();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();

  // Sync drawer state from URL — reacts to deep-links and to browser back/forward.
  useEffect(() => {
    if (!contractIdFromUrl) {
      setDetailContract(null);
      return;
    }
    if (!contracts) return; // wait for data; effect will re-run when loaded
    const match = contracts.find(c => c.id === contractIdFromUrl) || null;
    setDetailContract(prev => (prev?.id === contractIdFromUrl ? prev : match));
  }, [contractIdFromUrl, contracts]);

  // Workspaces without contracts
  const workspacesWithoutContracts = useMemo(() => {
    if (!workspaces || !contracts) return [];
    const contractedWorkspaceIds = new Set(contracts.map(c => c.workspace_id));
    return workspaces.filter(w => !contractedWorkspaceIds.has(w.id));
  }, [workspaces, contracts]);

  // Resolve default workspace from CRM params
  const resolvedDefaultWorkspaceId = useMemo(() => {
    if (crmWorkspaceId) return crmWorkspaceId;
    if (!crmOrgName || !workspaces) return undefined;
    const orgLower = crmOrgName.toLowerCase();
    const match = workspaces.find(w => (w as any).startup?.name?.toLowerCase() === orgLower);
    return match?.id;
  }, [crmWorkspaceId, crmOrgName, workspaces]);

  const toggleWorkspaceSelection = (workspaceId: string) => {
    setSelectedWorkspaces(prev => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId); else next.add(workspaceId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedWorkspaces.size === workspacesWithoutContracts.length) {
      setSelectedWorkspaces(new Set());
    } else {
      setSelectedWorkspaces(new Set(workspacesWithoutContracts.map(w => w.id)));
    }
  };

  const handleBulkCreateContracts = async () => {
    if (selectedWorkspaces.size === 0) {
      notify.error(t('admin.backoffice.selectWorkspacesFirst', { defaultValue: 'Select workspaces first' }));
      return;
    }
    const selectedType = incubationTypes?.find(it => it.id === bulkIncubationType);
    setIsBulkCreating(true);
    let created = 0, errors = 0;
    for (const workspaceId of selectedWorkspaces) {
      try {
        await createContract.mutateAsync({
          workspace_id: workspaceId,
          incubation_type_id: bulkIncubationType || null,
          building_id: bulkBuilding || null,
          status: 'draft',
          start_date: new Date().toISOString().split('T')[0],
          monthly_fee: selectedType?.base_monthly_fee || 0,
        });
        created++;
      } catch { errors++; }
    }
    setIsBulkCreating(false);
    setSelectedWorkspaces(new Set());
    if (errors > 0) {
      notify.warn(t('admin.backoffice.bulkCreatePartial', { created, errors, defaultValue: 'Created {{created}} draft contracts, {{errors}} failed' }));
    } else {
      notify.success(t('admin.backoffice.bulkCreateSuccess', { count: created, defaultValue: 'Created {{count}} draft contracts successfully' }));
    }
  };

  // Filtered contracts with date range
  const filteredContracts = useMemo(() => {
    return contracts?.filter(c => {
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        const startupName = (c.workspace as any)?.startup?.name?.toLowerCase() || '';
        const contractNum = c.contract_number?.toLowerCase() || '';
        if (!startupName.includes(search) && !contractNum.includes(search)) return false;
      }
      if (dateFrom && c.start_date < dateFrom) return false;
      if (dateTo && c.start_date > dateTo) return false;
      return true;
    });
  }, [contracts, searchQuery, dateFrom, dateTo]);

  // Upload flow handlers
  const handleAIDataExtracted = useCallback((data: AIExtractedData, docUrl: string) => {
    setAiData(data);
    setDocumentUrl(docUrl);
    setIsAIPopulated(Object.keys(data).length > 0);
    setFlowState('review');
  }, []);

  const handleManualEntry = useCallback(() => {
    setAiData({});
    setDocumentUrl('');
    setIsAIPopulated(false);
    setFlowState('review');
  }, []);

  const handleReviewSubmit = useCallback(async (values: ContractFormValues & { document_url?: string }) => {
    const { document_url, incubation_type_id, building_id, discount_reason, equity_percentage, square_meters, notes, end_date, contract_number, workspace_id, ...rest } = values;
    const payload: Record<string, unknown> = {
      ...rest,
      workspace_id: workspace_id || null,
      incubation_type_id: incubation_type_id || null,
      building_id: building_id || null,
      contract_number: contract_number || null,
      end_date: end_date || null,
      discount_reason: discount_reason || null,
      equity_percentage: equity_percentage || null,
      square_meters: square_meters || null,
      notes: notes || null,
      document_url: document_url || null,
      discount_applied_by: user?.id,
      funnel_item_id: crmFunnelId || null,
      organization_name: crmOrgName || null,
    };
    const newContract = await createContract.mutateAsync(payload);

    // Link the funnel item back to this contract
    if (crmFunnelId && newContract?.id) {
      await supabase
        .from('funnel_items')
        .update({ linked_contract_id: newContract.id } as any)
        .eq('id', crmFunnelId);
    }

    setFlowState('idle');
    setAiData({});
    setDocumentUrl('');
    setCrmFunnelId(null);
    setCrmOrgName(null);
    setCrmWorkspaceId(null);
  }, [createContract, user?.id, crmFunnelId]);

  const handleCancelReview = useCallback(() => {
    setFlowState('idle');
    setAiData({});
    setDocumentUrl('');
  }, []);

  // Bulk table actions
  const toggleContractSelection = (id: string) => {
    setSelectedContractIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllContracts = () => {
    if (!filteredContracts) return;
    if (selectedContractIds.size === filteredContracts.length) {
      setSelectedContractIds(new Set());
    } else {
      setSelectedContractIds(new Set(filteredContracts.map(c => c.id)));
    }
  };

  const handleArchiveSelected = async () => {
    setIsArchiving(true);
    let archived = 0;
    for (const id of selectedContractIds) {
      try {
        await updateContract.mutateAsync({ id, status: 'terminated' });
        archived++;
      } catch { /* skip */ }
    }
    setSelectedContractIds(new Set());
    setIsArchiving(false);
    notify.success(t('contracts.bulk.archiveSuccess', { count: archived, defaultValue: '{{count}} contracts archived' }));
  };

  return (
    <div className="space-y-4">
      {/* Stream F: provenance & lifecycle truth header */}
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge variant="contract-truth" />
        <span className="text-[11px] text-muted-foreground">
          {t('contracts.truthHint', {
            defaultValue: 'Cópias derivadas (CRM, SharePoint) são informativas e não substituem este registo.',
          })}
        </span>
      </div>

      <LifecycleMismatchPanel
        contracts={contracts || []}
        intakes={intakes || []}
        crmItems={(crmItems || []).map((i: any) => ({
          id: i.id,
          stage: i.stage,
          linked_contract_id: i.linked_contract_id,
          organization_name: i.organization_name,
        }))}
        workspaces={(workspaces || []).map((w: any) => ({
          id: w.id,
          status: w.status,
          startup_id: w.startup_id,
        }))}
        onOpenContract={(id) => {
          const c = (contracts || []).find((x) => x.id === id) || null;
          openContractDrawer(c);
        }}
      />

      {/* Upload Hero Section */}
      {flowState === 'idle' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ContractUploadDropzone
            onAIDataExtracted={handleAIDataExtracted}
            onManualEntry={handleManualEntry}
          />
          <Card className="flex flex-col justify-center">
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-sm font-semibold">
                {t('contracts.upload.howItWorks', { defaultValue: 'How it works' })}
              </h3>
              <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                <li>{t('contracts.upload.step1', { defaultValue: 'Upload a contract PDF or enter data manually' })}</li>
                <li>{t('contracts.upload.step2', { defaultValue: 'AI extracts key dates, fees, and parties' })}</li>
                <li>{t('contracts.upload.step3', { defaultValue: 'Review and edit the extracted data' })}</li>
                <li>{t('contracts.upload.step4', { defaultValue: 'Save the contract to the database' })}</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Review Form (Post-Upload or Manual) */}
      {flowState === 'review' && (
        <div className="space-y-3">
          {crmFunnelId && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3 px-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {t('contracts.fromCRM', { org: crmOrgName || 'Lead', defaultValue: 'Criar contrato para: {{org}}' })}
                </span>
                {!resolvedDefaultWorkspaceId && crmOrgName && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t('contracts.noWorkspaceInfo', { defaultValue: 'O workspace será criado automaticamente quando o contrato for assinado' })}
                  </Badge>
                )}
                <Badge variant="outline" className="ml-auto text-xs">CRM</Badge>
              </CardContent>
            </Card>
          )}
          <ContractReviewForm
            aiData={aiData}
            documentUrl={documentUrl}
            isAIPopulated={isAIPopulated}
            workspaces={workspaces || []}
            incubationTypes={incubationTypes}
            buildings={buildings}
            onSubmit={handleReviewSubmit}
            onCancel={() => {
              handleCancelReview();
              setCrmFunnelId(null);
              setCrmOrgName(null);
              setCrmWorkspaceId(null);
            }}
            isSubmitting={createContract.isPending}
            defaultWorkspaceId={resolvedDefaultWorkspaceId}
            fromCRM={!!crmFunnelId}
            crmOrgName={crmOrgName}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('admin.backoffice.searchContracts', { defaultValue: 'Search contracts...' })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('admin.backoffice.allStatuses', { defaultValue: 'All Statuses' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.backoffice.allStatuses', { defaultValue: 'All Statuses' })}</SelectItem>
            {Object.keys(STATUS_COLORS).map(key => (
              <SelectItem key={key} value={key}>{t(`admin.backoffice.contractStatus.${key}`, { defaultValue: key })}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            {t('contracts.filters.dateRange', { defaultValue: 'Date Range' })}
          </Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
          />
        </div>

        {flowState === 'idle' && (
          <Button onClick={() => setFlowState('upload')} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t('admin.backoffice.newContract', { defaultValue: 'New Contract' })}
          </Button>
        )}
      </div>

      {/* Upload inline (if triggered from + button) */}
      {flowState === 'upload' && (
        <ContractUploadDropzone
          onAIDataExtracted={handleAIDataExtracted}
          onManualEntry={handleManualEntry}
          onCancel={() => setFlowState('idle')}
        />
      )}

      {/* Workspaces Without Contracts - Bulk Create (collapsed by default to reduce noise) */}
      {workspacesWithoutContracts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <details className="group">
            <summary className="list-none cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-base">
                  <Zap className="h-5 w-5" />
                  {t('admin.backoffice.workspacesWithoutContracts', { defaultValue: 'Workspaces Without Contracts' })}
                  <Badge variant="secondary" className="ml-2 bg-amber-200 dark:bg-amber-800">
                    {workspacesWithoutContracts.length}
                  </Badge>
                  <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
                    {t('common.expand', { defaultValue: 'Expand' })}
                  </span>
                  <span className="ml-auto text-xs font-normal text-muted-foreground hidden group-open:inline">
                    {t('common.collapse', { defaultValue: 'Collapse' })}
                  </span>
                </CardTitle>
                <CardDescription>
                  {t('admin.backoffice.bulkCreateDescription', { defaultValue: 'Select workspaces and create internal draft contracts in bulk. Drafts are not sent to founders until you explicitly send each one for signature.' })}
                </CardDescription>
              </CardHeader>
            </summary>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end bg-background/80 p-3 rounded-lg border">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('admin.backoffice.incubationType', { defaultValue: 'Incubation Type' })}</Label>
                  <Select value={bulkIncubationType} onValueChange={setBulkIncubationType}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={t('admin.backoffice.selectType', { defaultValue: 'Select type' })} />
                    </SelectTrigger>
                    <SelectContent>
                      {incubationTypes?.map(it => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.name} (€{it.base_monthly_fee}/mo)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('admin.backoffice.building', { defaultValue: 'Building' })}</Label>
                  <Select value={bulkBuilding} onValueChange={setBulkBuilding}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={t('admin.backoffice.selectBuilding', { defaultValue: 'Select building' })} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.none', { defaultValue: 'None' })}</SelectItem>
                      {buildings?.filter(b => b.is_active).map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {b.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleBulkCreateContracts}
                  disabled={selectedWorkspaces.size === 0 || isBulkCreating}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isBulkCreating
                    ? t('common.processing', { defaultValue: 'Processing...' })
                    : t('admin.backoffice.createContractsCount', { count: selectedWorkspaces.size, defaultValue: 'Create {{count}} Contracts' })}
                </Button>
              </div>
              <div className="max-h-64 overflow-auto border rounded-lg bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedWorkspaces.size === workspacesWithoutContracts.length && workspacesWithoutContracts.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>{t('admin.backoffice.startup', { defaultValue: 'Startup' })}</TableHead>
                      <TableHead>{t('admin.backoffice.stage', { defaultValue: 'Stage' })}</TableHead>
                      <TableHead>{t('admin.backoffice.createdAt', { defaultValue: 'Created' })}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspacesWithoutContracts.map(workspace => (
                      <TableRow key={workspace.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedWorkspaces.has(workspace.id)}
                            onCheckedChange={() => toggleWorkspaceSelection(workspace.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {workspace.startup?.name || t('common.unnamed', { defaultValue: 'Unnamed' })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{workspace.stage || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {workspace.created_at ? format(new Date(workspace.created_at), 'dd MMM yyyy') : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </details>
        </Card>
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedContractIds.size}
        onArchive={handleArchiveSelected}
        onClearSelection={() => setSelectedContractIds(new Set())}
        isArchiving={isArchiving}
      />

      {/* Contracts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('admin.backoffice.contracts', { defaultValue: 'Contracts' })}
            <Badge variant="secondary" className="ml-2">{filteredContracts?.length || 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading', { defaultValue: 'Loading...' })}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredContracts?.length ? selectedContractIds.size === filteredContracts.length : false}
                      onCheckedChange={toggleAllContracts}
                    />
                  </TableHead>
                  <TableHead>{t('admin.backoffice.startup', { defaultValue: 'Startup' })}</TableHead>
                  <TableHead>{t('admin.backoffice.contractNumber', { defaultValue: 'Contract Number' })}</TableHead>
                  <TableHead>{t('admin.backoffice.type', { defaultValue: 'Type' })}</TableHead>
                  <TableHead>{t('admin.backoffice.building', { defaultValue: 'Building' })}</TableHead>
                  <TableHead>{t('admin.backoffice.timeIncubated', { defaultValue: 'Time Incubated' })}</TableHead>
                  <TableHead>{t('admin.backoffice.status', { defaultValue: 'Status' })}</TableHead>
                  <TableHead>{t('admin.backoffice.monthlyFee', { defaultValue: 'Monthly Fee' })}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts?.map(contract => {
                  const statusClassName = STATUS_COLORS[contract.status];
                  const startup = (contract.workspace as any)?.startup;
                  const incubationType = contract.incubation_type as IncubationType | null;
                  const building = contract.building as { name: string; city?: string } | null;
                  const tenure = getIncubationTenure(contract.start_date);
                  const alert = contract.status === 'active' ? getAnniversaryAlert(contract.start_date) : null;

                  return (
                    <TableRow
                      key={contract.id}
                      className={cn(
                        'cursor-pointer',
                        alert?.severity === 'critical' && 'bg-red-50/50 dark:bg-red-950/10',
                        selectedContractIds.has(contract.id) && 'bg-primary/5'
                      )}
                      onClick={() => openContractDrawer(contract)}
                    >
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedContractIds.has(contract.id)}
                          onCheckedChange={() => toggleContractSelection(contract.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{startup?.name || (contract as any).organization_name || t('common.unnamed', { defaultValue: 'Unnamed' })}</TableCell>
                      <TableCell className="text-muted-foreground">{contract.contract_number || '-'}</TableCell>
                      <TableCell>{incubationType?.name || '-'}</TableCell>
                      <TableCell>
                        {building ? (
                          <span className="text-sm">
                            {building.name}
                            {building.city && <span className="text-muted-foreground text-xs block">{building.city}</span>}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  'flex items-center gap-1 text-sm',
                                  tenure.years >= 3 && 'text-red-600 font-medium',
                                  tenure.years === 2 && 'text-yellow-600'
                                )}>
                                  <Clock className="h-3 w-3" />
                                  {tenure.years > 0 ? <span>{tenure.years}y {tenure.remainingMonths}m</span> : <span>{tenure.months}m</span>}
                                </div>
                                {alert && (
                                  <div className={cn(
                                    alert.severity === 'critical' && 'text-red-600',
                                    alert.severity === 'warning' && 'text-yellow-600',
                                    alert.severity === 'info' && 'text-blue-600',
                                  )}>
                                    {alert.type === 'year3' ? <AlertTriangle className="h-4 w-4" /> : <Cake className="h-4 w-4" />}
                                  </div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div>{t('admin.backoffice.startedOn', { defaultValue: 'Started on' })}: {format(new Date(contract.start_date), 'dd MMM yyyy')}</div>
                                <div>{t('admin.backoffice.totalMonths', { defaultValue: 'Total months' })}: {tenure.months} {t('admin.backoffice.months', { defaultValue: 'months' })}</div>
                                {alert && (
                                  <div className={cn(
                                    'mt-1 font-medium',
                                    alert.severity === 'critical' && 'text-red-400',
                                    alert.severity === 'warning' && 'text-yellow-400',
                                  )}>
                                    {t(`admin.backoffice.dashboardPanel.${alert.messageKey}`, alert.messageParams || {})}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-xs', statusClassName)}>
                          {t(`admin.backoffice.contractStatus.${contract.status}`, { defaultValue: contract.status })}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          €{contract.monthly_fee.toFixed(2)}
                          {contract.discount_percentage > 0 && (
                            <span className="text-green-600 text-xs ml-1">(-{contract.discount_percentage}%)</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => openContractDrawer(contract)}>
                          {t('common.edit', { defaultValue: 'Edit' })}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredContracts?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {t('admin.backoffice.noContracts', { defaultValue: 'No contracts found' })}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Contract Detail Drawer */}
      <ContractDetailDrawer
        contract={detailContract ? (contracts?.find(c => c.id === detailContract.id) || detailContract) : null}
        incubationTypes={incubationTypes}
        buildings={buildings}
        open={!!detailContract}
        onOpenChange={(open) => { if (!open) openContractDrawer(null); }}
      />
    </div>
  );
}
