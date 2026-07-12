/**
 * Contract Onboarding Wizard (Authenticated)
 * Multi-step: 1) Company Data → 2) Review Contract & Regulation → 3) Digital Signature
 * Provider-agnostic: dispatches to backend which routes by contract's signature_provider.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Building2, FileText, PenTool, CheckCircle2, ArrowRight, ArrowLeft, Download, Shield, Loader2, ExternalLink, RotateCcw, Cloud, CloudOff, AlertTriangle, Check } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useContractDraftAutosave } from '@/hooks/useContractDraftAutosave';

type WizardStep = 'company_data' | 'review_contract' | 'signing';

interface RepresentativeEntry {
  name: string;
  email: string;
  phone: string;
}

interface CompanyFormData {
  legal_representative_name: string;
  legal_representative_email: string;
  legal_representative_phone: string;
  certidao_permanente_code: string;
  additional_representatives: RepresentativeEntry[];
  company_nif: string;
  company_address: string;
  company_city: string;
  company_postal_code: string;
}

/** Human-readable provider label */
function useProviderLabel() {
  const { t } = useTranslation();
  return (provider: string | null): string => {
    switch (provider) {
      case 'docusign': return 'DocuSign';
      case 'pandadoc': return 'PandaDoc';
      case 'manual': return t('contractOnboarding.manualSignature');
      default: return t('contractOnboarding.digitalSignature');
    }
  };
}

