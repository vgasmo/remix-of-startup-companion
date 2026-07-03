/**
 * Public Contract Intake Form
 * Accessible via token link — no authentication required.
 * Phase 1 of 2-phase onboarding: Data collection (NOT signature).
 * Uploads are optional. Customer can submit with missing documents.
 *
 * SECURITY: All data access goes through the public-contract-onboarding
 * edge function (service-role). No direct SELECT/UPDATE on contract_intakes.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { track } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2, CheckCircle2,
  Shield, Loader2, AlertTriangle, Upload, Globe, Info, RotateCcw, X
} from 'lucide-react';
import { useContractDraftAutosave } from '@/hooks/useContractDraftAutosave';

interface RepresentativeEntry {
  name: string;
  email: string;
  phone: string;
}

interface IntakeFormData {
  organization_name: string;
  project_name: string;
  company_nif: string;
  certidao_permanente_code: string;
  company_address: string;
  company_city: string;
  company_postal_code: string;
  iban: string;
  legal_representative_name: string;
  legal_representative_email: string;
  legal_representative_phone: string;
  additional_representatives: RepresentativeEntry[];
  billing_email: string;
  startup_description: string;
  website: string;
}

const OPTIONAL_DOCS = [
  { key: 'certidao_comercial', labelPt: 'Certidão Permanente / Código de Acesso', labelEn: 'Commercial Registry Certificate / Access Code' },
  { key: 'id_representante', labelPt: 'Documento de Identificação do Representante Legal', labelEn: 'Legal Representative ID Document' },
  { key: 'comprovativo_morada', labelPt: 'Comprovativo de Morada', labelEn: 'Proof of Address' },
  { key: 'comprovativo_iban', labelPt: 'Comprovativo de IBAN', labelEn: 'IBAN Proof' },
  { key: 'pitch_deck', labelPt: 'Pitch Deck / Apresentação da Startup', labelEn: 'Pitch Deck / Startup Presentation' },
  { key: 'docs_associacoes', labelPt: 'Documentos de Associações', labelEn: 'Association Documents' },
];

export default function PublicContractIntake() {
  const { token } = useParams<{ token: string }>();
  const { i18n, t } = useTranslation();
  const [lang, setLang] = useState<'pt' | 'en'>(() =>
    i18n.language?.startsWith('pt') ? 'pt' : 'en'
  );
  

  const [formData, setFormData] = useState<IntakeFormData>({
    organization_name: '', project_name: '', company_nif: '', certidao_permanente_code: '',
    company_address: '', company_city: '',
    company_postal_code: '', iban: '', legal_representative_name: '',
    legal_representative_email: '', legal_representative_phone: '',
    additional_representatives: [],
    billing_email: '', startup_description: '', website: '',
  });

  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Per-field validation surfaced on submit. Mirrors the required-field set
  // used to gate the submit button below.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (name: string) =>
    setFieldErrors(prev => {
      if (!prev[name]) return prev;
      const next = { ...prev }; delete next[name]; return next;
    });

  const REQUIRED_INTAKE_FIELDS: Array<keyof IntakeFormData> = [
    'organization_name',
    'company_nif',
    'company_address',
    'company_city',
    'company_postal_code',
    'legal_representative_name',
    'legal_representative_email',
    'legal_representative_phone',
  ];

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    const requiredMsg = t('publicContract.errors.fieldRequired', { defaultValue: 'Campo obrigatório' });
    for (const key of REQUIRED_INTAKE_FIELDS) {
      if (!String(formData[key] ?? '').trim()) errors[key] = requiredMsg;
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const first = REQUIRED_INTAKE_FIELDS.find(k => errors[k]);
      if (first) {
        const el = document.getElementById(first);
        if (el && typeof (el as HTMLInputElement).focus === 'function') (el as HTMLInputElement).focus();
      }
      return;
    }
    setFieldErrors({});
    await autosave.flush();
    submitMutation.mutate();
  };

  const handleUploadDoc = async (docKey: string, file: File) => {
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      notify.error(t('publicContractIntake.fileTooLargeMax10mb'));
      return;
    }
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const allowed = ['pdf', 'jpg', 'jpeg', 'png'];
    if (!allowed.includes(ext)) {
      notify.error(t('publicContractIntake.unsupportedFormatPdfJpgPng'));
      return;
    }
    setUploadingDocKey(docKey);
    try {
      const buf = await file.arrayBuffer();
      // Convert to base64 in chunks to avoid stack overflow on large files
      let binary = '';
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const fileBase64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: {
          action: 'intake_upload_document',
          token,
          docKey,
          fileName: file.name,
          fileBase64,
          fileExt: ext,
          mimeType: file.type,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      notify.success(t('publicContractIntake.documentUploaded'));
      await queryClient.invalidateQueries({ queryKey: ['public-intake', token] });
    } catch (err: any) {
      notify.error(err?.message || t('publicContract.errors.uploadFailed'));
    } finally {
      setUploadingDocKey(null);
    }
  };

  // Fetch intake via edge function (no direct DB access)
  const { data: intake, isLoading, error: fetchError } = useQuery({
    queryKey: ['public-intake', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: { action: 'intake_load_by_token', token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.intake;
    },
    retry: false,
  });

  // Pre-fill from intake data
  useEffect(() => {
    if (intake) {
      setFormData(prev => ({
        ...prev,
        organization_name: intake.organization_name || '',
        project_name: intake.project_name || '',
        company_nif: intake.company_nif || '',
        company_address: intake.company_address || '',
        company_city: intake.company_city || '',
        company_postal_code: intake.company_postal_code || '',
        iban: intake.iban || '',
        certidao_permanente_code: intake.certidao_permanente_code || '',
        legal_representative_name: intake.legal_representative_name || '',
        legal_representative_email: intake.legal_representative_email || '',
        legal_representative_phone: intake.legal_representative_phone || '',
        additional_representatives: Array.isArray(intake.additional_representatives) ? intake.additional_representatives : [],
        billing_email: intake.billing_email || '',
        startup_description: intake.startup_description || '',
        website: intake.website || '',
      }));
    }
  }, [intake]);

  const isSubmitted = intake?.status === 'intake_submitted' || intake?.status === 'review_pending';
  const hasChangesRequested = intake?.status === 'changes_requested';

  // Autosave: localStorage-backed draft restoration so typed work survives
  // tab/window switch, refresh, accidental close. No server draft endpoint
  // exists for the intake yet — submit still goes through the existing
  // intake_submit_by_token action.
  const autosave = useContractDraftAutosave<Record<string, unknown>>({
    scopeKey: token ?? null,
    namespace: 'contract-intake',
    serverData: intake ? (intake as unknown as Record<string, unknown>) : null,
    serverUpdatedAt: intake?.updated_at ?? null,
    disabled: isSubmitted,
  });

  // Track every change against the autosave hook (localStorage every keystroke).
  useEffect(() => {
    if (!intake || isSubmitted) return;
    autosave.trackChange(formData as unknown as Record<string, unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // Submit form via edge function (no direct DB access)
  const submitMutation = useMutation({
    mutationFn: async () => {
      const missingDocs = OPTIONAL_DOCS
        .filter(d => !intake?.documents_json?.[d.key])
        .map(d => d.key);

      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: {
          action: 'intake_submit_by_token',
          token,
          formData: { ...formData, missing_documents: missingDocs },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      autosave.clearDraft();
      void track('intake_submitted', { properties: { token: token?.slice(0, 6) ?? null } });
      notify.success(t('publicContractIntake.dataSubmittedSuccessfully'));
      // Re-fetch so the "submitted" confirmation renders without a manual reload.
      void queryClient.invalidateQueries({ queryKey: ['public-intake', token] });
    },
    onError: (err: any) => {
      notify.error(err?.message || 'Erro ao submeter');
    },
  });

  const toggleLang = () => {
    const next = lang === 'pt' ? 'en' : 'pt';
    setLang(next);
    i18n.changeLanguage(next);
    if (typeof document !== 'undefined') document.documentElement.lang = next;
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError || !intake) {
    // Never expose technical error messages to public users
    const isExpired = (fetchError as any)?.message?.includes('expired');
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <p className="text-lg font-semibold">
              {isExpired
                ? (t('publicContractIntake.linkExpired'))
                : (t('publicContractIntake.invalidLink'))}
            </p>
            <p className="text-sm text-muted-foreground">
              {isExpired
                ? (t('publicContractIntake.thisLinkHasExpiredContactThe'))
                : (t('publicContractIntake.thisLinkIsNotValidOrHasAlready'))}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {t('publicContractIntake.emailInfoStartupleiriaCom')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            <p className="text-lg font-semibold">{t('publicContractIntake.dataSubmitted')}</p>
            <p className="text-sm text-muted-foreground">
              {t('publicContractIntake.yourDataHasBeenReceivedAndWillBe')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Language switcher */}
      <div className="fixed top-4 right-4 z-50">
        <Button variant="outline" size="sm" onClick={toggleLang} className="gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          {lang === 'pt' ? 'EN' : 'PT'}
        </Button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Building2 className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">
            {t('publicContractIntake.contractingForm')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('publicContractIntake.fillInYourCompanyDataToStartThe')}
          </p>
          {intake.organization_name && (
            <Badge variant="outline" className="mt-2">{intake.organization_name}</Badge>
          )}
        </div>

        {/* Changes requested banner */}
        {hasChangesRequested && intake.changes_requested_notes && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-4 space-y-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t('publicContractIntake.changesRequested')}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">{intake.changes_requested_notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Info banner */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {t('publicContractIntake.thisIsADataCollectionStepOnlyThe')}
            </p>
          </CardContent>
        </Card>

        {/* Restore-from-local-draft banner */}
        {autosave.restoredFromLocal && autosave.restorePreview && !isSubmitted && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-start gap-3">
              <RotateCcw className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 text-xs">
                <p className="font-semibold">
                  {t('publicContractIntake.unsavedDataFound')}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {t('publicContractIntake.restoreYourDraftOrStartFresh')}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs"
                  onClick={() => {
                    const draft = autosave.restorePreview as unknown as Partial<IntakeFormData> | null;
                    if (draft) {
                      setFormData(prev => ({ ...prev, ...draft, additional_representatives: Array.isArray((draft as any).additional_representatives) ? (draft as any).additional_representatives : prev.additional_representatives }));
                    }
                    autosave.dismissRestoredBanner();
                  }}
                >
                  {t('publicContractIntake.restore')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { autosave.clearDraft(); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('publicContractIntake.companyData')}</CardTitle>
            <span className="text-[11px] text-muted-foreground" aria-live="polite">
              {autosave.status === 'saving' && (t('publicContractIntake.saving'))}
              {autosave.status === 'saved' && (t('publicContractIntake.saved'))}
              {autosave.status === 'local_only' && (t('publicContractIntake.savedOnThisDevice'))}
              {autosave.status === 'error' && (t('publicContractIntake.saveError'))}
              {autosave.status === 'idle' && ''}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="organization_name">{t('publicContractIntake.organizationName')} *</Label>
                <Input
                  id="organization_name"
                  value={formData.organization_name}
                  onChange={e => { setFormData(p => ({ ...p, organization_name: e.target.value })); clearFieldError('organization_name'); }}
                  aria-invalid={!!fieldErrors.organization_name}
                  aria-describedby={fieldErrors.organization_name ? 'organization_name-error' : undefined}
                />
                {fieldErrors.organization_name && (
                  <p id="organization_name-error" className="text-xs text-destructive">{fieldErrors.organization_name}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project_name">{t('publicContractIntake.projectNameIfDifferent')}</Label>
                <Input id="project_name" value={formData.project_name} onChange={e => setFormData(p => ({ ...p, project_name: e.target.value }))} placeholder={t('publicContractIntake.commercialProjectName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_nif">{t('publicContractIntake.taxIdCompanyOrPersonal')} *</Label>
                <Input
                  id="company_nif"
                  value={formData.company_nif}
                  onChange={e => { setFormData(p => ({ ...p, company_nif: e.target.value })); clearFieldError('company_nif'); }}
                  aria-invalid={!!fieldErrors.company_nif}
                  aria-describedby={fieldErrors.company_nif ? 'company_nif-error' : undefined}
                />
                {fieldErrors.company_nif && (
                  <p id="company_nif-error" className="text-xs text-destructive">{fieldErrors.company_nif}</p>
                )}
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="company_address">{t('publicContractIntake.address')} *</Label>
                <Input
                  id="company_address"
                  value={formData.company_address}
                  onChange={e => { setFormData(p => ({ ...p, company_address: e.target.value })); clearFieldError('company_address'); }}
                  aria-invalid={!!fieldErrors.company_address}
                  aria-describedby={fieldErrors.company_address ? 'company_address-error' : undefined}
                />
                {fieldErrors.company_address && (
                  <p id="company_address-error" className="text-xs text-destructive">{fieldErrors.company_address}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_city">{t('publicContractIntake.city')} *</Label>
                <Input
                  id="company_city"
                  value={formData.company_city}
                  onChange={e => { setFormData(p => ({ ...p, company_city: e.target.value })); clearFieldError('company_city'); }}
                  aria-invalid={!!fieldErrors.company_city}
                  aria-describedby={fieldErrors.company_city ? 'company_city-error' : undefined}
                />
                {fieldErrors.company_city && (
                  <p id="company_city-error" className="text-xs text-destructive">{fieldErrors.company_city}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_postal_code">{t('publicContractIntake.postalCode')} *</Label>
                <Input
                  id="company_postal_code"
                  value={formData.company_postal_code}
                  onChange={e => { setFormData(p => ({ ...p, company_postal_code: e.target.value })); clearFieldError('company_postal_code'); }}
                  aria-invalid={!!fieldErrors.company_postal_code}
                  aria-describedby={fieldErrors.company_postal_code ? 'company_postal_code-error' : undefined}
                />
                {fieldErrors.company_postal_code && (
                  <p id="company_postal_code-error" className="text-xs text-destructive">{fieldErrors.company_postal_code}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iban">IBAN</Label>
                <Input id="iban" value={formData.iban} onChange={e => setFormData(p => ({ ...p, iban: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={formData.website} onChange={e => setFormData(p => ({ ...p, website: e.target.value }))} />
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="certidao_permanente_code">{t('publicContractIntake.permanentCertificateCode')}</Label>
              <Input id="certidao_permanente_code" value={formData.certidao_permanente_code} onChange={e => setFormData(p => ({ ...p, certidao_permanente_code: e.target.value }))} placeholder={t('publicContractIntake.onlineAccessCode')} />
            </div>

            <Separator />

            <p className="text-sm font-semibold">{t('publicContractIntake.legalRepresentativeManagerSPromoter')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="legal_representative_name">{t('publicContractIntake.fullName')} *</Label>
                <Input
                  id="legal_representative_name"
                  value={formData.legal_representative_name}
                  onChange={e => { setFormData(p => ({ ...p, legal_representative_name: e.target.value })); clearFieldError('legal_representative_name'); }}
                  aria-invalid={!!fieldErrors.legal_representative_name}
                  aria-describedby={fieldErrors.legal_representative_name ? 'legal_representative_name-error' : undefined}
                />
                {fieldErrors.legal_representative_name && (
                  <p id="legal_representative_name-error" className="text-xs text-destructive">{fieldErrors.legal_representative_name}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal_representative_email">Email *</Label>
                <Input
                  id="legal_representative_email"
                  type="email"
                  value={formData.legal_representative_email}
                  onChange={e => { setFormData(p => ({ ...p, legal_representative_email: e.target.value })); clearFieldError('legal_representative_email'); }}
                  aria-invalid={!!fieldErrors.legal_representative_email}
                  aria-describedby={fieldErrors.legal_representative_email ? 'legal_representative_email-error' : undefined}
                />
                {fieldErrors.legal_representative_email && (
                  <p id="legal_representative_email-error" className="text-xs text-destructive">{fieldErrors.legal_representative_email}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal_representative_phone">{t('publicContractIntake.phone')} *</Label>
                <Input
                  id="legal_representative_phone"
                  type="tel"
                  value={formData.legal_representative_phone}
                  onChange={e => { setFormData(p => ({ ...p, legal_representative_phone: e.target.value })); clearFieldError('legal_representative_phone'); }}
                  aria-invalid={!!fieldErrors.legal_representative_phone}
                  aria-describedby={fieldErrors.legal_representative_phone ? 'legal_representative_phone-error' : undefined}
                  placeholder="+351 900 000 000"
                />
                {fieldErrors.legal_representative_phone && (
                  <p id="legal_representative_phone-error" className="text-xs text-destructive">{fieldErrors.legal_representative_phone}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing_email">{t('publicContractIntake.billingEmail')}</Label>
                <Input id="billing_email" type="email" value={formData.billing_email} onChange={e => setFormData(p => ({ ...p, billing_email: e.target.value }))} />
              </div>
            </div>

            {/* Additional representatives */}
            {formData.additional_representatives.map((rep, idx) => (
              <div key={idx} className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t('publicContractIntake.additionalRepresentativeN', { n: idx + 2 })}
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
                    {t('publicContractIntake.remove')}
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
                    placeholder={t('publicContractIntake.fullName2')}
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
                    placeholder={t('publicContractIntake.phone2')}
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
              + {t('publicContractIntake.addRepresentativeManager')}
            </Button>

            <Separator />

            <div className="space-y-1.5">
              <Label>{t('publicContractIntake.projectDescription')}</Label>
              <Textarea
                value={formData.startup_description}
                onChange={e => setFormData(p => ({ ...p, startup_description: e.target.value }))}
                placeholder={t('publicContractIntake.briefDescriptionOfYourStartupAnd')}
                rows={3}
              />
            </div>

            <Separator />

            {/* Optional Documents Section */}
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {t('publicContractIntake.documentsOptional')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('publicContractIntake.documentsCanBeSentLaterSubmission')}
              </p>
              <div className="grid gap-2">
                {OPTIONAL_DOCS.map(doc => {
                  const uploaded = intake?.documents_json?.[doc.key];
                  const isUploading = uploadingDocKey === doc.key;
                  return (
                    <div key={doc.key} className="flex items-center justify-between gap-3 p-2 rounded border border-border/50 bg-muted/30">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm truncate">{t(`publicContract.docs.${doc.key}.label`, { defaultValue: doc.labelPt })}</span>
                        {uploaded?.file_name && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            {uploaded.file_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {uploaded ? (
                          <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t('publicContractIntake.uploaded')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {t('publicContract.optional')}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSubmitted || isUploading} loading={isUploading}
                          onClick={() => {
                            const input = document.getElementById(`upload-${doc.key}`) as HTMLInputElement | null;
                            input?.click();
                          }}
                          className="gap-1.5"
                        >
                          {isUploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {uploaded ? (t('publicContractIntake.replace')) : (t('publicContractIntake.upload'))}
                        </Button>
                        <input
                          id={`upload-${doc.key}`}
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) handleUploadDoc(doc.key, f);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            size="lg"
            className="gap-2"
            disabled={
              submitMutation.isPending ||
              !formData.organization_name ||
              !formData.company_nif ||
              !formData.legal_representative_name ||
              !formData.legal_representative_email ||
              !formData.legal_representative_phone
            } loading={submitMutation.isPending}
            onClick={async () => { await autosave.flush(); submitMutation.mutate(); }}
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {t('publicContractIntake.submitData')}
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center pb-8">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            {t('publicContractIntake.yourDataIsHandledSecurelyAnd')}
          </div>
        </div>
      </div>
    </div>
  );
}
