import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, Building2, FileText, Euro, Clock, Save, X, Pencil, Info, 
  TrendingUp, AlertTriangle, ExternalLink, LinkIcon, Calculator,
  FileDown, Loader2, Shield, RefreshCw, CheckCircle2, XCircle, Send,
  GitBranch
} from 'lucide-react';
import { format, differenceInMonths, differenceInDays, addYears, subDays } from 'date-fns';
import { useUpdateContract, type StartupContract } from '@/hooks/useBackoffice';
import { useCurrentPricingTable, findMatchingPricingLine, getIncubationYear } from '@/hooks/backoffice/usePricingLines';
import { ContractDiscountsPanel } from '@/components/contracts/ContractDiscountsPanel';
import { ContractIntelligenceCard } from '@/components/contracts/ContractIntelligenceCard';
import { PricingBreakdown } from '@/components/contracts/PricingBreakdown';
import { ContractStatusBadge } from './ContractStatusBadge';
import { RenewContractDialog } from './RenewContractDialog';
import { TerminateContractDialog } from './TerminateContractDialog';

import { ContractLifecycleStepper } from '@/components/contracts/ContractLifecycleStepper';
import { ContractReadinessChecklist } from '@/components/contracts/ContractReadinessChecklist';
import { ProvenanceBadge } from '@/components/shared/ProvenanceBadge';
import { calculateContractPricing, type PricingInput } from '@/lib/pricingEngine';
import { nextAnniversary as computeNextAnniversary } from '@/lib/contractLifecycle';
import { supabase } from '@/lib/supabaseClient';
import { canonicalMarkAsSent, canonicalMarkAsSigned } from '@/lib/contractLifecycleSync';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

const STATUS_OPTIONS = ['draft', 'pending_signature', 'active', 'suspended', 'terminated', 'expired'];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_signature: 'bg-warning/10 text-warning',
  active: 'bg-success/10 text-success',
  suspended: 'bg-warning/10 text-warning',
  terminated: 'bg-destructive/10 text-destructive',
  expired: 'bg-muted text-muted-foreground',
};