export default function ContractOnboarding() {
  const { contractId } = useParams<{ contractId: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getProviderLabel = useProviderLabel();
  const [currentStep, setCurrentStep] = useState<WizardStep>('company_data');
  const [regulationAccepted, setRegulationAccepted] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);

  const STEPS: { key: WizardStep; icon: typeof Building2; label: string }[] = [
    { key: 'company_data', icon: Building2, label: t('contractOnboarding.step.companyData') },
    { key: 'review_contract', icon: FileText, label: t('contractOnboarding.step.reviewContract') },
    { key: 'signing', icon: PenTool, label: t('contractOnboarding.step.signing') },
  ];

  const [formData, setFormData] = useState<CompanyFormData>({
    legal_representative_name: '',
    legal_representative_email: '',
    legal_representative_phone: '',
    certidao_permanente_code: '',
    additional_representatives: [],
    company_nif: '',
    company_address: '',
    company_city: '',
    company_postal_code: '',
  });

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract-onboarding', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select(`
          *,
          workspace:workspaces(
            id,
            startup:startups(id, name, nif, main_contact_name, main_contact_email, address)
          ),
          incubation_type:incubation_types(name),
          building:buildings(name, code, address)
        `)
        .eq('id', contractId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Contract not found');
      return data;
    },
  });

  useEffect(() => {
    if (contract) {
      const startup = (contract as any).workspace?.startup;
      const c = contract as any;
      setFormData(prev => ({
        ...prev,
        legal_representative_name: c.legal_representative_name || startup?.main_contact_name || '',
        legal_representative_email: c.legal_representative_email || startup?.main_contact_email || '',
        legal_representative_phone: c.legal_representative_phone || '',
        certidao_permanente_code: c.certidao_permanente_code || '',
        additional_representatives: Array.isArray(c.additional_representatives) ? c.additional_representatives : [],
        company_nif: c.company_nif || startup?.nif || '',
        company_address: c.company_address || startup?.address || '',
        company_city: c.company_city || '',
        company_postal_code: c.company_postal_code || '',
      }));
    }
  }, [contract]);

  // Explicit visible-field → persisted-field map. Every editable input in the
  // company-data step MUST appear here. Adding a new input to the form without
  // adding it here is a regression caught by the contract-onboarding tests.
  const buildPersistedPayload = () => ({
    legal_representative_name: formData.legal_representative_name,
    legal_representative_email: formData.legal_representative_email,
    legal_representative_phone: formData.legal_representative_phone || null,
    certidao_permanente_code: formData.certidao_permanente_code || null,
    additional_representatives: formData.additional_representatives ?? [],
    company_nif: formData.company_nif,
    company_address: formData.company_address,
    company_city: formData.company_city,
    company_postal_code: formData.company_postal_code,
  });

  // Debounced autosave — every keystroke goes to localStorage immediately,
  // server save is debounced 1.5s. Submit awaits flush().
  const autosave = useContractDraftAutosave<Record<string, unknown>>({
    scopeKey: contractId ?? null,
    namespace: 'contract-onboarding',
    serverData: contract ? buildPersistedPayload() : null,
    serverUpdatedAt: (contract as any)?.updated_at ?? null,
    disabled: !contractId || (contract as any)?.signature_status === 'signed',
    debounceMs: 1500,
    serverSave: async (payload) => {
      const { error } = await supabase
        .from('startup_contracts')
        .update(payload as any)
        .eq('id', contractId!);
      if (error) throw error;
    },
  });

  useEffect(() => {
    if (!contract) return;
    autosave.trackChange(buildPersistedPayload() as Record<string, unknown>);
  }, [formData]);

  const saveCompanyData = useMutation({
    mutationFn: async () => {
      await autosave.flush();
      const { error } = await supabase
        .from('startup_contracts')
        .update(buildPersistedPayload() as any)
        .eq('id', contractId!);
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrentStep('review_contract');
      notify.success(t('contractOnboarding.dataSaved'));
    },
    onError: () => notify.error(t('contractOnboarding.dataSaveError')),
  });

  const submitForSigning = useMutation({
    mutationFn: async () => {
      await supabase
        .from('startup_contracts')
        .update({
          regulation_accepted_at: new Date().toISOString(),
          regulation_version: 'V11_2026',
          signature_status: 'sent_for_signature',
          signature_requested_at: new Date().toISOString(),
        } as any)
        .eq('id', contractId!);

      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: {
          action: 'submit_signing',
          token: null,
          contractId,
          formData: {
            legal_representative_email: formData.legal_representative_email,
            legal_representative_name: formData.legal_representative_name,
            company_nif: formData.company_nif,
          },
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setCurrentStep('signing');
      queryClient.invalidateQueries({ queryKey: ['contract-onboarding', contractId] });
      notify.success(t('contractOnboarding.sentForSignature'));
    },
    onError: (err: any) => {
      notify.error(err?.message || t('contractOnboarding.sendError'));
      setCurrentStep('signing');
    },
  });

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const isFormValid = formData.legal_representative_name.trim() &&
    formData.legal_representative_email.trim() &&
    formData.company_nif.trim() &&
    formData.company_address.trim() &&
    formData.company_city.trim() &&
    formData.company_postal_code.trim();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!contract) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold">{t('contractOnboarding.notFound')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('contractOnboarding.notFoundDesc')}</p>
        </div>
      </AppLayout>
    );
  }

  const sigStatus = (contract as any).signature_status;
  const sigProvider: string | null = (contract as any).signature_provider || null;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('contractOnboarding.title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {(contract as any).workspace?.startup?.name || 'Startup'} — {(contract as any).contract_number || t('contracts.new', 'Novo Contrato')}
          </p>
        </div>

        <div className="space-y-3">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = step.key === currentStep;
              const isDone = i < stepIndex;
              return (
                <div key={step.key} className={`flex items-center gap-1.5 text-xs font-medium ${isActive ? 'text-primary' : isDone ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  {step.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 1: Company Data */}
        {currentStep === 'company_data' && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    {t('contractOnboarding.companyAndRepData')}
                  </CardTitle>
                  <CardDescription>
                    {t('contractOnboarding.companyDataDesc')}
                  </CardDescription>
                </div>
                {/* Autosave status chip — calm, near the form header */}
                {(contract as any)?.signature_status !== 'signed' && (
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 shrink-0 pt-1">
                    {autosave.status === 'saving' && (<><Loader2 className="h-3 w-3 animate-spin" />{t('contractOnboarding.autosave.saving', { defaultValue: 'A guardar…' })}</>)}
                    {autosave.status === 'saved' && (<><Check className="h-3 w-3 text-emerald-600" />{t('contractOnboarding.autosave.saved', { defaultValue: 'Guardado' })}</>)}
                    {autosave.status === 'local_only' && (<><CloudOff className="h-3 w-3 text-amber-600" />{t('contractOnboarding.autosave.localOnly', { defaultValue: 'Guardado localmente' })}</>)}
                    {autosave.status === 'error' && (<><AlertTriangle className="h-3 w-3 text-destructive" />{t('contractOnboarding.autosave.error', { defaultValue: 'Erro ao guardar' })}</>)}
                    {autosave.status === 'idle' && autosave.lastSavedAt && (<><Cloud className="h-3 w-3" />{t('contractOnboarding.autosave.saved', { defaultValue: 'Guardado' })}</>)}
                  </div>
                )}
              </div>
              {/* Restore-from-local banner */}
              {autosave.restoredFromLocal && autosave.restorePreview && (contract as any)?.signature_status !== 'signed' && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <RotateCcw className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="flex-1 text-xs text-amber-900 dark:text-amber-200">
                    {t('contractOnboarding.autosave.restoreBanner', { defaultValue: 'Encontrámos edições não guardadas no seu dispositivo. Quer restaurá-las?' })}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const preview = autosave.restorePreview as Partial<CompanyFormData> | null;
                      if (preview) setFormData(prev => ({ ...prev, ...preview }));
                      autosave.dismissRestoredBanner();
                    }}
                  >
                    {t('common.restore', { defaultValue: 'Restaurar' })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => autosave.clearDraft()}
                  >
                    {t('common.discard', { defaultValue: 'Descartar' })}
                  </Button>
                </div>
              )}
              {/* Server-newer-than-local conflict banner */}
              {autosave.serverNewerThanLocal && autosave.staleLocalPreview && (contract as any)?.signature_status !== 'signed' && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="flex-1 text-xs text-amber-900 dark:text-amber-200">
                    {t('contractOnboarding.autosave.conflictBanner', { defaultValue: 'Este contrato foi atualizado no servidor depois do seu rascunho local. Recomendamos usar a versão do servidor.' })}
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => autosave.acceptServerVersion()}
                  >
                    {t('contractOnboarding.autosave.useServer', { defaultValue: 'Usar servidor' })}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const draft = autosave.staleLocalPreview as Partial<CompanyFormData> | null;
                      if (draft) setFormData(prev => ({ ...prev, ...draft }));
                      autosave.acceptServerVersion();
                    }}
                  >
                    {t('contractOnboarding.autosave.restoreLocal', { defaultValue: 'Restaurar local' })}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.legalRepName')} *</Label>
                  <Input
                    value={formData.legal_representative_name}
                    onChange={e => setFormData(prev => ({ ...prev, legal_representative_name: e.target.value }))}
                    placeholder={t('contractOnboarding.fullNamePlaceholder', 'Nome completo')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.repEmail')} *</Label>
                  <Input
                    type="email"
                    value={formData.legal_representative_email}
                    onChange={e => setFormData(prev => ({ ...prev, legal_representative_email: e.target.value }))}
                    placeholder="email@empresa.pt"
                  />
                </div>
               <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.repPhone')}</Label>
                  <Input
                    type="tel"
                    value={formData.legal_representative_phone}
                    onChange={e => setFormData(prev => ({ ...prev, legal_representative_phone: e.target.value }))}
                    placeholder="+351 900 000 000"
                  />
                </div>
              </div>

              {formData.additional_representatives.map((rep, idx) => (
                <div key={idx} className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {t('contractOnboarding.additionalRep')} {idx + 2}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-destructive"
                      onClick={() => setFormData(p => ({
                        ...p,
                        additional_representatives: p.additional_representatives.filter((_, i) => i !== idx),
                      }))}
                    >
                      {t('contractOnboarding.remove')}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      value={rep.name}
                      onChange={e => {
                        const updated = [...formData.additional_representatives];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setFormData(p => ({ ...p, additional_representatives: updated }));
                      }}
                      placeholder={t('contractOnboarding.fullNamePlaceholder', 'Nome completo')}
                    />
                    <Input
                      type="email"
                      value={rep.email}
                      onChange={e => {
                        const updated = [...formData.additional_representatives];
                        updated[idx] = { ...updated[idx], email: e.target.value };
                        setFormData(p => ({ ...p, additional_representatives: updated }));
                      }}
                      placeholder="Email"
                    />
                    <Input
                      type="tel"
                      value={rep.phone}
                      onChange={e => {
                        const updated = [...formData.additional_representatives];
                        updated[idx] = { ...updated[idx], phone: e.target.value };
                        setFormData(p => ({ ...p, additional_representatives: updated }));
                      }}
                      placeholder={t('contractOnboarding.phonePlaceholder', 'Telefone')}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setFormData(p => ({
                  ...p,
                  additional_representatives: [...p.additional_representatives, { name: '', email: '', phone: '' }],
                }))}
              >
                + {t('contractOnboarding.addRep')}
              </Button>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.nif')} *</Label>
                  <Input
                    value={formData.company_nif}
                    onChange={e => setFormData(prev => ({ ...prev, company_nif: e.target.value }))}
                    placeholder="123456789"
                    maxLength={9}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.certidaoPermanente')}</Label>
                  <Input
                    value={formData.certidao_permanente_code}
                    onChange={e => setFormData(prev => ({ ...prev, certidao_permanente_code: e.target.value }))}
                    placeholder={t('contractOnboarding.certidaoPlaceholder', 'Código de acesso online')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.fiscalAddress')} *</Label>
                  <Input
                    value={formData.company_address}
                    onChange={e => setFormData(prev => ({ ...prev, company_address: e.target.value }))}
                    placeholder={t('contractOnboarding.addressPlaceholder', 'Rua, número, andar')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.city')} *</Label>
                  <Input
                    value={formData.company_city}
                    onChange={e => setFormData(prev => ({ ...prev, company_city: e.target.value }))}
                    placeholder="Leiria"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contractOnboarding.postalCode')} *</Label>
                  <Input
                    value={formData.company_postal_code}
                    onChange={e => setFormData(prev => ({ ...prev, company_postal_code: e.target.value }))}
                    placeholder="2400-000"
                  />
                </div>
              </div>

              <Separator />
              <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('contractOnboarding.contractSummary')}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">{t('contractOnboarding.type')}:</span> {(contract as any).incubation_type?.name || '—'}</div>
                  <div><span className="text-muted-foreground">{t('contractOnboarding.building')}:</span> {(contract as any).building?.name || '—'}</div>
                  <div><span className="text-muted-foreground">{t('contractOnboarding.monthlyFee')}:</span> {(contract as any).monthly_fee}€/{(contract as any).currency || 'EUR'}</div>
                  <div><span className="text-muted-foreground">{t('contractOnboarding.startDate')}:</span> {new Date((contract as any).start_date).toLocaleDateString('pt-PT')}</div>
                  {(contract as any).square_meters && (
                    <div><span className="text-muted-foreground">{t('contractOnboarding.area')}:</span> {(contract as any).square_meters} m²</div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => saveCompanyData.mutate()}
                  disabled={!isFormValid || saveCompanyData.isPending} loading={saveCompanyData.isPending}
                  className="gap-2"
                >
                  {saveCompanyData.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('contractOnboarding.continue')} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Review Contract & Regulation */}
        {currentStep === 'review_contract' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {t('contractOnboarding.reviewTitle')}
              </CardTitle>
              <CardDescription>
                {t('contractOnboarding.reviewDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{t('contractOnboarding.contractDraft')}</p>
                      <p className="text-xs text-muted-foreground">{t('contractOnboarding.officialDraft')} — 2026</p>
                    </div>
                  </div>
                  <a href="/templates/V9_Minuta_Contrato_IF_e_IV_2026.docx" download>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      {t('contractOnboarding.download')}
                    </Button>
                  </a>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="accept-contract"
                    checked={contractAccepted}
                    onCheckedChange={(v) => setContractAccepted(v === true)}
                  />
                  <label htmlFor="accept-contract" className="text-xs leading-tight cursor-pointer">
                    {t('contractOnboarding.acceptContract')}
                  </label>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium">{t('contractOnboarding.regulation')}</p>
                      <p className="text-xs text-muted-foreground">V11 — {t('contractOnboarding.annex')} I — 2026</p>
                    </div>
                  </div>
                  <a href="/templates/V11_Anexo_I_Regulamento_SUP_LRA_2026_2.pdf" download>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      {t('contractOnboarding.download')}
                    </Button>
                  </a>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="accept-regulation"
                    checked={regulationAccepted}
                    onCheckedChange={(v) => setRegulationAccepted(v === true)}
                  />
                  <label htmlFor="accept-regulation" className="text-xs leading-tight cursor-pointer">
                    {t('contractOnboarding.acceptRegulation')}
                  </label>
                </div>
              </div>

              <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('contractOnboarding.confirmedData')}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">{t('contractOnboarding.representative')}:</span> {formData.legal_representative_name}</div>
                  <div><span className="text-muted-foreground">Email:</span> {formData.legal_representative_email}</div>
                  <div><span className="text-muted-foreground">NIF:</span> {formData.company_nif}</div>
                  <div><span className="text-muted-foreground">{t('contractOnboarding.address')}:</span> {formData.company_address}, {formData.company_city}</div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('company_data')} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> {t('contractOnboarding.back')}
                </Button>
                <Button
                  onClick={() => submitForSigning.mutate()}
                  disabled={!contractAccepted || !regulationAccepted || submitForSigning.isPending} loading={submitForSigning.isPending}
                  className="gap-2"
                >
                  {submitForSigning.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
                  {t('contractOnboarding.sendForSignature')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Signing Status */}
        {currentStep === 'signing' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-primary" />
                {t('contractOnboarding.digitalSignature')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sigStatus === 'completed' ? (
                <div className="text-center py-8 space-y-3">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-primary" />
                  <h3 className="text-lg font-semibold text-primary">{t('contractOnboarding.contractSigned')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('contractOnboarding.contractSignedDesc')}
                  </p>
                  <Button onClick={() => navigate('/my-workspaces')} className="mt-4">
                    {t('contractOnboarding.goToWorkspace')}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <div className="relative mx-auto w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <PenTool className="absolute inset-0 m-auto h-8 w-8 text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{t('contractOnboarding.awaitingSignature')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('contractOnboarding.sentVia') + ' ' + formData.legal_representative_email + ' ' + t('contractOnboarding.via') + ' ' + getProviderLabel(sigProvider) + '.'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {sigProvider === 'manual'
                        ? t('contractOnboarding.manualNote')
                        : t('contractOnboarding.checkEmail')}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {sigStatus === 'sent_for_signature' ? t('contractOnboarding.statusSent') :
                     sigStatus === 'viewed' ? t('contractOnboarding.statusViewed') :
                     sigStatus === 'declined' ? t('contractOnboarding.statusDeclined') :
                     sigStatus === 'pending_manual' ? t('contractOnboarding.statusPendingManual') :
                     t('contractOnboarding.statusPending')}
                  </Badge>
                  <div className="flex justify-center gap-3 mt-4">
                    <Button variant="outline" onClick={() => navigate('/my-workspaces')}>
                      {t('contractOnboarding.backLater')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
