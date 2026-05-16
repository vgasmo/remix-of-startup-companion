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
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2, CheckCircle2,
  Shield, Loader2, AlertTriangle, Upload, Globe, Info
} from 'lucide-react';

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
  const { i18n } = useTranslation();
  const [lang, setLang] = useState<'pt' | 'en'>(() =>
    i18n.language?.startsWith('pt') ? 'pt' : 'en'
  );
  const isPt = lang === 'pt';

  const [formData, setFormData] = useState<IntakeFormData>({
    organization_name: '', project_name: '', company_nif: '', certidao_permanente_code: '',
    company_address: '', company_city: '',
    company_postal_code: '', iban: '', legal_representative_name: '',
    legal_representative_email: '', legal_representative_phone: '',
    additional_representatives: [],
    billing_email: '', startup_description: '', website: '',
  });

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
      toast.success(isPt ? 'Dados submetidos com sucesso!' : 'Data submitted successfully!');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Erro ao submeter');
    },
  });

  const toggleLang = () => {
    const next = lang === 'pt' ? 'en' : 'pt';
    setLang(next);
    i18n.changeLanguage(next);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError || !intake) {
    // Never expose technical error messages to public users
    const isExpired = (fetchError as any)?.message?.includes('expired');
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <p className="text-lg font-semibold">
              {isExpired
                ? (isPt ? 'Link Expirado' : 'Link Expired')
                : (isPt ? 'Link Inválido' : 'Invalid Link')}
            </p>
            <p className="text-sm text-muted-foreground">
              {isExpired
                ? (isPt
                  ? 'Este link expirou. Contacte a equipa da Startup Leiria para obter um novo link.'
                  : 'This link has expired. Contact the Startup Leiria team for a new link.')
                : (isPt
                  ? 'Este link não é válido ou já foi utilizado. Contacte a equipa da Startup Leiria para assistência.'
                  : 'This link is not valid or has already been used. Contact the Startup Leiria team for assistance.')}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {isPt ? 'Email: info@startupleiria.com' : 'Email: info@startupleiria.com'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            <p className="text-lg font-semibold">{isPt ? 'Dados Submetidos!' : 'Data Submitted!'}</p>
            <p className="text-sm text-muted-foreground">
              {isPt
                ? 'Os seus dados foram recebidos e serão validados pela nossa equipa. Será contactado quando o contrato estiver pronto para assinatura.'
                : 'Your data has been received and will be reviewed by our team. You will be contacted when the contract is ready for signing.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
            {isPt ? 'Formulário de Contratação' : 'Contracting Form'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isPt
              ? 'Preencha os dados da sua empresa para iniciar o processo de contratação. Todos os documentos são opcionais nesta fase.'
              : 'Fill in your company data to start the contracting process. All documents are optional at this stage.'}
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
                {isPt ? 'Correções Solicitadas' : 'Changes Requested'}
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
              {isPt
                ? 'Esta fase é apenas de recolha de dados. O contrato será preparado pela equipa após a validação dos dados e enviado separadamente para assinatura.'
                : 'This is a data collection step only. The contract will be prepared by our team after data validation and sent separately for signing.'}
            </p>
          </CardContent>
        </Card>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isPt ? 'Dados da Empresa' : 'Company Data'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{isPt ? 'Nome da Organização' : 'Organization Name'} *</Label>
                <Input value={formData.organization_name} onChange={e => setFormData(p => ({ ...p, organization_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? 'Nome do Projeto (se diferente)' : 'Project Name (if different)'}</Label>
                <Input value={formData.project_name} onChange={e => setFormData(p => ({ ...p, project_name: e.target.value }))} placeholder={isPt ? 'Nome comercial do projeto' : 'Commercial project name'} />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? 'NIF (Empresa ou Pessoa)' : 'Tax ID (Company or Personal)'} *</Label>
                <Input value={formData.company_nif} onChange={e => setFormData(p => ({ ...p, company_nif: e.target.value }))} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>{isPt ? 'Morada' : 'Address'} *</Label>
                <Input value={formData.company_address} onChange={e => setFormData(p => ({ ...p, company_address: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? 'Cidade' : 'City'} *</Label>
                <Input value={formData.company_city} onChange={e => setFormData(p => ({ ...p, company_city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? 'Código Postal' : 'Postal Code'} *</Label>
                <Input value={formData.company_postal_code} onChange={e => setFormData(p => ({ ...p, company_postal_code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>IBAN</Label>
                <Input value={formData.iban} onChange={e => setFormData(p => ({ ...p, iban: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={formData.website} onChange={e => setFormData(p => ({ ...p, website: e.target.value }))} />
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>{isPt ? 'Código da Certidão Permanente' : 'Permanent Certificate Code'}</Label>
              <Input value={formData.certidao_permanente_code} onChange={e => setFormData(p => ({ ...p, certidao_permanente_code: e.target.value }))} placeholder={isPt ? 'Código de acesso online' : 'Online access code'} />
            </div>

            <Separator />

            <p className="text-sm font-semibold">{isPt ? 'Representante Legal / Gerente(s) / Promotor' : 'Legal Representative / Manager(s) / Promoter'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{isPt ? 'Nome Completo' : 'Full Name'} *</Label>
                <Input value={formData.legal_representative_name} onChange={e => setFormData(p => ({ ...p, legal_representative_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={formData.legal_representative_email} onChange={e => setFormData(p => ({ ...p, legal_representative_email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? 'Telefone' : 'Phone'} *</Label>
                <Input type="tel" value={formData.legal_representative_phone} onChange={e => setFormData(p => ({ ...p, legal_representative_phone: e.target.value }))} placeholder="+351 900 000 000" />
              </div>
              <div className="space-y-1.5">
                <Label>{isPt ? 'Email de Faturação' : 'Billing Email'}</Label>
                <Input type="email" value={formData.billing_email} onChange={e => setFormData(p => ({ ...p, billing_email: e.target.value }))} />
              </div>
            </div>

            {/* Additional representatives */}
            {formData.additional_representatives.map((rep, idx) => (
              <div key={idx} className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {isPt ? `Representante/Gerente adicional ${idx + 2}` : `Additional Representative/Manager ${idx + 2}`}
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
                    {isPt ? 'Remover' : 'Remove'}
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
                    placeholder={isPt ? 'Nome completo' : 'Full name'}
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
                    placeholder={isPt ? 'Telefone' : 'Phone'}
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
              + {isPt ? 'Adicionar Representante/Gerente' : 'Add Representative/Manager'}
            </Button>

            <Separator />

            <div className="space-y-1.5">
              <Label>{isPt ? 'Descrição do Projeto' : 'Project Description'}</Label>
              <Textarea
                value={formData.startup_description}
                onChange={e => setFormData(p => ({ ...p, startup_description: e.target.value }))}
                placeholder={isPt ? 'Breve descrição da startup e do projeto...' : 'Brief description of your startup and project...'}
                rows={3}
              />
            </div>

            <Separator />

            {/* Optional Documents Section */}
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {isPt ? 'Documentos (Opcionais)' : 'Documents (Optional)'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isPt
                  ? 'Os documentos podem ser enviados mais tarde. A submissão não é bloqueada pela falta de documentos.'
                  : 'Documents can be sent later. Submission is not blocked by missing documents.'}
              </p>
              <div className="grid gap-2">
                {OPTIONAL_DOCS.map(doc => (
                  <div key={doc.key} className="flex items-center justify-between p-2 rounded border border-border/50 bg-muted/30">
                    <span className="text-sm">{isPt ? doc.labelPt : doc.labelEn}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {isPt ? 'Opcional' : 'Optional'}
                    </Badge>
                  </div>
                ))}
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
            }
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isPt ? 'Submeter Dados' : 'Submit Data'}
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center pb-8">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            {isPt ? 'Os seus dados são tratados de forma segura e confidencial.' : 'Your data is handled securely and confidentially.'}
          </div>
        </div>
      </div>
    </div>
  );
}
