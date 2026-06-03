import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { notify } from "@/lib/notify";
import { 
  CheckCircle2, 
  ExternalLink, 
  ChevronDown, 
  Send,
  Bell,
  AlertTriangle,
  Calendar,
  ClipboardList,
  Activity
} from 'lucide-react';
import { useTeamsSettings, useUpdateTeamsSettings, useTestTeamsWebhook } from '@/hooks/useTeamsIntegration';

// Microsoft Teams icon component
const TeamsIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.19 8.77c1.32 0 2.4-1.06 2.4-2.38s-1.08-2.39-2.4-2.39c-.51 0-.98.16-1.37.43.25.52.38 1.1.38 1.71 0 .94-.32 1.8-.86 2.48.39.1.81.15 1.25.15h.6zm-4.12-3.4c0-1.62-1.32-2.93-2.95-2.93s-2.95 1.31-2.95 2.93 1.32 2.93 2.95 2.93 2.95-1.31 2.95-2.93zM5.27 11.53c0-.78.28-1.49.75-2.04H3.3v6.23c0 1.37 1.12 2.48 2.5 2.48.17 0 .33-.02.49-.05v-6.62h-1.02zm11.22-2.04H9.65c-1.38 0-2.5 1.11-2.5 2.48v5.81c0 .87.71 1.58 1.58 1.58H16c.87 0 1.58-.71 1.58-1.58v-7.43c0-.47-.38-.86-.86-.86h-.23zm.41 7.91c0 .31-.25.56-.56.56H9.22c-.31 0-.56-.25-.56-.56v-4.62c0-.31.25-.56.56-.56h7.12c.31 0 .56.25.56.56v4.62zm3.8-8.87c-.34-.15-.71-.24-1.1-.24h-.24c.56.62.9 1.44.9 2.33 0 .34-.05.67-.14.98h.91c.83 0 1.5.67 1.5 1.5v3.42c0 .31-.25.56-.56.56h-2.04v1.02h2.55c.87 0 1.58-.71 1.58-1.58v-5.81c0-1.08-.61-2.02-1.36-2.18z"/>
  </svg>
);

interface TeamsIntegrationCardProps {
  workspaceId?: string;
  programId?: string;
  canEdit: boolean;
}

const EVENT_OPTIONS_KEYS = [
  { key: 'notify_checkin_submitted', icon: ClipboardList, labelKey: 'settings.checkinSubmitted', descKey: 'settings.checkinSubmittedDesc' },
  { key: 'notify_action_assigned', icon: Bell, labelKey: 'settings.actionAssigned', descKey: 'settings.actionAssignedDesc' },
  { key: 'notify_action_overdue', icon: AlertTriangle, labelKey: 'settings.actionOverdue', descKey: 'settings.actionOverdueDesc' },
  { key: 'notify_session_created', icon: Calendar, labelKey: 'settings.sessionCreated', descKey: 'settings.sessionCreatedDesc' },
  { key: 'notify_session_rescheduled', icon: Calendar, labelKey: 'settings.sessionRescheduled', descKey: 'settings.sessionRescheduledDesc' },
  { key: 'notify_health_alert', icon: Activity, labelKey: 'settings.healthAlert', descKey: 'settings.healthAlertDesc' },
] as const;

