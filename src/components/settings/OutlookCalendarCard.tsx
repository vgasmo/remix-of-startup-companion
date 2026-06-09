import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { notify } from "@/lib/notify";
import { 
  CheckCircle2, 
  ExternalLink, 
  ChevronDown, 
  Calendar,
  Info,
  Settings2
} from 'lucide-react';
import { useGraphConfigStatus } from '@/hooks/useGraphConfigStatus';
import { useOutlookSettings, useUpdateOutlookSettings } from '@/hooks/useOutlookCalendar';

// Outlook icon component
const OutlookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.88 12.04c0 .78-.29 1.47-.88 2.06-.59.59-1.28.88-2.06.88s-1.47-.29-2.06-.88c-.59-.59-.88-1.28-.88-2.06s.29-1.47.88-2.06c.59-.59 1.28-.88 2.06-.88s1.47.29 2.06.88c.59.59.88 1.28.88 2.06zM24 12v9.38c0 .46-.17.85-.5 1.18-.33.33-.72.5-1.18.5H8.32c-.46 0-.85-.17-1.18-.5-.33-.33-.5-.72-.5-1.18V14.5l7.5-5.25c.5-.35 1.04-.35 1.54 0L24 14.5V12zm0-2.62l-7.5-5.25c-.5-.35-1.04-.35-1.54 0L7.46 9.38V2.62c0-.46.17-.85.5-1.18.33-.33.72-.5 1.18-.5h13.68c.46 0 .85.17 1.18.5.33.33.5.72.5 1.18v6.76z"/>
  </svg>
);

interface OutlookCalendarCardProps {
  workspaceId?: string;
  canEdit?: boolean;
}

