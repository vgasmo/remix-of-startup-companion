import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { notify } from "@/lib/notify";
import { 
  CheckCircle2, 
  ExternalLink, 
  ChevronDown, 
  Shield,
  Info,
  Video,
  Calendar,
  Users,
  Link2
} from 'lucide-react';
import { useOutlookSettings, useUpdateOutlookSettings } from '@/hooks/useOutlookCalendar';

interface GraphApiCalendarCardProps {
  workspaceId?: string;
  canEdit?: boolean;
}

/**
 * Graph API Calendar Card
 * 
 * SECURITY: Client secrets are NEVER entered or stored via this UI.
 * They must be configured server-side as environment variables (MS_GRAPH_CLIENT_SECRET).
 * Only non-sensitive identifiers (tenant_id, client_id) are managed here.
 */
export function GraphApiCalendarCard({ workspaceId, canEdit = true }: GraphApiCalendarCardProps) {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useOutlookSettings(workspaceId || '');
  const updateSettings = useUpdateOutlookSettings(workspaceId || '');
  
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isConfigured = !!(settings?.graph_tenant_id && settings?.graph_client_id);
  const isGraphMode = settings?.sync_mode === 'graph';
  const isEnabled = settings?.enabled && isGraphMode;

  const handleSaveCredentials = async () => {
    if (!tenantId || !clientId) {
      notify.error(t('settings.tenantIdAndClientId'));
      return;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      notify.error(t('settings.invalidTenantIdFormatShould'));
      return;
    }
    if (!uuidRegex.test(clientId)) {
      notify.error(t('settings.invalidClientIdFormatShould'));
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings.mutateAsync({
        graph_tenant_id: tenantId,
        graph_client_id: clientId,
        sync_mode: 'graph',
      });
      notify.success(t('settings.azureAdIdentifiersSaved'));
    } catch (error: any) {
      notify.error(error.message || 'Failed to save identifiers');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (enabled && !isConfigured) {
      notify.error(t('settings.pleaseConfigureAzureAdIdentifiers'));
      return;
    }
    try {
      await updateSettings.mutateAsync({ 
        enabled,
        sync_mode: 'graph',
      });
      notify.success(enabled ? t('settings.graphSyncEnabled', 'Sincronização Graph API ativada') : t('settings.graphSyncDisabled', 'Sincronização Graph API desativada'));
    } catch (error: any) {
      notify.error(error.message || t('settings.failedToUpdate', 'Erro ao atualizar'));
    }
  };

  if (isLoading && workspaceId) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const isAdminView = !workspaceId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#0078D4]" />
          Microsoft Graph API
          {isEnabled && isConfigured && (
            <Badge variant="outline" className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('settings.connected', 'Ligado')}
            </Badge>
          )}
          {isConfigured && !isEnabled && (
            <Badge variant="outline">{t('settings.configured', 'Configurado')}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t('settings.graphApiDesc', 'Integração direta com Microsoft Graph para eventos de calendário e reuniões Teams')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdminView && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t('settings.graphPerWorkspace', 'Configurado por workspace em Definições → Integrações. Abaixo estão as instruções de referência.')}
            </AlertDescription>
          </Alert>
        )}

        {/* Features */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 text-[#0078D4]" />
            <span>{t('settings.outlookEvents', 'Eventos Outlook')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Video className="h-4 w-4 text-[#6264A7]" />
            <span>{t('settings.teamsMeetings', 'Reuniões Teams')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{t('settings.inviteAttendees', 'Convidar participantes')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span>{t('settings.autoJoinUrl', 'URL de adesão automática')}</span>
          </div>
        </div>

        {/* Azure AD Identifiers (NO secrets) */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[hsl(var(--warning))]" />
            <Label className="font-medium">{t('settings.azureAdAppRegistration', 'Registo de App Azure AD')}</Label>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tenant-id" className="text-xs">Tenant ID (Directory ID)</Label>
            <Input
              id="tenant-id"
              type="text"
              placeholder={settings?.graph_tenant_id || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="font-mono text-xs"
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-id" className="text-xs">Application (Client) ID</Label>
            <Input
              id="client-id"
              type="text"
              placeholder={settings?.graph_client_id || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono text-xs"
              disabled={!canEdit}
            />
          </div>

          {/* Security notice about client secret */}
          <Alert className="bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30">
            <Shield className="h-4 w-4 text-[hsl(var(--warning))]" />
            <AlertDescription className="text-xs text-[hsl(var(--warning))]">
              <strong>Client Secret</strong> {t('settings.clientSecretNote', 'é configurado server-side como variável de ambiente (MS_GRAPH_CLIENT_SECRET) e nunca é armazenado na base de dados. Contacte o administrador para configurar.')}
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleSaveCredentials}
            disabled={(!tenantId || !clientId) || isSaving || !canEdit}
            size="sm"
            className="w-full"
          >
            {isSaving ? t('common.saving', 'A guardar...') : isConfigured ? t('settings.updateIdentifiers', 'Atualizar Identificadores') : t('settings.saveIdentifiers', 'Guardar Identificadores')}
          </Button>
        </div>

        {/* Setup Instructions */}
        <Collapsible open={showSetup} onOpenChange={setShowSetup}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs p-0 h-auto">
              <ChevronDown className={`h-3 w-3 transition-transform ${showSetup ? 'rotate-180' : ''}`} />
              {t('settings.howToSetupAzure', 'Como configurar App Azure AD')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
              <h4 className="font-medium">Create Azure AD App Registration:</h4>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 text-xs">
                <li>Go to <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Azure Portal → App Registrations <ExternalLink className="h-3 w-3 inline" /></a></li>
                <li>Click "New registration"</li>
                <li>Name: "Startup Leiria Calendar Sync"</li>
                <li>Supported account types: "Single tenant" or "Multi-tenant"</li>
                <li>Click "Register"</li>
              </ol>
              
              <h4 className="font-medium pt-2">Configure API Permissions:</h4>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 text-xs">
                <li>Go to "API Permissions" → "Add a permission"</li>
                <li>Select "Microsoft Graph" → "Application permissions"</li>
                <li>Add these permissions:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li><code className="bg-muted px-1 rounded">Calendars.ReadWrite</code></li>
                    <li><code className="bg-muted px-1 rounded">OnlineMeetings.ReadWrite.All</code></li>
                    <li><code className="bg-muted px-1 rounded">User.Read.All</code></li>
                  </ul>
                </li>
                <li>Click "Grant admin consent" (requires admin)</li>
              </ol>

              <h4 className="font-medium pt-2">Configure Client Secret:</h4>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 text-xs">
                <li>Go to "Certificates & secrets"</li>
                <li>Click "New client secret"</li>
                <li>Copy the secret value</li>
                <li><strong>Important:</strong> Provide this secret to your system administrator to configure as the <code className="bg-muted px-1 rounded">MS_GRAPH_CLIENT_SECRET</code> environment variable</li>
              </ol>

              <Alert className="mt-3">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  For app-only access to create meetings on behalf of users, you'll also need to configure an 
                  <a href="https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">
                    Application Access Policy <ExternalLink className="h-3 w-3 inline" />
                  </a>
                </AlertDescription>
              </Alert>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="space-y-0.5">
            <Label>{t('settings.enableGraphSync', 'Ativar sincronização Graph API')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.graphSyncDesc', 'Criar eventos de calendário e reuniões Teams via Graph API')}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={updateSettings.isPending || !isConfigured || !canEdit}
          />
        </div>

        {/* What this unlocks */}
        {isEnabled && isConfigured && (
          <div className="text-xs text-muted-foreground bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30 rounded-lg p-3 space-y-1">
            <p className="font-medium text-[hsl(var(--success))]">🎉 {t('settings.integrationActive', 'Integração ativa!')}</p>
            <p>{t('settings.whenScheduleSession', 'Quando agenda uma sessão, o sistema vai automaticamente:')}</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>{t('settings.createOutlookEvent', 'Criar um evento Outlook')}</li>
              <li>{t('settings.generateTeamsLink', 'Gerar um link de reunião Teams')}</li>
              <li>{t('settings.inviteMentorsFounders', 'Convidar mentores e founders')}</li>
              <li>{t('settings.saveJoinUrl', 'Guardar o URL de adesão no registo da sessão')}</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