interface ContractDetailDrawerProps {
  contract: StartupContract | null;
  incubationTypes?: any[];
  buildings?: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContractDetailDrawer({ contract, incubationTypes, buildings, open, onOpenChange }: ContractDetailDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const contractId = contract?.id ?? '';
  const updateContract = useUpdateContract();
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState('details');
  const [renewOpen, setRenewOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);

  const { data: pricingTable } = useCurrentPricingTable();

  // Fetch discounts for pricing engine
  const { data: discounts } = useQuery({
    queryKey: ['contract-discounts', contract?.id],
    queryFn: async () => {
      if (!contract?.id) return [];
      const { data, error } = await supabase
        .from('contract_discounts')
        .select('*')
        .eq('contract_id', contract.id)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contract?.id,
  });

  // Stream F: Fetch linked intake (read-only) for readiness checklist + provenance
  const { data: linkedIntake } = useQuery({
    queryKey: ['contract-linked-intake', contract?.id],
    queryFn: async () => {
      if (!contract?.id) return null;
      const { data } = await supabase
        .from('contract_intakes')
        .select('*')
        .eq('contract_id', contract.id)
        .maybeSingle();
      return data || null;
    },
    enabled: !!contract?.id,
  });

  // Fetch linked funnel item
  const { data: linkedFunnelItem } = useQuery({
    queryKey: ['contract-funnel-link', contract?.id],
    queryFn: async () => {
      if (!contract?.funnel_item_id) return null;
      const { data, error } = await supabase
        .from('funnel_items')
        .select('id, organization_name, contact_name, stage')
        .eq('id', contract.funnel_item_id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!contract?.funnel_item_id,
  });

  const startup = contract ? (contract.workspace as any)?.startup : null;
  const incubationType = contract ? contract.incubation_type as any : null;
  const building = contract ? contract.building as any : null;
  const startDate = contract ? new Date(contract.start_date) : new Date();
  const now = new Date();
  const months = contract ? differenceInMonths(now, startDate) : 0;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  const nextAnniversary = contract
    ? computeNextAnniversary({ start_date: contract.start_date, end_date: contract.end_date ?? null, status: contract.status }, now)
    : addYears(startDate, years + 1);
  const daysUntilAnniversary = differenceInDays(nextAnniversary, now);
  const endDate = contract?.end_date ? new Date(contract.end_date) : null;
  const daysUntilEnd = endDate ? differenceInDays(endDate, now) : null;

  // Calculate pricing using the canonical engine with pricing lines
  const pricing = useMemo(() => {
    if (!incubationType || !contract) return null;

    // Find matching pricing line from the official table
    const matchedLine = pricingTable?.lines
      ? findMatchingPricingLine(pricingTable.lines, incubationType.id, contract.square_meters)
      : null;

    const incubationYear = getIncubationYear(contract.start_date);

    const input: PricingInput = {
      incubationType: {
        id: incubationType.id,
        name: incubationType.name,
        base_monthly_fee: incubationType.base_monthly_fee || 0,
        base_currency: incubationType.base_currency || 'EUR',
        price_per_sqm: incubationType.price_per_sqm,
        requires_space: incubationType.requires_space || false,
        is_virtual: incubationType.is_virtual || false,
        equity_percentage: incubationType.equity_percentage,
        contract_type: incubationType.contract_type,
      },
      building: building ? { id: building.id, name: building.name, code: building.code } : null,
      squareMeters: contract.square_meters,
      discounts: discounts || [],
      contractStartDate: contract.start_date,
      pricingLine: matchedLine ? {
        id: matchedLine.id,
        designation: matchedLine.designation,
        startup_monthly_fee: matchedLine.startup_monthly_fee,
        non_startup_monthly_fee: matchedLine.non_startup_monthly_fee,
        startup_annual_increase_pct: matchedLine.startup_annual_increase_pct,
        non_startup_annual_increase_pct: matchedLine.non_startup_annual_increase_pct,
        area_sqm: matchedLine.area_sqm,
        is_per_sqm: matchedLine.is_per_sqm,
        is_post_incubation: matchedLine.is_post_incubation,
        max_duration_months: matchedLine.max_duration_months,
        billing_frequency: matchedLine.billing_frequency,
        location_type: matchedLine.location_type,
      } : undefined,
      incubationYear,
      pricingVersionCode: pricingTable?.version?.version_code || 'V11-MAR-2026',
      startupCategory: 'startup',
    };
    return calculateContractPricing(input);
  }, [incubationType, building, contract, discounts, pricingTable]);

  // Generate PDF mutation
  const generatePdf = useMutation({
    mutationFn: async () => {
      const result = await invokeWithAuth<{ documentBase64?: string; fileName?: string }>('generate-contract-pdf', { body: { contractId: contract?.id } });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data) => {
      notify.success(t('contractDetail.pdfGenerated', { defaultValue: 'PDF do contrato gerado com sucesso' }));
      // Auto-download
      if (data?.documentBase64) {
        const byteChars = atob(data.documentBase64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName || 'contrato.pdf';
        a.click();
        URL.revokeObjectURL(url);
      }
    },
    onError: (err) => {
      logger.error('PDF generation error', {}, err);
      notify.error(t('contractDetail.pdfGenerationFailed', { defaultValue: 'Erro ao gerar PDF' }));
    },
  });

  if (!contract) return null;

  const startEditing = () => {
    setEditValues({
      contract_number: contract.contract_number || '',
      status: contract.status,
      monthly_fee: contract.monthly_fee,
      start_date: contract.start_date,
      end_date: contract.end_date || '',
      notes: contract.notes || '',
      incubation_type_id: incubationType?.id || '',
      building_id: building?.id || '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      await updateContract.mutateAsync({
        id: contract.id,
        ...editValues,
        end_date: editValues.end_date || null,
        incubation_type_id: editValues.incubation_type_id || null,
        building_id: editValues.building_id || null,
        notes: editValues.notes || null,
      });
      setIsEditing(false);
      notify.success(t('contracts.updated'));
    } catch {
      notify.error(t('contracts.updateFailed'));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValues({});
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setIsEditing(false); setActiveTab('details'); } }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <SheetHeader className="pb-0">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <span className="truncate">{startup?.name || t('common.unnamed')}</span>
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-1">
                  {contract.contract_number || t('contracts.noNumber')}
                  <span className="text-muted-foreground/50">·</span>
                  <ContractStatusBadge status={contract.status} />
                </SheetDescription>
                {/* Stream F: provenance badges */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <ProvenanceBadge variant="contract-truth" />
                  {linkedIntake && (
                    <ProvenanceBadge variant="intake-state" value={linkedIntake.status} />
                  )}
                  {linkedFunnelItem?.stage && (
                    <ProvenanceBadge variant="crm-phase" value={linkedFunnelItem.stage} />
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0 ml-3">
                {isEditing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={handleCancel} className="h-8 px-2">
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={updateContract.isPending} loading={updateContract.isPending} className="h-8 gap-1.5">
                      <Save className="h-3.5 w-3.5" />
                      {t('common.save')}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={startEditing} className="h-8 gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    {t('common.edit')}
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Incubation Timeline Bar */}
          <div className={cn(
            'mt-3 flex items-center gap-3 rounded-lg px-3 py-2',
            years >= 3 ? 'bg-destructive/10 text-destructive' :
            years >= 2 ? 'bg-warning/10 text-warning' :
            'bg-primary/5 text-foreground'
          )}>
            <Clock className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">
                {years > 0
                  ? `${years} ${t('common.years')} ${remainingMonths > 0 ? `${remainingMonths} ${t('common.months')}` : ''}`
                  : `${months} ${t('common.months')}`
                }
              </span>
              <span className="text-xs ml-2 opacity-70">
                {t('admin.backoffice.startedOn')}: {format(startDate, 'dd MMM yyyy')}
              </span>
            </div>
            {years >= 3 && <AlertTriangle className="h-4 w-4 shrink-0" />}
          </div>

          {/* Quick alerts */}
          {(daysUntilEnd !== null && daysUntilEnd <= 90 && daysUntilEnd > 0) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-warning bg-warning/10 rounded-lg px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('lifecycle.renewalWarningDesc', { days: daysUntilEnd })}
            </div>
          )}
          {(daysUntilAnniversary > 0 && daysUntilAnniversary <= 30) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-info bg-info/10 rounded-lg px-3 py-1.5">
              <Info className="h-3.5 w-3.5" />
              {t('lifecycle.anniversary', { year: years + 1 })} — {daysUntilAnniversary} {t('lifecycle.daysRemaining', { count: daysUntilAnniversary })}
            </div>
          )}

          {/* Quick Cross-Links Bar */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {contract.workspace_id && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => navigate(`/workspace/${contract.workspace_id}`)}
              >
                <ExternalLink className="h-3 w-3" />
                {t('contractDetail.viewWorkspace')}
              </Button>
            )}
            {linkedFunnelItem && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => navigate(`/crm?open=${contract.funnel_item_id}`)}
              >
                <LinkIcon className="h-3 w-3" />
                {t('contractDetail.viewInCRM')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => generatePdf.mutate()}
              disabled={generatePdf.isPending} loading={generatePdf.isPending}
            >
              {generatePdf.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
              {t('contractDetail.generatePDF', { defaultValue: 'Gerar PDF' })}
            </Button>
            {contract.status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setRenewOpen(true)}
              >
                <RefreshCw className="h-3 w-3" />
                {t('contractDetail.renewCta', { defaultValue: 'Renovar' })}
              </Button>
            )}
            {['active', 'suspended', 'pending_signature'].includes(contract.status) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setTerminateOpen(true)}
              >
                <XCircle className="h-3 w-3" />
                {t('contractDetail.terminateCta', { defaultValue: 'Terminar' })}
              </Button>
            )}