export function TeamsIntegrationCard({ workspaceId, programId, canEdit }: TeamsIntegrationCardProps) {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useTeamsSettings(workspaceId, programId);
  const updateSettings = useUpdateTeamsSettings(workspaceId, programId);
  const testWebhook = useTestTeamsWebhook();
  
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const currentWebhookUrl = webhookUrl || settings?.webhook_url || '';
  const isEnabled = settings?.enabled ?? false;
  const hasWebhook = !!currentWebhookUrl;

  const handleToggle = async (enabled: boolean) => {
    if (enabled && !hasWebhook) {
      notify.error(t('integrations.pleaseConfigureAWebhookUrl'));
      return;
    }
    try {
      await updateSettings.mutateAsync({ 
        enabled,
        ...(webhookUrl && { webhook_url: webhookUrl })
      });
      notify.success(enabled ? t('integrations.teamsEnabled', 'Teams integration enabled') : t('integrations.teamsDisabled', 'Teams integration disabled'));
    } catch (error: any) {
      notify.error(error.message || t('settings.failedToUpdate', 'Erro ao atualizar'));
    }
  };

  const handleSaveWebhook = async () => {
    if (!webhookUrl) {
      notify.error(t('integrations.pleaseEnterAWebhookUrl'));
      return;
    }
    // Basic validation for Teams webhook URL patterns (Office 365, Power Automate, Azure Logic Apps)
    const validPatterns = [
      'webhook.office.com',
      'logic.azure.com',
      'powerplatform.com',
      'flow.microsoft.com'
    ];
    if (!validPatterns.some(pattern => webhookUrl.includes(pattern))) {
      notify.error(t('integrations.pleaseEnterAValidMicrosoft'));
      return;
    }
    try {
      await updateSettings.mutateAsync({ webhook_url: webhookUrl });
      notify.success(t('integrations.webhookUrlSaved'));
    } catch (error: any) {
      notify.error(error.message || t('settings.failedToSaveWebhook', 'Erro ao guardar webhook'));
    }
  };

  const handleTestWebhook = async () => {
    if (!currentWebhookUrl) {
      notify.error(t('integrations.pleaseSaveAWebhookUrl'));
      return;
    }
    testWebhook.mutate();
  };

  const handleEventToggle = async (eventKey: string, enabled: boolean) => {
    try {
      await updateSettings.mutateAsync({ [eventKey]: enabled });
    } catch (error: any) {
      notify.error(error.message || t('settings.failedToUpdate', 'Erro ao atualizar'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TeamsIcon className="h-5 w-5 text-[#6264A7]" />
          Microsoft Teams
          {isEnabled && hasWebhook && (
            <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('settings.connected', 'Ligado')}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t('settings.teamsDesc', 'Receba notificações no seu canal Teams quando ocorrem eventos importantes. Para configurar, crie um Incoming Webhook no seu canal Teams.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Webhook URL */}
        <div className="space-y-2">
          <Label htmlFor="teams-webhook">{t('settings.webhookUrl')}</Label>
          <div className="flex gap-2">
            <Input
              id="teams-webhook"
              type="url"
              placeholder="https://...webhook.office.com/..."
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
              {t('settings.save')}
            </Button>
          </div>
        </div>

        {/* Setup Instructions */}
        <Collapsible open={showSetup} onOpenChange={setShowSetup}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs p-0 h-auto">
              <ChevronDown className={`h-3 w-3 transition-transform ${showSetup ? 'rotate-180' : ''}`} />
              {t('settings.howToGetWebhook')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
              <div>
                <h4 className="font-medium mb-2">{t('settings.teamsWorkflows', 'Opção 1: Teams Workflows (Recomendado)')}</h4>
                <ol className="list-decimal list-inside text-muted-foreground space-y-1 text-xs">
                  <li>In Teams, go to your channel → ⋯ → Workflows</li>
                  <li>Search for "Post to a channel when a webhook request is received"</li>
                  <li>Configure the workflow and copy the webhook URL</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium mb-2">{t('settings.powerAutomate', 'Opção 2: Power Automate')}</h4>
                <ol className="list-decimal list-inside text-muted-foreground space-y-1 text-xs">
                  <li>Go to <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Power Automate</a></li>
                  <li>Create a new Instant flow with "When an HTTP request is received" trigger</li>
                  <li>Add "Post message in a chat or channel" action</li>
                  <li>Copy the HTTP POST URL from the trigger</li>
                </ol>
              </div>
              <a 
                href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
              >
                Microsoft documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="space-y-0.5">
            <Label>{t('settings.enableTeamsNotifications', 'Ativar notificações do Teams')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.teamsNotificationsDesc', 'Enviar notificações para o canal Teams configurado')}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={updateSettings.isPending || !hasWebhook || !canEdit}
          />
        </div>

        {/* Test Button */}
        {hasWebhook && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleTestWebhook}
            disabled={testWebhook.isPending}
            className="gap-2"
          >
            <Send className="h-3 w-3" />
            {testWebhook.isPending ? t('settings.sending') : t('settings.sendTestMessage')}
          </Button>
        )}

        {/* Event Toggles */}
        {isEnabled && (
          <div className="space-y-3 pt-4 border-t">
            <Label>{t('settings.notificationEvents')}</Label>
            <div className="space-y-2">
              {EVENT_OPTIONS_KEYS.map(({ key, icon: Icon, labelKey, descKey }) => (
                <div key={key} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                  <Checkbox
                    id={key}
                    checked={settings?.[key as keyof typeof settings] as boolean ?? true}
                    onCheckedChange={(checked) => handleEventToggle(key, checked as boolean)}
                    disabled={updateSettings.isPending || !canEdit}
                  />
                  <div className="flex-1 grid gap-0.5">
                    <label htmlFor={key} className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {t(labelKey)}
                    </label>
                    <p className="text-xs text-muted-foreground">{t(descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