export function OutlookCalendarCard({ workspaceId, canEdit = true }: OutlookCalendarCardProps) {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useOutlookSettings(workspaceId || '');
  const updateSettings = useUpdateOutlookSettings(workspaceId || '');
  const { data: graphSecretConfigured, isLoading: graphStatusLoading } = useGraphConfigStatus();
  
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const currentWebhookUrl = webhookUrl || settings?.webhook_url || '';
  const isEnabled = settings?.enabled ?? false;
  const syncMode = settings?.sync_mode ?? 'webhook';
  const hasWebhook = !!currentWebhookUrl;
  const graphAvailable = !!graphSecretConfigured;

  const handleToggle = async (enabled: boolean) => {
    if (enabled && syncMode === 'webhook' && !hasWebhook) {
      notify.error(t('integrations.pleaseConfigureAWebhookUrl'));
      return;
    }
    try {
      await updateSettings.mutateAsync({ 
        enabled,
        ...(webhookUrl && { webhook_url: webhookUrl })
      });
      notify.success(enabled ? t('settings.outlookSyncEnabled', 'Sincronização Outlook ativada') : t('settings.outlookSyncDisabled', 'Sincronização Outlook desativada'));
    } catch (error: any) {
      notify.error(error.message || t('settings.failedToUpdate', 'Erro ao atualizar'));
    }
  };

  const handleSaveWebhook = async () => {
    if (!webhookUrl) {
      notify.error(t('integrations.pleaseEnterAWebhookUrl'));
      return;
    }
    try {
      await updateSettings.mutateAsync({ webhook_url: webhookUrl, sync_mode: 'webhook' });
      notify.success(t('integrations.webhookUrlSaved'));
    } catch (error: any) {
      notify.error(error.message || t('settings.failedToSaveWebhook', 'Erro ao guardar webhook'));
    }
  };

  const handleModeChange = async (mode: string) => {
    try {
      await updateSettings.mutateAsync({ sync_mode: mode as 'webhook' | 'graph' });
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

  // Admin view (no workspaceId) - show reference only
  const isAdminView = !workspaceId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <OutlookIcon className="h-5 w-5 text-[#0078D4]" />
          Outlook Calendar
          {isEnabled && (
            <Badge variant="outline" className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {syncMode === 'webhook' ? 'Webhook' : 'Graph API'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t('settings.outlookDesc', 'Cria automaticamente eventos Outlook com links Teams para sessões')}
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

        {/* Sync Mode Selection */}
        <div className="space-y-3">
          <Label>{t('settings.syncMethod', 'Método de sincronização')}</Label>
          <RadioGroup 
            value={syncMode} 
            onValueChange={handleModeChange}
            className="grid grid-cols-2 gap-4"
            disabled={!canEdit}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="webhook" id="webhook" />
              <Label htmlFor="webhook" className="flex flex-col cursor-pointer">
                <span className="font-medium">{t('settings.powerAutomateWebhook', 'Power Automate Webhook')}</span>
                <span className="text-xs text-muted-foreground">{t('settings.recommendedEasy', 'Recomendado - Configuração fácil')}</span>
              </Label>
            </div>
            {graphAvailable ? (
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="graph" id="graph" disabled={!canEdit} />
                <Label htmlFor="graph" className="flex flex-col cursor-pointer">
                  <span className="font-medium">{t('settings.graphApi', 'Microsoft Graph API')}</span>
                  <span className="text-xs text-muted-foreground">{t('settings.directIntegration', 'Integração direta')}</span>
                </Label>
              </div>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center space-x-2 opacity-50 cursor-not-allowed">
                      <RadioGroupItem value="graph" id="graph" disabled />
                      <Label htmlFor="graph" className="flex flex-col pointer-events-none">
                        <span className="font-medium">{t('settings.graphApi', 'Microsoft Graph API')}</span>
                        <span className="text-xs text-muted-foreground">{t('settings.notConfigured', 'Não configurado')}</span>
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('settings.askAdminGraphSecret', 'Peça ao administrador para configurar o MS_GRAPH_CLIENT_SECRET')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </RadioGroup>
        </div>

        {/* Webhook Configuration */}
        {syncMode === 'webhook' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="outlook-webhook">Power Automate Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="outlook-webhook"
                  type="url"
                  placeholder="https://...logic.azure.com/..."
                  value={webhookUrl || settings?.webhook_url || ''}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="flex-1 font-mono text-sm"
                  disabled={!canEdit}
                />
                <Button 
                  variant="outline" 
                  onClick={handleSaveWebhook} 
                  disabled={!webhookUrl || updateSettings.isPending || !canEdit}
                >
                  {t('common.save', 'Guardar')}
                </Button>
              </div>
            </div>

            {/* Setup Instructions */}
            <Collapsible open={showSetup} onOpenChange={setShowSetup}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-xs p-0 h-auto">
                  <ChevronDown className={`h-3 w-3 transition-transform ${showSetup ? 'rotate-180' : ''}`} />
                  {t('settings.howToSetupPowerAutomate', 'Como configurar Power Automate')}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
                  <h4 className="font-medium">Create a Power Automate Flow:</h4>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-2 text-xs">
                    <li>Go to <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Power Automate</a></li>
                    <li>Create new → Instant cloud flow → "When an HTTP request is received"</li>
                    <li>Add action: "Create event (V4)" from Office 365 Outlook</li>
                    <li>Configure:
                      <ul className="list-disc list-inside ml-4 mt-1">
                        <li>Calendar: Your calendar</li>
                        <li>Subject: Use dynamic content <code className="bg-muted px-1 rounded">title</code></li>
                        <li>Start time: <code className="bg-muted px-1 rounded">start</code></li>
                        <li>End time: <code className="bg-muted px-1 rounded">end</code></li>
                        <li>Is online meeting: Yes</li>
                      </ul>
                    </li>
                    <li>Add "Response" action to return the event ID and Teams URL</li>
                    <li>Copy the HTTP POST URL from the trigger</li>
                  </ol>
                  <Alert className="mt-3">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      When "Is online meeting" is enabled, Outlook automatically creates a Teams meeting link.
                    </AlertDescription>
                  </Alert>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {/* Graph API Configuration (placeholder) */}
        {syncMode === 'graph' && (
          <Alert>
            <Settings2 className="h-4 w-4" />
            <AlertDescription>
              Direct Microsoft Graph integration requires Azure AD app registration. 
              This feature is coming soon. Please use the Power Automate webhook method for now.
            </AlertDescription>
          </Alert>
        )}

        {/* Enable Toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="space-y-0.5">
            <Label>{t('settings.enableAutoCalendar', 'Ativar sincronização automática do calendário')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.createOutlookOnSchedule', 'Criar eventos Outlook quando sessões são agendadas')}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={updateSettings.isPending || (syncMode === 'webhook' && !hasWebhook) || !canEdit}
          />
        </div>

        {/* Features info */}
        {isEnabled && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="font-medium text-foreground">{t('settings.whenEnabled', 'Quando ativado:')}</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>{t('settings.newSessionsCreate', 'Novas sessões criam automaticamente eventos Outlook')}</li>
              <li>{t('settings.eventsIncludeTeams', 'Eventos incluem links Teams para reuniões online')}</li>
              <li>{t('settings.rescheduledUpdate', 'Sessões reagendadas atualizam o evento')}</li>
              <li>{t('settings.cancelledRemove', 'Sessões canceladas removem o evento')}</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