            {/* Generate public signing link for founder */}
            {['draft', 'pending_signature'].includes(contract.status) && (
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
                      body: { action: 'generate_token', contractId: contract.id },
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    const url = data.url || `${window.location.origin}/contract-signing/${data.token}`;
                    await navigator.clipboard.writeText(url);
                    notify.success(t('contractDetail.linkGenerated', { defaultValue: 'Link público gerado e copiado! Envie ao founder.' }));
                  } catch (err: any) {
                    notify.error(err?.message || 'Erro ao gerar link');
                  }
                }}
              >
                <ExternalLink className="h-3 w-3" />
                {t('contractDetail.generatePublicLink', { defaultValue: 'Gerar Link Público' })}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1 gap-1.5 text-xs">
                <Info className="h-3.5 w-3.5" />
                {t('common.details')}
              </TabsTrigger>
              <TabsTrigger value="signature" className="flex-1 gap-1.5 text-xs">
                <Shield className="h-3.5 w-3.5" />
                {t('contractDetail.signatureTab', { defaultValue: 'Assinatura' })}
              </TabsTrigger>
              <TabsTrigger value="pricing" className="flex-1 gap-1.5 text-xs">
                <Calculator className="h-3.5 w-3.5" />
                {t('contractDetail.pricingTab')}
              </TabsTrigger>
              <TabsTrigger value="discounts" className="flex-1 gap-1.5 text-xs">
                <Euro className="h-3.5 w-3.5" />
                {t('admin.backoffice.discounts')}
              </TabsTrigger>
              <TabsTrigger value="intelligence" className="flex-1 gap-1.5 text-xs">
                <TrendingUp className="h-3.5 w-3.5" />
                {t('contracts.aiAnalysis')}
              </TabsTrigger>
              <TabsTrigger value="lifecycle" className="flex-1 gap-1.5 text-xs">
                <GitBranch className="h-3.5 w-3.5" />
                {t('lifecycle.stepper.tab')}
              </TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="mt-4 space-y-5 pb-8">
              {/* Stream F: Contract readiness checklist (read-only) */}
              <ContractReadinessChecklist contract={contract} intake={linkedIntake as any} />
              {/* Status (editable) */}
              {isEditing && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('admin.backoffice.status')}</Label>
                  <Select value={editValues.status} onValueChange={(v) => setEditValues(p => ({ ...p, status: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>
                          {t(`admin.backoffice.contractStatus.${s}`, { defaultValue: s })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Key Info Grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <FieldDisplay
                  label={t('admin.backoffice.contractNumber')}
                  icon={<FileText className="h-3 w-3" />}
                >
                  {isEditing ? (
                    <Input value={editValues.contract_number} onChange={e => setEditValues(p => ({ ...p, contract_number: e.target.value }))} className="h-8 text-sm" />
                  ) : (
                    <span className="text-sm font-medium">{contract.contract_number || '—'}</span>
                  )}
                </FieldDisplay>

                <FieldDisplay
                  label={t('admin.backoffice.monthlyFee')}
                  icon={<Euro className="h-3 w-3" />}
                >
                  {isEditing ? (
                    <Input type="number" step="0.01" value={editValues.monthly_fee} onChange={e => setEditValues(p => ({ ...p, monthly_fee: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm" />
                  ) : (
                    <span className="text-sm font-semibold">€{contract.monthly_fee.toFixed(2)}</span>
                  )}
                </FieldDisplay>

                <FieldDisplay label={t('admin.backoffice.type')}>
                  {isEditing ? (
                    <Select
                      value={editValues.incubation_type_id || '__none__'}
                      onValueChange={v => {
                        const selectedTypeId = v === '__none__' ? '' : v;
                        const selectedType = incubationTypes?.find(it => it.id === selectedTypeId);
                        setEditValues(p => ({
                          ...p,
                          incubation_type_id: selectedTypeId,
                          monthly_fee: selectedType?.base_monthly_fee ?? p.monthly_fee,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {incubationTypes?.map(it => (
                          <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm font-medium">{incubationType?.name || '—'}</span>
                  )}
                </FieldDisplay>

                <FieldDisplay
                  label={t('admin.backoffice.building')}
                  icon={<Building2 className="h-3 w-3" />}
                >
                  {isEditing ? (
                    <Select
                      value={editValues.building_id || '__none__'}
                      onValueChange={v => setEditValues(p => ({ ...p, building_id: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {buildings?.filter(b => b.is_active).map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm font-medium">{building?.name || '—'}</span>
                  )}
                </FieldDisplay>

                <FieldDisplay
                  label={t('contracts.startDate')}
                  icon={<Calendar className="h-3 w-3" />}
                >
                  {isEditing ? (
                    <Input type="date" value={editValues.start_date} onChange={e => setEditValues(p => ({ ...p, start_date: e.target.value }))} className="h-8 text-sm" />
                  ) : (
                    <span className="text-sm font-medium">{format(startDate, 'dd MMM yyyy')}</span>
                  )}
                </FieldDisplay>

                <FieldDisplay
                  label={t('contracts.endDate')}
                  icon={<Calendar className="h-3 w-3" />}
                >
                  {isEditing ? (
                    <Input type="date" value={editValues.end_date} onChange={e => setEditValues(p => ({ ...p, end_date: e.target.value }))} className="h-8 text-sm" />
                  ) : (
                    <span className="text-sm font-medium">{contract.end_date ? format(new Date(contract.end_date), 'dd MMM yyyy') : '—'}</span>
                  )}
                </FieldDisplay>
              </div>

              <Separator />

              {/* Linked Entities Summary */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  {t('contractDetail.linkedEntities')}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {incubationType && (
                    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2.5 py-1.5">
                      <Badge variant="outline" className="text-[10px]">{incubationType.name}</Badge>
                    </div>
                  )}
                  {building && (
                    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2.5 py-1.5">
                      <Building2 className="h-3 w-3" />
                      {building.name}
                    </div>
                  )}
                  {contract.square_meters && (
                    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2.5 py-1.5">
                      📐 {contract.square_meters} m²
                    </div>
                  )}
                  {linkedFunnelItem && (
                    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2.5 py-1.5">
                      <LinkIcon className="h-3 w-3" />
                      CRM: {linkedFunnelItem.organization_name || linkedFunnelItem.contact_name}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('common.notes')}</Label>
                {isEditing ? (
                  <Textarea value={editValues.notes} onChange={e => setEditValues(p => ({ ...p, notes: e.target.value }))} rows={3} className="text-sm" />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contract.notes || t('contracts.noNotes')}</p>
                )}
              </div>
            </TabsContent>

            {/* Signature Tab */}
            <TabsContent value="signature" className="mt-4 space-y-4 pb-8">
              <SignatureProviderPanel contract={contract} />
            </TabsContent>

            {/* Pricing Tab */}
            <TabsContent value="pricing" className="mt-4 pb-8">
              {pricing ? (
                <PricingBreakdown pricing={pricing} />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t('pricing.noIncubationType', { defaultValue: 'Select an incubation type to see pricing breakdown' })}</p>
                </div>
              )}
            </TabsContent>

            {/* Discounts Tab */}
            <TabsContent value="discounts" className="mt-4 pb-8">
              <ContractDiscountsPanel
                contractId={contract.id}
                monthlyFee={contract.monthly_fee}
                isStaff={true}
                isAdmin={true}
              />
            </TabsContent>

            {/* Intelligence Tab */}
            <TabsContent value="intelligence" className="mt-4 pb-8">
              <ContractIntelligenceCard
                contractId={contract.id}
                contractLabel={startup?.name || (contract as any).organization_name || t('common.unnamed')}
              />
            </TabsContent>

            {/* Lifecycle Tab */}
            <TabsContent value="lifecycle" className="mt-4 pb-8 space-y-4">
              <ContractLifecycleStepper
                contractId={contract.id}
                currentStatus={contract.status}
                workspaceId={contract.workspace_id || undefined}
                startDate={contract.start_date}
                signedAt={contract.signed_at}
                createdAt={contract.created_at}
              />
              
              {/* Biennial Review Status */}
              {contract.start_date && (() => {
                const startDate = new Date(contract.start_date);
                const now = new Date();
                const monthsSince = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
                const yearsSince = Math.floor(monthsSince / 12);
                const nextReviewYear = yearsSince < 2 ? 2 : yearsSince + (yearsSince % 2 === 0 ? 2 : 1);
                const nextReviewDate = addYears(startDate, nextReviewYear);
                const daysToReview = differenceInDays(nextReviewDate, now);
                
                return (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      {t('lifecycle.stepper.biennialReview')}
                    </Label>
                    <div className={cn(
                      'rounded-lg p-3 text-xs',
                      daysToReview <= 90 ? 'bg-warning/10 text-warning' : 'bg-muted/50 text-muted-foreground'
                    )}>
                      <div className="flex items-center justify-between">
                        <span>{t('lifecycle.stepper.nextPriceReview')}</span>
                        <span className="font-medium">{format(nextReviewDate, 'dd/MM/yyyy')}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span>{t('lifecycle.stepper.noticeDeadline')}</span>
                        <span className="font-medium">{format(subDays(nextReviewDate, 60), 'dd/MM/yyyy')}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Incubation Year */}
              {contract.start_date && (() => {
                const incYear = getIncubationYear(contract.start_date);
                return (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      {t('lifecycle.stepper.incubationStatus')}
                    </Label>
                    <div className={cn(
                      'rounded-lg p-3 text-xs flex items-center justify-between',
                      incYear > 3 ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-muted-foreground'
                    )}>
                      <span>{t('lifecycle.stepper.currentYear')}</span>
                      <Badge variant={incYear > 3 ? 'destructive' : 'secondary'}>
                        {t('lifecycle.stepper.yearN', { n: incYear })}
                        {incYear > 3 && ` — ${t('lifecycle.stepper.postIncubation')}`}
                      </Badge>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
      <RenewContractDialog contract={contract} open={renewOpen} onOpenChange={setRenewOpen} />
      <TerminateContractDialog contract={contract} open={terminateOpen} onOpenChange={setTerminateOpen} />
    </Sheet>

  );
}

/** Signature Provider Panel — shows provider status, allows selection for unsent drafts, retry */
function SignatureProviderPanel({ contract }: { contract: StartupContract }) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const provider = contract.signature_provider as string | null;
  const sigStatus = contract.signature_status;
  // Retryable states: dispatch failure OR the signer rejected / staff voided the envelope.
  const canRetry = sigStatus === 'failed' || sigStatus === 'ready_to_send' || sigStatus === 'declined' || sigStatus === 'voided';
  const isSent = sigStatus && !['draft', 'failed', 'ready_to_send', 'pending_manual', 'pending', 'pending_signature', 'declined', 'voided'].includes(sigStatus);
  const canChangeProvider = !isSent && (!contract.provider_document_id || canRetry);
  const isBlockedByProvider = sigStatus === 'declined' || sigStatus === 'voided';

  const providerLabel = provider === 'pandadoc' ? 'PandaDoc' : provider === 'docusign' ? 'DocuSign' : provider === 'assinatura_digital' ? t('contractDetail.digitalSignature') : provider === 'pandadoc_manual' ? t('contractDetail.pandadocManual') : provider === 'manual' ? t('contractDetail.manualSignature') : t('contractDetail.notSelected');

  // Bilateral signing fields
  const founderStatus = (contract as any).founder_signer_status || 'pending';
  const counterSignerName = (contract as any).counter_signer_name || '';
  const counterSignerEmail = (contract as any).counter_signer_email || '';
  const counterSignerStatus = (contract as any).counter_signer_status || '';
  const hasBilateral = !!counterSignerEmail;
  const founderName = (contract as any).legal_representative_name || contract.workspace?.startup?.name || 'Founder';
  const founderEmail = (contract as any).legal_representative_email || '';

  const STATUS_ICON: Record<string, React.ReactNode> = {
    completed: <CheckCircle2 className="h-4 w-4 text-success" />,
    signed: <CheckCircle2 className="h-4 w-4 text-success" />,
    sent_for_signature: <Send className="h-4 w-4 text-info" />,
    sent: <Send className="h-4 w-4 text-info" />,
    viewed: <FileText className="h-4 w-4 text-info" />,
    declined: <XCircle className="h-4 w-4 text-destructive" />,
    voided: <XCircle className="h-4 w-4 text-muted-foreground" />,
    failed: <AlertTriangle className="h-4 w-4 text-destructive" />,
    pending_manual: <Clock className="h-4 w-4 text-warning" />,
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
    draft: <FileText className="h-4 w-4 text-muted-foreground" />,
    ready_to_send: <Send className="h-4 w-4 text-warning" />,
  };

  const signerStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: t('contractDetail.signerPending', 'Pendente'),
      sent: t('contractDetail.signerSent', 'Enviado'),
      signed: t('contractDetail.signerSigned', 'Assinado ✓'),
      declined: t('contractDetail.signerDeclined', 'Recusado'),
      completed: t('contractDetail.signerCompleted', 'Assinado ✓'),
    };
    return map[status] || status;
  };

  const signerStatusColor = (status: string) => {
    if (status === 'signed' || status === 'completed') return 'bg-success/10 text-success';
    if (status === 'sent') return 'bg-info/10 text-info';
    if (status === 'declined') return 'bg-destructive/10 text-destructive';
    return 'bg-muted text-muted-foreground';
  };

  const handleSetProvider = async (newProvider: string) => {
    try {
      const { error } = await supabase
        .from('startup_contracts')
        .update({ signature_provider: newProvider } as any)
        .eq('id', contract.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      notify.success(t('contractDetail.providerUpdated', { defaultValue: 'Fornecedor de assinatura atualizado' }));
    } catch {
      notify.error(t('contractDetail.providerUpdateFailed', { defaultValue: 'Erro ao atualizar fornecedor' }));
    }
  };

  // PDF download for PandaDoc manual flow
  const handleDownloadPdf = async () => {
    setSending(true);
    try {
      const result = await invokeWithAuth<{ documentBase64?: string; fileName?: string }>('generate-contract-pdf', { body: { contractId: contract.id } });
      if (result.error) throw result.error;
      if (result.data?.documentBase64) {
        const byteChars = atob(result.data.documentBase64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.data.fileName || 'contrato.pdf';
        a.click();
        URL.revokeObjectURL(url);
      }
      notify.success(t('contractDetail.pdfGenerated'));
    } catch {
      notify.error(t('contractDetail.pdfGenerationFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {t('contractDetail.signatureProvider', { defaultValue: 'Fornecedor de Assinatura' })}
        </Label>
        {canChangeProvider ? (
          <Select value={provider || ''} onValueChange={handleSetProvider}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('contractDetail.selectProvider', { defaultValue: 'Selecionar fornecedor...' })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assinatura_digital">
                {t('contractDetail.digitalSignature')}
              </SelectItem>
              <SelectItem value="pandadoc_manual">
                {t('contractDetail.pandadocManual')}
              </SelectItem>
              <SelectItem value="manual">{t('contractDetail.manualSignature')}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">{providerLabel}</Badge>
            {isSent && (
              <span className="text-xs text-muted-foreground">
                ({t('contractDetail.providerLocked', { defaultValue: 'bloqueado — contrato já enviado' })})
              </span>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Bilateral Signing Status */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {t('admin.backoffice.contractSigners.bilateralSignatures', 'Assinaturas Bilaterais')}
        </Label>

        {/* Signer 1: Founder */}
        <div className="border rounded-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">1</div>
              <div>
                <p className="text-sm font-medium">{t('admin.backoffice.contractSigners.firstParty', 'Primeiro Outorgante')}</p>
                <p className="text-xs text-muted-foreground">{founderName} {founderEmail ? `(${founderEmail})` : ''}</p>
              </div>
            </div>
            <Badge className={cn('text-[10px] h-5', signerStatusColor(founderStatus))}>
              {signerStatusLabel(founderStatus)}
            </Badge>
          </div>
        </div>

        {/* Signer 2: Counter-signer (Startup Leiria) */}
        <div className="border rounded-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-warning/10 flex items-center justify-center text-xs font-bold text-warning">2</div>
              <div>
                <p className="text-sm font-medium">{t('admin.backoffice.contractSigners.secondParty', 'Segundo Outorgante')}</p>
                {hasBilateral ? (
                  <p className="text-xs text-muted-foreground">{counterSignerName} ({counterSignerEmail})</p>
                ) : (
                   <p className="text-xs text-muted-foreground italic">
                    {t('admin.backoffice.contractSigners.autoAssigned', 'Será atribuído automaticamente ao enviar')}
                   </p>
                )}
              </div>
            </div>
            {hasBilateral ? (
              <Badge className={cn('text-[10px] h-5', signerStatusColor(counterSignerStatus))}>
                {signerStatusLabel(counterSignerStatus)}
              </Badge>
            ) : (
              <Badge className="text-[10px] h-5 bg-muted text-muted-foreground">{t('common.pending', 'Pendente')}</Badge>
            )}
          </div>
        </div>

        {/* Overall status hint */}
        {isSent && hasBilateral && founderStatus !== 'signed' && counterSignerStatus !== 'signed' && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            O founder assina primeiro. Após a assinatura, o contrato é enviado ao representante da Startup Leiria.
          </p>
        )}
        {isSent && founderStatus === 'signed' && counterSignerStatus !== 'signed' && counterSignerStatus !== 'completed' && (
          <p className="text-xs text-info flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Founder já assinou. Aguardando assinatura do representante da Startup Leiria.
          </p>
        )}
      </div>

      <Separator />

      {/* Canonical Signature Status */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {t('contractDetail.signatureStatus', { defaultValue: 'Estado Geral' })}
        </Label>
        <div className="flex items-center gap-2">
          {STATUS_ICON[sigStatus || ''] || <Clock className="h-4 w-4 text-muted-foreground" />}
          <Badge className={cn(
            'text-xs',
            sigStatus === 'completed' ? 'bg-success/10 text-success' :
            sigStatus === 'declined' || sigStatus === 'failed' ? 'bg-destructive/10 text-destructive' :
            sigStatus === 'sent_for_signature' || sigStatus === 'viewed' ? 'bg-info/10 text-info' :
            'bg-muted text-muted-foreground'
          )}>
            {t(`contractDetail.sigStatus.${sigStatus}`, { defaultValue: sigStatus || 'N/A' })}
          </Badge>
        </div>
      </div>

      {/* Provider Details Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">{t('contractDetail.providerDocId', { defaultValue: 'ID do Documento' })}</Label>
          <p className="text-xs font-mono truncate">{contract.provider_document_id || contract.docusign_envelope_id || '—'}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">{t('contractDetail.lastEvent', { defaultValue: 'Último Evento' })}</Label>
          <p className="text-xs font-mono">{contract.provider_last_event || '—'}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">{t('contractDetail.sentAt', { defaultValue: 'Enviado em' })}</Label>
          <p className="text-xs">{contract.provider_sent_at ? format(new Date(contract.provider_sent_at), 'dd MMM yyyy HH:mm') : contract.signature_requested_at ? format(new Date(contract.signature_requested_at), 'dd MMM yyyy HH:mm') : '—'}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">{t('contractDetail.completedAt', { defaultValue: 'Concluído em' })}</Label>
          <p className="text-xs">{contract.provider_completed_at ? format(new Date(contract.provider_completed_at), 'dd MMM yyyy HH:mm') : contract.signed_at ? format(new Date(contract.signed_at), 'dd MMM yyyy HH:mm') : '—'}</p>
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] text-muted-foreground uppercase">{t('contractDetail.lastSync', { defaultValue: 'Última Sincronização' })}</Label>
          <p className="text-xs">{contract.provider_last_sync_at ? format(new Date(contract.provider_last_sync_at), 'dd MMM yyyy HH:mm') : '—'}</p>
        </div>
      </div>

      {/* Error Display */}
      {contract.provider_last_error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive">{t('contractDetail.lastError', { defaultValue: 'Último Erro' })}</p>
              <p className="text-xs text-destructive/80 mt-1 break-all">{contract.provider_last_error}</p>
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* Actions */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {t('contractDetail.signatureActions')}
        </Label>

        {/* Reset / resend for declined or voided envelopes */}
        {isBlockedByProvider && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2">
            <p className="text-xs text-warning-foreground">
              {sigStatus === 'declined'
                ? t('contractDetail.declinedNotice', { defaultValue: 'O contrato foi recusado. Reponha o estado para reenviar.' })
                : t('contractDetail.voidedNotice', { defaultValue: 'O envelope foi anulado. Reponha o estado para reenviar.' })}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={sending}
              onClick={async () => {
                setSending(true);
                try {
                  const { error } = await supabase
                    .from('startup_contracts')
                    .update({
                      signature_status: 'draft',
                      status: 'draft',
                      provider_document_id: null,
                      docusign_envelope_id: null,
                      provider_last_error: null,
                      provider_last_event: null,
                      canonical_signature_status: null,
                      founder_signer_status: 'pending',
                      counter_signer_status: null,
                    } as any)
                    .eq('id', contract.id);
                  if (error) throw error;
                  notify.success(t('contractDetail.resetOk', { defaultValue: 'Estado reposto. Pode reenviar.' }));
                  queryClient.invalidateQueries({ queryKey: ['contracts'] });
                } catch (e: any) {
                  notify.error(e?.message || t('contractDetail.resetFailed', { defaultValue: 'Falha ao repor estado' }));
                } finally {
                  setSending(false);
                }
              }}
            >
              {t('contractDetail.resetAndResend', { defaultValue: 'Repor e reenviar' })}
            </Button>
          </div>
        )}


        {/* ROTA 1: Assinatura Digital Simples (nacionais PT) */}
        {provider === 'assinatura_digital' && (!isSent || canRetry) && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('contractDetail.digitalSignatureDesc')}
            </p>
            <Button 
              size="sm" 
              className="w-full gap-2"
              onClick={async () => {
                setSending(true);
                try {
                  // 1. Generate PDF
                  const pdfResult = await invokeWithAuth('generate-contract-pdf', { body: { contractId: contract.id } });
                  if (pdfResult.error) throw new Error(t('contractDetail.pdfGenerationFailed'));
                  
                  // 2. Generate public signing link
                  const tokenResult = await invokeWithAuth('public-contract-onboarding', {
                    body: { action: 'generate_token', contractId: contract.id },
                  });
                  if (tokenResult.error) throw tokenResult.error;
                  
                  // 3. Update contract status via canonical helper
                  const sentResult = await canonicalMarkAsSent(contract.id, 'assinatura_digital');
                  if (!sentResult.success) {
                    throw new Error(
                      sentResult.error
                        || (sentResult.syncError && `Sincronização parcial: ${sentResult.syncError}`)
                        || 'Erro ao marcar como enviado'
                    );
                  }
                  
                  // 4. Copy link
                  const url = tokenResult.data?.url || `${window.location.origin}/contract-signing/${tokenResult.data?.token}`;
                  await navigator.clipboard.writeText(url);
                  
                  notify.success(t('contractDetail.linkCopied'));
                  queryClient.invalidateQueries({ queryKey: ['contracts'] });
                  queryClient.invalidateQueries({ queryKey: ['contract-intakes'] });
                  queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
                } catch (e: any) {
                  notify.error(e.message || t('contractDetail.sendFailed'));
                } finally {
                  setSending(false);
                }
              }}
              disabled={sending}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t('contractDetail.generateAndSendLink')}
            </Button>
          </div>
        )}

        {/* ROTA 2: PandaDoc Manual (Estrangeiros) */}
        {provider === 'pandadoc_manual' && (!isSent || canRetry) && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('contractDetail.pandadocManualDesc')}
            </p>
            
            {/* Step 1: Generate & Download PDF */}
            <Button 
              size="sm" 
              variant="outline"
              className="w-full gap-2"
              onClick={handleDownloadPdf}
              disabled={sending} loading={sending}
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
              {t('contractDetail.step1DownloadPdf')}
            </Button>
            
            {/* Step 2: Open PandaDoc */}
            <Button 
              size="sm" 
              variant="outline"
              className="w-full gap-2"
              onClick={() => window.open('https://app.pandadoc.com/documents/', '_blank')}
            >
              <ExternalLink className="h-3 w-3" />
              {t('contractDetail.step2OpenPandaDoc')}
            </Button>
            
            {/* Step 3: Mark as sent */}
            <Button 
              size="sm" 
              className="w-full gap-2"
              onClick={async () => {
                const result = await canonicalMarkAsSent(contract.id, 'pandadoc_manual');
                if (!result.success) {
                  notify.error(
                    result.error
                      || (result.syncError && `Sincronização parcial: ${result.syncError}`)
                      || 'Erro ao marcar como enviado'
                  );
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ['contracts'] });
                queryClient.invalidateQueries({ queryKey: ['contract-intakes'] });
                queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
                notify.success(t('contractDetail.markedAsSent'));
              }}
            >
              <CheckCircle2 className="h-3 w-3" />
              {t('contractDetail.step3MarkSent')}
            </Button>
          </div>
        )}

        {/* Both manual routes: Mark as signed */}
        {(provider === 'pandadoc_manual' || provider === 'manual') && sigStatus === 'sent_for_signature' && (
          <Button 
            size="sm" 
            variant="default"
            className="w-full gap-2 mt-4 bg-success hover:bg-success"
            onClick={async () => {
              const result = await canonicalMarkAsSigned(contract.id, contract.workspace_id || null);
              if (!result.success) {
                notify.error(
                  result.error
                    || (result.syncError && `Sincronização parcial: ${result.syncError}`)
                    || 'Erro ao marcar como assinado'
                );
                return;
              }
              queryClient.invalidateQueries({ queryKey: ['contracts'] });
              queryClient.invalidateQueries({ queryKey: ['contract-intakes'] });
              queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
              queryClient.invalidateQueries({ queryKey: ['workspaces'] });
              notify.success(t('contractDetail.markedAsSigned'));
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('contractDetail.markAsSigned')}
          </Button>
        )}

        {/* Refresh status for any sent contract */}
        {isSent && sigStatus !== 'completed' && sigStatus !== 'signed' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['contracts'] });
              notify.info(t('contractDetail.statusRefreshed'));
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('contractDetail.refreshStatus')}
          </Button>
        )}

        {!provider && !isSent && (
          <p className="text-xs text-muted-foreground">
            {t('contractDetail.selectProviderHint')}
          </p>
        )}
      </div>
    </div>
  );
}

/** Small helper for consistent field display */
function FieldDisplay({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider font-medium">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}
