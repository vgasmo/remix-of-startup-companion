/**
 * Public Contract Signing Page
 * Accessible via token link — no authentication required.
 * Multi-step: 1) Company Data + Documents → 2) Review Contract & Regulation → 3) Digital Signature (provider-agnostic)
 * Fully bilingual PT/EN with language switcher.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Building2, FileText, PenTool, CheckCircle2, ArrowRight, ArrowLeft,
  Shield, Loader2, AlertTriangle, Upload, X, Globe, FileUp, Mail, RotateCcw
} from 'lucide-react';
import { useContractDraftAutosave } from '@/hooks/useContractDraftAutosave';

type WizardStep = 'company_data' | 'review_contract' | 'signing';

interface CompanyFormData {
  legal_representative_name: string;
  legal_representative_email: string;
  legal_representative_phone: string;
  company_nif: string;
  company_address: string;
  company_city: string;
  company_postal_code: string;
  project_name: string;
}

interface UploadedDoc {
  name: string;
  path: string;
  size: number;
}

// All documents are optional
const ONBOARDING_DOCS = [
  {
    key: 'certidao_comercial',
    labelPt: 'Certidão Permanente / Código de Acesso',
    labelEn: 'Commercial Registry Certificate / Access Code',
    descPt: 'Certidão permanente da empresa ou código de acesso ao registo comercial',
    descEn: 'Permanent certificate or commercial registry access code',
  },
  {
    key: 'id_representante',
    labelPt: 'Documento de Identificação do Representante Legal',
    labelEn: 'Legal Representative ID Document',
    descPt: 'Cartão de cidadão, BI ou passaporte do representante legal',
    descEn: 'Citizen card, ID card or passport of the legal representative',
  },
  {
    key: 'comprovativo_morada',
    labelPt: 'Comprovativo de Morada',
    labelEn: 'Proof of Address',
    descPt: 'Comprovativo de morada da empresa ou representante legal',
    descEn: 'Proof of address of the company or legal representative',
  },
  {
    key: 'comprovativo_iban',
    labelPt: 'Comprovativo de IBAN',
    labelEn: 'IBAN Proof',
    descPt: 'Comprovativo do IBAN da conta bancária da empresa',
    descEn: 'Proof of company bank account IBAN',
  },
  {
    key: 'pitch_deck',
    labelPt: 'Pitch Deck / Apresentação da Startup',
    labelEn: 'Pitch Deck / Startup Presentation',
    descPt: 'Apresentação do projeto (PDF ou PPT)',
    descEn: 'Project presentation (PDF or PPT)',
  },
  {
    key: 'docs_associacoes',
    labelPt: 'Documentos de Associações',
    labelEn: 'Association Documents',
    descPt: 'Documentos de associações relevantes para o projeto',
    descEn: 'Documents from relevant associations for the project',
  },
];

const STEPS: { key: WizardStep; icon: typeof Building2 }[] = [
  { key: 'company_data', icon: Building2 },
  { key: 'review_contract', icon: FileText },
  { key: 'signing', icon: PenTool },
];

type SignatureProvider = 'docusign' | 'pandadoc' | 'manual' | 'assinatura_digital' | 'pandadoc_manual' | string;

const providerLabel = (p: SignatureProvider, lang: 'pt' | 'en'): string => {
  switch (p) {
    case 'docusign': return 'DocuSign';
    case 'pandadoc': return 'PandaDoc';
    case 'assinatura_digital': return lang === 'pt' ? 'Assinatura Digital' : 'Digital Signature';
    case 'pandadoc_manual': return 'PandaDoc';
    case 'manual': return lang === 'pt' ? 'Assinatura Manual' : 'Manual Signature';
    default: return lang === 'pt' ? 'Assinatura' : 'Signature';
  }
};

const stepSigningLabel = (p: SignatureProvider, lang: 'pt' | 'en'): string => {
  if (p === 'manual') return lang === 'pt' ? 'Assinatura Manual' : 'Manual Signature';
  return lang === 'pt' ? 'Assinatura Digital' : 'Digital Signature';
};

const getStepLabels = (provider: SignatureProvider): Record<WizardStep, { pt: string; en: string }> => ({
  company_data: { pt: 'Dados e Documentos', en: 'Data & Documents' },
  review_contract: { pt: 'Rever Contrato', en: 'Review Contract' },
  signing: { pt: stepSigningLabel(provider, 'pt'), en: stepSigningLabel(provider, 'en') },
});

export default function PublicContractSigning() {
  const { token } = useParams<{ token: string }>();
  const { i18n } = useTranslation();
  const [lang, setLang] = useState<'pt' | 'en'>(() =>
    i18n.language?.startsWith('pt') ? 'pt' : 'en'
  );
  const isPt = lang === 'pt';

  const [currentStep, setCurrentStep] = useState<WizardStep>('company_data');
  const [regulationAccepted, setRegulationAccepted] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  
  // Digital signature state
  const [typedSignature, setTypedSignature] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedDigital, setAcceptedDigital] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [formData, setFormData] = useState<CompanyFormData>({
    legal_representative_name: '',
    legal_representative_email: '',
    legal_representative_phone: '',
    company_nif: '',
    company_address: '',
    company_city: '',
    company_postal_code: '',
    project_name: '',
  });

  // Toggle language
  const toggleLang = () => {
    const next = lang === 'pt' ? 'en' : 'pt';
    setLang(next);
    i18n.changeLanguage(next);
  };

  // Fetch contract via public edge function
  const { data: contract, isLoading, error: fetchError } = useQuery({
    queryKey: ['public-contract', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: { action: 'get_contract', token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.contract;
    },
    retry: false,
  });

  // Pre-fill from contract/startup data
  useEffect(() => {
    if (contract) {
      const startup = contract.workspace?.startup;
      setFormData(prev => ({
        ...prev,
        legal_representative_name: contract.legal_representative_name || startup?.main_contact_name || '',
        legal_representative_email: contract.legal_representative_email || startup?.main_contact_email || '',
        legal_representative_phone: contract.legal_representative_phone || '',
        company_nif: contract.company_nif || startup?.nif || '',
        company_address: contract.company_address || startup?.address || '',
        company_city: contract.company_city || '',
        company_postal_code: contract.company_postal_code || '',
        project_name: (contract as any).project_name || '',
      }));

      if (contract.signature_status === 'sent_for_signature' || contract.signature_status === 'completed') {
        setCurrentStep('signing');
      }
    }
  }, [contract]);

  // Upload document via edge function (no auth required — token validated server-side)
  const handleFileUpload = async (docKey: string, file: File) => {
    if (!token || !contract) return;
    setUploading(docKey);
    try {
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';

      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: {
          action: 'upload_document',
          token,
          docKey,
          fileName: file.name,
          fileBase64: base64,
          fileExt: ext,
          mimeType: file.type,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setUploadedDocs(prev => ({
        ...prev,
        [docKey]: { name: file.name, path: data.path, size: file.size },
      }));
      toast.success(isPt ? 'Documento carregado' : 'Document uploaded');
    } catch (err: any) {
      toast.error(err?.message || (isPt ? 'Erro ao carregar documento' : 'Upload error'));
    } finally {
      setUploading(null);
    }
  };

  const removeDoc = (docKey: string) => {
    setUploadedDocs(prev => ({ ...prev, [docKey]: null }));
  };

  // Digital signature handler
  const handleDigitalSign = async () => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: {
          action: 'digital_sign',
          token,
          signatureData: {
            typed_name: typedSignature,
            signer_email: formData.legal_representative_email,
            signer_nif: formData.company_nif,
            accepted_terms: true,
            accepted_eidas: true,
            signed_at: new Date().toISOString(),
            user_agent: navigator.userAgent,
          }
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(isPt ? 'Contrato assinado com sucesso!' : 'Contract signed successfully!');
      // Refresh to show completed state
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message || (isPt ? 'Erro ao assinar' : 'Signing failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download PDF handler
  const handleDownloadPdf = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: { action: 'download_pdf', token }
      });
      if (error) throw error;
      if (data?.documentBase64) {
        const blob = new Blob([Uint8Array.from(atob(data.documentBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch {
      toast.error(isPt ? 'Erro ao descarregar PDF' : 'Failed to download PDF');
    }
  };

  // Server save callback — used by autosave hook and by explicit save button.
  const persistFormDataServer = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
      body: {
        action: 'save_data',
        token,
        formData: payload,
        documents: Object.fromEntries(
          Object.entries(uploadedDocs).filter(([, v]) => v).map(([k, v]) => [k, v!.path])
        ),
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  };

  const isSigned =
    contract?.signature_status === 'signed' ||
    contract?.signature_status === 'completed';

  // Debounced autosave — every keystroke → localStorage; server save 1.5s debounced.
  const autosave = useContractDraftAutosave<Record<string, unknown>>({
    scopeKey: token ?? null,
    namespace: 'contract-signing',
    serverData: contract ? (contract as unknown as Record<string, unknown>) : null,
    serverUpdatedAt: (contract as any)?.updated_at ?? null,
    disabled: isSigned,
    debounceMs: 1500,
    serverSave: persistFormDataServer,
  });

  useEffect(() => {
    if (!contract || isSigned) return;
    autosave.trackChange(formData as unknown as Record<string, unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // Save company data (explicit, on "Next" button)
  const saveCompanyData = useMutation({
    mutationFn: async () => {
      await autosave.flush();
      await persistFormDataServer(formData as unknown as Record<string, unknown>);
    },
    onSuccess: () => {
      setCurrentStep('review_contract');
      toast.success(isPt ? 'Dados guardados com sucesso' : 'Data saved successfully');
    },
    onError: () => toast.error(isPt ? 'Erro ao guardar dados' : 'Error saving data'),
  });

  // Submit for signature (provider-agnostic — backend resolves provider)
  const submitForSigning = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('public-contract-onboarding', {
        body: { action: 'submit_signing', token, formData },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setCurrentStep('signing');
      const sigProv: SignatureProvider = contract?.signature_provider || 'manual';
      if (sigProv === 'manual') {
        toast.success(isPt ? 'Contrato submetido para assinatura manual!' : 'Contract submitted for manual signature!');
      } else {
        toast.success(isPt ? `Contrato enviado para assinatura via ${providerLabel(sigProv, 'pt')}!` : `Contract sent for signature via ${providerLabel(sigProv, 'en')}!`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || (isPt ? 'Erro ao enviar para assinatura' : 'Signing error'));
      setCurrentStep('signing');
    },
  });

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const allDocsOptional = true; // All documents are now optional

  const isFormValid =
    formData.legal_representative_name.trim() &&
    formData.legal_representative_email.trim() &&
    formData.company_nif.trim() &&
    formData.company_address.trim() &&
    formData.company_city.trim() &&
    formData.company_postal_code.trim();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">
            {isPt ? 'A carregar contrato...' : 'Loading contract...'}
          </p>
        </div>
      </div>
    );
  }

  // Error / expired state
  if (fetchError || !contract) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive/60" />
            <h2 className="text-lg font-semibold">
              {isPt ? 'Link inválido ou expirado' : 'Invalid or expired link'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isPt
                ? 'Este link de contrato já não é válido. Contacte a equipa da Startup Leiria para obter um novo link.'
                : 'This contract link is no longer valid. Contact the Startup Leiria team for a new link.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sigStatus = contract.signature_status;
  const sigProvider: SignatureProvider = contract.signature_provider || 'manual';
  const startupName = contract.workspace?.startup?.name || 'Startup';
  const stepLabels = getStepLabels(sigProvider);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Public header with language toggle */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Startup Leiria</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="h-8 text-xs gap-1.5"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === 'pt' ? 'EN' : 'PT'}
            </Button>
            <Badge variant="outline" className="text-xs">
              {isPt ? 'Onboarding Contratual' : 'Contract Onboarding'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isPt ? 'Contrato de Incubação' : 'Incubation Contract'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {startupName} — {contract.contract_number || (isPt ? 'Novo Contrato' : 'New Contract')}
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-3">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = step.key === currentStep;
              const isDone = i < stepIndex;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-1.5 text-xs font-medium ${isActive ? 'text-primary' : isDone ? 'text-emerald-600' : 'text-muted-foreground'}`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  {stepLabels[step.key][lang]}
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== Step 1: Company Data + Document Uploads ===== */}
        {currentStep === 'company_data' && (
          <div className="space-y-6">
            {/* Restore-from-local-draft banner */}
            {autosave.restoredFromLocal && autosave.restorePreview && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 flex items-start gap-3">
                  <RotateCcw className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 text-xs">
                    <p className="font-semibold">
                      {isPt ? 'Encontrámos dados não guardados' : 'Unsaved data found'}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {isPt ? 'Quer restaurar o rascunho?' : 'Restore your draft?'}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      onClick={() => {
                        const draft = autosave.restorePreview as Partial<CompanyFormData> | null;
                        if (draft) setFormData(prev => ({ ...prev, ...draft }));
                        autosave.dismissRestoredBanner();
                      }}
                    >
                      {isPt ? 'Restaurar' : 'Restore'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => autosave.clearDraft()}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Save-status pill */}
            <div className="text-[11px] text-muted-foreground text-right" aria-live="polite">
              {autosave.status === 'saving' && (isPt ? 'A guardar…' : 'Saving…')}
              {autosave.status === 'saved' && (isPt ? 'Guardado' : 'Saved')}
              {autosave.status === 'local_only' && (isPt ? 'Guardado neste dispositivo' : 'Saved on this device')}
              {autosave.status === 'error' && (isPt ? 'Erro ao guardar' : 'Save error')}
            </div>
            {/* Company & Legal Rep Data */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {isPt ? 'Dados da Empresa e Representante Legal' : 'Company & Legal Representative Data'}
                </CardTitle>
                <CardDescription>
                  {isPt
                    ? 'Estes dados serão utilizados para a geração automática do contrato de incubação.'
                    : 'This data will be used to automatically generate the incubation contract.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'Nome do Representante Legal / Gerente(s) / Promotor *' : 'Legal Representative / Manager(s) / Promoter *'}</Label>
                    <Input
                      value={formData.legal_representative_name}
                      onChange={e => setFormData(prev => ({ ...prev, legal_representative_name: e.target.value }))}
                      placeholder={isPt ? 'Nome completo' : 'Full name'}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'Email do Representante *' : 'Representative Email *'}</Label>
                    <Input
                      type="email"
                      value={formData.legal_representative_email}
                      onChange={e => setFormData(prev => ({ ...prev, legal_representative_email: e.target.value }))}
                      placeholder="email@empresa.pt"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'Telefone' : 'Phone'}</Label>
                    <Input
                      type="tel"
                      value={formData.legal_representative_phone}
                      onChange={e => setFormData(prev => ({ ...prev, legal_representative_phone: e.target.value }))}
                      placeholder="+351 900 000 000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'Nome do Projeto (se diferente)' : 'Project Name (if different)'}</Label>
                    <Input
                      value={formData.project_name}
                      onChange={e => setFormData(prev => ({ ...prev, project_name: e.target.value }))}
                      placeholder={isPt ? 'Nome comercial do projeto' : 'Commercial project name'}
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'NIF (Empresa ou Pessoa) *' : 'Tax ID (Company or Personal) *'}</Label>
                    <Input
                      value={formData.company_nif}
                      onChange={e => setFormData(prev => ({ ...prev, company_nif: e.target.value }))}
                      placeholder="123456789"
                      maxLength={9}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'Morada Fiscal *' : 'Registered Address *'}</Label>
                    <Input
                      value={formData.company_address}
                      onChange={e => setFormData(prev => ({ ...prev, company_address: e.target.value }))}
                      placeholder={isPt ? 'Rua, número, andar' : 'Street, number, floor'}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'Cidade *' : 'City *'}</Label>
                    <Input
                      value={formData.company_city}
                      onChange={e => setFormData(prev => ({ ...prev, company_city: e.target.value }))}
                      placeholder="Leiria"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isPt ? 'Código Postal *' : 'Postal Code *'}</Label>
                    <Input
                      value={formData.company_postal_code}
                      onChange={e => setFormData(prev => ({ ...prev, company_postal_code: e.target.value }))}
                      placeholder="2400-000"
                    />
                  </div>
                </div>

                {/* Contract summary */}
                <Separator />
                <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {isPt ? 'Resumo do Contrato' : 'Contract Summary'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{isPt ? 'Tipo:' : 'Type:'}</span>{' '}
                      {contract.incubation_type?.name || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{isPt ? 'Edifício:' : 'Building:'}</span>{' '}
                      {contract.building?.name || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{isPt ? 'Mensalidade:' : 'Monthly Fee:'}</span>{' '}
                      {contract.monthly_fee}€/{contract.currency || 'EUR'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{isPt ? 'Início:' : 'Start:'}</span>{' '}
                      {new Date(contract.start_date).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB')}
                    </div>
                    {contract.square_meters && (
                      <div>
                        <span className="text-muted-foreground">{isPt ? 'Área:' : 'Area:'}</span>{' '}
                        {contract.square_meters} m²
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Required Document Uploads */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileUp className="h-5 w-5 text-primary" />
                  {isPt ? 'Documentos' : 'Documents'}
                </CardTitle>
                <CardDescription>
                  {isPt
                    ? 'Carregue os seguintes documentos para completar o processo de onboarding. Todos os documentos são opcionais nesta fase.'
                    : 'Upload the following documents to complete the onboarding process. All documents are optional at this stage.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ONBOARDING_DOCS.map(doc => {
                  const uploaded = uploadedDocs[doc.key];
                  const isUploading = uploading === doc.key;
                  return (
                    <div
                      key={doc.key}
                      className={`border rounded-lg p-3 transition-colors ${
                        uploaded ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium">
                              {isPt ? doc.labelPt : doc.labelEn}
                            </p>
                            {/* Optional badge placeholder – removed to satisfy lint */}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isPt ? doc.descPt : doc.descEn}
                          </p>
                          {uploaded && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="text-xs text-emerald-700 dark:text-emerald-400 truncate">
                                {uploaded.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ({(uploaded.size / 1024).toFixed(0)} KB)
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          {uploaded ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-destructive hover:text-destructive gap-1"
                              onClick={() => removeDoc(doc.key)}
                            >
                              <X className="h-3.5 w-3.5" />
                              {isPt ? 'Remover' : 'Remove'}
                            </Button>
                          ) : (
                            <>
                              <input
                                ref={el => { fileInputRefs.current[doc.key] = el; }}
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(doc.key, file);
                                  e.target.value = '';
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1.5"
                                disabled={isUploading}
                                onClick={() => fileInputRefs.current[doc.key]?.click()}
                              >
                                {isUploading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                                {isPt ? 'Carregar' : 'Upload'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* All documents are optional — no blocking warning */}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => saveCompanyData.mutate()}
                disabled={!isFormValid || saveCompanyData.isPending}
                className="gap-2"
              >
                {saveCompanyData.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isPt ? 'Continuar' : 'Continue'} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ===== Step 2: Review Contract & Regulation ===== */}
        {currentStep === 'review_contract' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {isPt ? 'Rever Contrato e Regulamento' : 'Review Contract & Regulation'}
              </CardTitle>
              <CardDescription>
                {sigProvider === 'manual'
                  ? (isPt
                    ? 'Reveja os documentos antes de submeter para assinatura manual.'
                    : 'Review the documents before submitting for manual signature.')
                  : (isPt
                    ? `Reveja os documentos antes de enviar para assinatura via ${providerLabel(sigProvider, 'pt')}.`
                    : `Review the documents before sending for signature via ${providerLabel(sigProvider, 'en')}.`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Contract Document */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">
                      {isPt ? 'Minuta de Contrato de Incubação' : 'Incubation Contract Template'}
                    </p>
                    <p className="text-xs text-muted-foreground">{isPt ? 'Minuta Oficial' : 'Official Template'} — 2026</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isPt
                    ? 'O contrato será gerado automaticamente com os seus dados e enviado para assinatura digital. O documento segue a minuta oficial da Startup Leiria.'
                    : 'The contract will be automatically generated with your data and sent for digital signature. The document follows the official template from Startup Leiria.'}
                </p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="accept-contract"
                    checked={contractAccepted}
                    onCheckedChange={(v) => setContractAccepted(v === true)}
                  />
                  <label htmlFor="accept-contract" className="text-xs leading-tight cursor-pointer">
                    {isPt
                      ? 'Li e aceito os termos do Contrato de Incubação, incluindo as condições de prestação de serviços, obrigações e direitos das partes.'
                      : 'I have read and accept the Incubation Contract terms, including service conditions, obligations and rights of both parties.'}
                  </label>
                </div>
              </div>

              {/* Regulation Document */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium">
                      {isPt ? 'Regulamento Startup Leiria' : 'Startup Leiria Regulation'}
                    </p>
                    <p className="text-xs text-muted-foreground">V11 — Anexo I — 2026</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isPt
                    ? 'O regulamento define as normas de funcionamento, direitos e deveres dos incubados, incluindo utilização de espaços, serviços complementares e condições de permanência.'
                    : 'The regulation defines the operating rules, rights and duties of incubatees, including use of spaces, complementary services and conditions of stay.'}
                </p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="accept-regulation"
                    checked={regulationAccepted}
                    onCheckedChange={(v) => setRegulationAccepted(v === true)}
                  />
                  <label htmlFor="accept-regulation" className="text-xs leading-tight cursor-pointer">
                    {isPt
                      ? 'Li e aceito o Regulamento da Startup Leiria (Anexo I), comprometendo-me a cumprir as normas e procedimentos nele estabelecidos.'
                      : 'I have read and accept the Startup Leiria Regulation (Annex I), committing to comply with its norms and procedures.'}
                  </label>
                </div>
              </div>

              {/* Company data summary */}
              <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isPt ? 'Dados Confirmados' : 'Confirmed Data'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{isPt ? 'Representante:' : 'Representative:'}</span>{' '}
                    {formData.legal_representative_name}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>{' '}
                    {formData.legal_representative_email}
                  </div>
                  <div>
                    <span className="text-muted-foreground">NIF:</span>{' '}
                    {formData.company_nif}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isPt ? 'Morada:' : 'Address:'}</span>{' '}
                    {formData.company_address}, {formData.company_city}
                  </div>
                </div>
                {/* Uploaded docs summary */}
                <Separator className="my-2" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isPt ? 'Documentos Carregados' : 'Uploaded Documents'}
                </p>
                <div className="space-y-1">
                  {ONBOARDING_DOCS.map(doc => {
                    const uploaded = uploadedDocs[doc.key];
                    return (
                      <div key={doc.key} className="flex items-center gap-2 text-xs">
                        {uploaded ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <span className="h-3 w-3 rounded-full bg-muted-foreground/30 inline-block" />
                        )}
                        <span className={uploaded ? '' : 'text-muted-foreground'}>
                          {isPt ? doc.labelPt : doc.labelEn}
                        </span>
                        {uploaded && (
                          <span className="text-muted-foreground">— {uploaded.name}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('company_data')} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> {isPt ? 'Voltar' : 'Back'}
                </Button>
                <Button
                  onClick={() => submitForSigning.mutate()}
                  disabled={!contractAccepted || !regulationAccepted || submitForSigning.isPending}
                  className="gap-2"
                >
                  {submitForSigning.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
                  {sigProvider === 'manual'
                    ? (isPt ? 'Submeter Contrato' : 'Submit Contract')
                    : (isPt ? `Enviar via ${providerLabel(sigProvider, 'pt')}` : `Send via ${providerLabel(sigProvider, 'en')}`)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== Step 3: Signing Status (provider-aware) ===== */}
        {currentStep === 'signing' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-primary" />
                {stepSigningLabel(sigProvider, lang)}
              </CardTitle>
              {sigProvider !== 'manual' && (
                <CardDescription className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{providerLabel(sigProvider, lang)}</Badge>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {(sigStatus === 'completed' || sigStatus === 'signed') ? (
                <div className="text-center py-8 space-y-3">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-primary" />
                  <h3 className="text-lg font-semibold text-primary">
                    {isPt ? 'Contrato Assinado!' : 'Contract Signed!'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isPt
                      ? 'O contrato foi assinado com sucesso. Receberá um email com os acessos à plataforma.'
                      : 'The contract has been signed successfully. You will receive an email with platform access.'}
                  </p>
                </div>

              ) : sigProvider === 'assinatura_digital' ? (
                /* ---- ASSINATURA DIGITAL SIMPLES (nacionais PT) ---- */
                <div className="space-y-6 py-4">
                  {/* Secção 1: Visualizar contrato */}
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <h4 className="font-medium text-sm mb-2">
                      {isPt ? '📄 Contrato para Assinatura' : '📄 Contract for Signature'}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      {isPt 
                        ? 'Reveja o contrato antes de assinar. Ao assinar, aceita todos os termos.'
                        : 'Review the contract before signing. By signing, you accept all terms.'}
                    </p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadPdf}>
                      <FileText className="h-3.5 w-3.5" />
                      {isPt ? 'Descarregar PDF do Contrato' : 'Download Contract PDF'}
                    </Button>
                  </div>
                  
                  {/* Secção 2: Dados do signatário */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <h4 className="font-medium text-sm">
                      {isPt ? '👤 Dados do Signatário' : '👤 Signer Details'}
                    </h4>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isPt ? 'Nome:' : 'Name:'}</span>
                        <span className="font-medium">{formData.legal_representative_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="font-medium">{formData.legal_representative_email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">NIF:</span>
                        <span className="font-medium">{formData.company_nif}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Secção 3: Assinatura */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <h4 className="font-medium text-sm">
                      {isPt ? '✍️ Assinatura' : '✍️ Signature'}
                    </h4>
                    
                    <div>
                      <Label className="text-xs">
                        {isPt ? 'Escreva o seu nome completo como assinatura' : 'Type your full name as signature'}
                      </Label>
                      <Input 
                        value={typedSignature}
                        onChange={(e) => setTypedSignature(e.target.value)}
                        placeholder={formData.legal_representative_name}
                        className="mt-1 font-serif text-lg italic"
                      />
                      {typedSignature && (
                        <div className="mt-2 p-3 bg-background border-2 border-dashed rounded text-center">
                          <span className="font-serif text-2xl italic text-foreground">{typedSignature}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Checkbox 
                          id="accept-terms"
                          checked={acceptedTerms}
                          onCheckedChange={(c) => setAcceptedTerms(c === true)}
                        />
                        <label htmlFor="accept-terms" className="text-xs leading-relaxed">
                          {isPt 
                            ? 'Li e aceito os termos do contrato de incubação e o regulamento interno da Startup Leiria.'
                            : 'I have read and accept the terms of the incubation contract and the internal regulations of Startup Leiria.'}
                        </label>
                      </div>
                      <div className="flex items-start gap-2">
                        <Checkbox 
                          id="accept-digital"
                          checked={acceptedDigital}
                          onCheckedChange={(c) => setAcceptedDigital(c === true)}
                        />
                        <label htmlFor="accept-digital" className="text-xs leading-relaxed">
                          {isPt 
                            ? 'Aceito que esta assinatura eletrónica simples tem o mesmo valor legal que uma assinatura manuscrita, nos termos do Regulamento eIDAS (UE 910/2014).'
                            : 'I accept that this simple electronic signature has the same legal value as a handwritten signature under the eIDAS Regulation (EU 910/2014).'}
                        </label>
                      </div>
                    </div>
                    
                    <Button 
                      className="w-full gap-2"
                      disabled={!typedSignature || !acceptedTerms || !acceptedDigital || typedSignature.length < 3 || isSubmitting}
                      onClick={handleDigitalSign}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
                      {isPt ? 'Assinar Contrato Digitalmente' : 'Sign Contract Digitally'}
                    </Button>
                    
                    <p className="text-[10px] text-muted-foreground text-center">
                      {isPt 
                        ? 'A sua assinatura, IP, data/hora e user agent serão registados como prova legal.'
                        : 'Your signature, IP, date/time, and user agent will be recorded as legal proof.'}
                    </p>
                  </div>
                </div>

              ) : sigProvider === 'pandadoc_manual' ? (
                /* ---- PANDADOC MANUAL: founder aguarda email do PandaDoc ---- */
                <div className="text-center py-8 space-y-4">
                  <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    {isPt ? 'Assinatura via PandaDoc' : 'Signature via PandaDoc'}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {isPt 
                      ? 'Irá receber um email do PandaDoc para assinar digitalmente o contrato. Verifique a sua caixa de entrada (e spam) em '
                      : 'You will receive an email from PandaDoc to digitally sign the contract. Check your inbox (and spam) at '}
                    <strong>{formData.legal_representative_email}</strong>
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {isPt ? 'Aguarda email do PandaDoc' : 'Awaiting PandaDoc email'}
                  </Badge>
                </div>

              ) : sigProvider === 'manual' ? (
                /* ---- MANUAL: presencial ---- */
                <div className="text-center py-8 space-y-4">
                  <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    {isPt ? 'Assinatura Manual em Processamento' : 'Manual Signature in Progress'}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isPt
                      ? 'O seu contrato foi submetido para assinatura manual. A equipa da Startup Leiria irá contactá-lo para agendar a assinatura presencial.'
                      : 'Your contract has been submitted for manual signature. The Startup Leiria team will contact you to schedule the in-person signing.'}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {isPt ? 'Aguarda contacto da equipa' : 'Awaiting team contact'}
                  </Badge>
                </div>

              ) : (
                /* ---- FALLBACK: other/legacy providers ---- */
                <div className="text-center py-8 space-y-4">
                  <div className="relative mx-auto w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <PenTool className="absolute inset-0 m-auto h-8 w-8 text-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    {isPt ? 'Aguardando Assinaturas' : 'Awaiting Signatures'}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isPt
                      ? <>Verifique o email <strong>{formData.legal_representative_email}</strong>.</>
                      : <>Check your email at <strong>{formData.legal_representative_email}</strong>.</>}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {isPt ? 'Pendente' : 'Pending'}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground py-4">
          <p>
            © {new Date().getFullYear()} Startup Leiria —{' '}
            {isPt ? 'Associação para o Empreendedorismo e Inovação' : 'Association for Entrepreneurship and Innovation'}
          </p>
        </div>
      </div>
    </div>
  );
}
