/**
 * Signature Providers Settings Card — DocuSign & PandaDoc configuration.
 * Reads/writes to global_integration_settings table via edge function.
 * Secrets (API keys) are stored as Supabase secrets, never in DB.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const t = i18n.t.bind(i18n);
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notify } from "@/lib/notify";
import {
  PenTool,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Shield,
  ExternalLink,
  Info,
  FileSignature,
  Loader2,
} from 'lucide-react';
import { invokeWithAuth } from '@/lib/invokeWithAuth';

interface ProviderSettings {
  id?: string;
  integration_type: string;
  is_enabled: boolean;
  settings_json: Record<string, unknown>;
  updated_at?: string;
}

function useSignatureProviderSettings(type: 'docusign' | 'pandadoc') {
  return useQuery({
    queryKey: ['global-integration-settings', type],
    queryFn: async (): Promise<ProviderSettings | null> => {
      const { data, error } = await invokeWithAuth('get-global-integrations', {
        body: { integration_type: type },
      });
      if (error) {
        const msg = typeof error === 'object' && error !== null ? (error as any).message || JSON.stringify(error) : String(error);
        if (msg.includes('403') || msg.includes('Access denied')) return null;
        throw error;
      }
      return (data?.settings?.[0] as ProviderSettings) || null;
    },
  });
}

function useSaveSignatureProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      integration_type: string;
      settings_json: Record<string, unknown>;
      is_enabled?: boolean;
    }) => {
      const { data, error } = await invokeWithAuth('set-global-integrations', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['global-integration-settings', vars.integration_type] });
      notify.success(t('admin.configuraçãoGuardada'));
    },
    onError: (err: Error) => {
      notify.error(err.message || 'Erro ao guardar');
    },
  });
}

// ─── DocuSign Card ──────────────────────────────────────────
function DocuSignSettingsCard() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useSignatureProviderSettings('docusign');
  const save = useSaveSignatureProvider();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [userId, setUserId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [initialized, setInitialized] = useState(false);

  const json = settings?.settings_json || {};
  const isConfigured = !!(json.account_id && json.user_id);

  useEffect(() => {
    if (json && !initialized) {
      setAccountId((json.account_id as string) || '');
      setUserId((json.user_id as string) || '');
      setBaseUrl((json.base_url as string) || 'https://demo.docusign.net/restapi');
      setInitialized(true);
    }
  }, [json, initialized]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <FileSignature className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">DocuSign</CardTitle>
              <CardDescription className="text-xs">
                {t('systemSettings.docusign.description', { defaultValue: 'Assinatura digital via DocuSign eSignature API' })}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isConfigured && settings?.is_enabled ? 'default' : 'secondary'} className="text-[10px]">
              {isConfigured && settings?.is_enabled ? t('common.active', 'Ativo') : isConfigured ? t('settings.configured', 'Configurado') : t('settings.notConfigured', 'Não configurado')}
            </Badge>
            <Switch
              checked={!!settings?.is_enabled}
              onCheckedChange={(enabled) => {
                if (enabled && !isConfigured) {
                  notify.error(t('admin.configureAsCredenciaisPrimeiro'));
                  return;
                }
                save.mutate({ integration_type: 'docusign', settings_json: json, is_enabled: enabled });
              }}
              disabled={save.isPending}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
              {t('systemSettings.configureCredentials', { defaultValue: 'Configurar credenciais' })}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">{t('integrations.accountId', 'Account ID')}</Label>
              <Input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="text-xs h-8" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('integrations.userId', 'User ID (Impersonation)')}</Label>
              <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="text-xs h-8" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('integrations.baseUrl', 'Base URL')}</Label>
              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://demo.docusign.net/restapi" className="text-xs h-8" />
            </div>
            <Alert>
              <Shield className="h-3.5 w-3.5" />
              <AlertDescription className="text-[10px]">
                {t('systemSettings.docusign.secretNote', {
                  defaultValue: 'A RSA Private Key e Integration Key devem ser configuradas como secrets do projeto (DOCUSIGN_PRIVATE_KEY, DOCUSIGN_INTEGRATION_KEY), nunca na base de dados.',
                })}
              </AlertDescription>
            </Alert>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => save.mutate({
                integration_type: 'docusign',
                settings_json: { account_id: accountId, user_id: userId, base_url: baseUrl },
              })}
              disabled={save.isPending || !accountId || !userId}
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t('common.save', { defaultValue: 'Guardar' })}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ─── PandaDoc Card ──────────────────────────────────────────
function PandaDocSettingsCard() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useSignatureProviderSettings('pandadoc');
  const save = useSaveSignatureProvider();
  const [open, setOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [initialized, setInitialized] = useState(false);

  const json = settings?.settings_json || {};
  const isConfigured = !!(json.configured);

  useEffect(() => {
    if (json && !initialized) {
      setWebhookUrl((json.webhook_url as string) || '');
      setInitialized(true);
    }
  }, [json, initialized]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  // Build the webhook URL for display
  const projectUrl = import.meta.env.VITE_SUPABASE_URL;
  const pandadocWebhookEndpoint = projectUrl ? `${projectUrl}/functions/v1/pandadoc-webhook` : '';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <PenTool className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">PandaDoc</CardTitle>
              <CardDescription className="text-xs">
                {t('systemSettings.pandadoc.description', { defaultValue: 'Assinatura digital via PandaDoc API' })}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isConfigured && settings?.is_enabled ? 'default' : 'secondary'} className="text-[10px]">
              {isConfigured && settings?.is_enabled ? t('common.active', 'Ativo') : isConfigured ? t('settings.configured', 'Configurado') : t('settings.notConfigured', 'Não configurado')}
            </Badge>
            <Switch
              checked={!!settings?.is_enabled}
              onCheckedChange={(enabled) => {
                if (enabled && !isConfigured) {
                  notify.error(t('admin.configureAsCredenciaisPrimeiro'));
                  return;
                }
                save.mutate({ integration_type: 'pandadoc', settings_json: json, is_enabled: enabled });
              }}
              disabled={save.isPending}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
              {t('systemSettings.configureCredentials', { defaultValue: 'Configurar credenciais' })}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <Alert>
              <Shield className="h-3.5 w-3.5" />
              <AlertDescription className="text-[10px]">
                {t('systemSettings.pandadoc.secretNote', {
                  defaultValue: 'A API Key do PandaDoc deve ser configurada como secret do projeto (PANDADOC_API_KEY), nunca na base de dados.',
                })}
              </AlertDescription>
            </Alert>

            {pandadocWebhookEndpoint && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('integrations.pandadocWebhookLabel', 'Webhook URL (configurar no PandaDoc)')}</Label>
                <div className="flex items-center gap-2">
                  <Input value={pandadocWebhookEndpoint} readOnly className="text-[10px] h-8 font-mono bg-muted/50" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(pandadocWebhookEndpoint);
                      notify.success(t('admin.urlCopiado'));
                    }}
                  >
                    {t('common.copy', 'Copiar')}
                  </Button>
                </div>
              </div>
            )}

            <Alert variant="default" className="bg-muted/30">
              <Info className="h-3.5 w-3.5" />
              <AlertDescription className="text-[10px] space-y-1">
                <p><strong>{t('integrations.setupInstructions', 'Para configurar:')}</strong></p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Aceda ao <a href="https://app.pandadoc.com/a/#/settings/integrations/api" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">PandaDoc Dashboard <ExternalLink className="h-2.5 w-2.5" /></a></li>
                  <li>Copie a API Key e adicione como secret <code className="text-[9px] bg-muted px-1 rounded">PANDADOC_API_KEY</code></li>
                  <li>Configure o Webhook URL acima no PandaDoc</li>
                  <li>Active a integração com o switch acima</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => save.mutate({
                integration_type: 'pandadoc',
                settings_json: { configured: true, webhook_url: pandadocWebhookEndpoint },
                is_enabled: true,
              })}
              disabled={save.isPending}
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t('systemSettings.pandadoc.markConfigured', { defaultValue: 'Marcar como configurado' })}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ─── Default Provider Selector ──────────────────────────────
function DefaultProviderSelector() {
  const { t } = useTranslation();
  const { data: docusign } = useSignatureProviderSettings('docusign');
  const { data: pandadoc } = useSignatureProviderSettings('pandadoc');
  const save = useSaveSignatureProvider();

  // Read current default from either provider's settings
  const currentDefault = (docusign?.settings_json?.is_default_provider ? 'docusign' : null) 
    || (pandadoc?.settings_json?.is_default_provider ? 'pandadoc' : null)
    || 'manual';

  const handleChange = async (value: string) => {
    // Clear old default, set new one
    if (docusign) {
      await save.mutateAsync({
        integration_type: 'docusign',
        settings_json: { ...docusign.settings_json, is_default_provider: value === 'docusign' },
      });
    }
    if (pandadoc) {
      await save.mutateAsync({
        integration_type: 'pandadoc',
        settings_json: { ...pandadoc.settings_json, is_default_provider: value === 'pandadoc' },
      });
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-medium">
              {t('systemSettings.defaultSignatureProvider', { defaultValue: 'Fornecedor de assinatura padrão' })}
            </Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t('systemSettings.defaultProviderDesc', { defaultValue: 'Usado automaticamente para novos contratos' })}
            </p>
          </div>
          <Select value={currentDefault} onValueChange={handleChange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual" className="text-xs">Manual</SelectItem>
              <SelectItem value="docusign" className="text-xs" disabled={!docusign?.is_enabled}>
                DocuSign {!docusign?.is_enabled && `(${t('common.disabled', 'desativado')})`}
              </SelectItem>
              <SelectItem value="pandadoc" className="text-xs" disabled={!pandadoc?.is_enabled}>
                PandaDoc {!pandadoc?.is_enabled && `(${t('common.disabled', 'desativado')})`}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Export ─────────────────────────────────────────────
export function SignatureProvidersCard() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold">
          {t('systemSettings.signatureProviders', { defaultValue: 'Fornecedores de Assinatura Digital' })}
        </h3>
      </div>
      <DefaultProviderSelector />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DocuSignSettingsCard />
        <PandaDocSettingsCard />
      </div>
    </div>
  );
}
