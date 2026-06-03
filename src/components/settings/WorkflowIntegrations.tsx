import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notify } from "@/lib/notify";
import { Zap, Bell, Slack, ExternalLink, CheckCircle2, Database } from 'lucide-react';
import { TeamsIntegrationCard } from './TeamsIntegrationCard';
import { GlobalGraphApiCard } from './GlobalGraphApiCard';
import { CalendarFeedCard } from './CalendarFeedCard';
import { HubSpotIntegrationCard } from './HubSpotIntegrationCard';

export function WorkflowIntegrations() {
  const { t } = useTranslation();
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testingSlack, setTestingSlack] = useState(false);

  const handleSlackToggle = async (enabled: boolean) => {
    if (enabled && !prefs?.slack_webhook_url && !webhookUrl) {
      notify.error(t('integrations.slackWebhookRequired'));
      return;
    }
    try {
      await updatePrefs.mutateAsync({ 
        slack_enabled: enabled,
        ...(webhookUrl && { slack_webhook_url: webhookUrl })
      });
      notify.success(enabled ? t('integrations.slackEnabled') : t('integrations.slackDisabled'));
    } catch (error: any) {
      notify.error(error.message || t('common.error'));
    }
  };

  const handleSaveWebhook = async () => {
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      notify.error(t('integrations.invalidSlackWebhook'));
      return;
    }
    try {
      await updatePrefs.mutateAsync({ slack_webhook_url: webhookUrl });
      notify.success(t('integrations.webhookSaved'));
    } catch (error: any) {
      notify.error(error.message || t('common.error'));
    }
  };

  const handleTestSlack = async () => {
    const url = webhookUrl || prefs?.slack_webhook_url;
    if (!url) {
      notify.error(t('integrations.slackWebhookRequired'));
      return;
    }
    
    setTestingSlack(true);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          text: '✅ Startup Leiria integration test successful!',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '✅ *Integration Test Successful!*\nYour Slack notifications are now connected to Startup Leiria.'
              }
            }
          ]
        }),
      });
      notify.success(t('integrations.slackTestSent'));
    } catch {
      notify.error(t('integrations.slackTestFailed'));
    } finally {
      setTestingSlack(false);
    }
  };

  const handleMilestoneRemindersToggle = async (enabled: boolean) => {
    try {
      await updatePrefs.mutateAsync({ milestone_reminders_enabled: enabled });
      notify.success(enabled ? t('integrations.remindersEnabled') : t('integrations.remindersDisabled'));
    } catch (error: any) {
      notify.error(error.message || t('common.error'));
    }
  };

  const handleReminderDaysChange = async (days: string) => {
    try {
      await updatePrefs.mutateAsync({ milestone_reminder_days: parseInt(days) });
      notify.success(t('common.success'));
    } catch (error: any) {
      notify.error(error.message || t('common.error'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  const slackEnabled = prefs?.slack_enabled ?? false;
  const milestoneRemindersEnabled = prefs?.milestone_reminders_enabled ?? true;
  const reminderDays = prefs?.milestone_reminder_days ?? 3;
  const hasWebhook = !!(prefs?.slack_webhook_url || webhookUrl);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="microsoft" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="microsoft">Microsoft 365</TabsTrigger>
          <TabsTrigger value="slack">Slack</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="crm">CRM</TabsTrigger>
        </TabsList>

        {/* Microsoft 365 Tab */}
        <TabsContent value="microsoft" className="space-y-4 mt-4">
          <GlobalGraphApiCard />
          <TeamsIntegrationCard canEdit={true} />
        </TabsContent>

        {/* Slack Tab */}
        <TabsContent value="slack" className="space-y-4 mt-4">
          {/* Slack Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Slack className="h-5 w-5" aria-hidden="true" />
                {t('integrations.slackIntegration')}
                {slackEnabled && hasWebhook && (
                  <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {t('integrations.connected')}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{t('integrations.slackDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slack-webhook">{t('integrations.webhookUrl')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="slack-webhook"
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    value={webhookUrl || prefs?.slack_webhook_url || ''}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={handleSaveWebhook} disabled={!webhookUrl}>
                    {t('common.save')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <a 
                    href="https://api.slack.com/messaging/webhooks" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {t('integrations.howToCreateWebhook')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label>{t('integrations.enableSlackNotifications')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('integrations.slackNotificationsDesc')}
                  </p>
                </div>
                <Switch
                  checked={slackEnabled}
                  onCheckedChange={handleSlackToggle}
                  disabled={updatePrefs.isPending || !hasWebhook}
                  aria-label={t('integrations.enableSlackNotifications')}
                />
              </div>

              {hasWebhook && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleTestSlack}
                  disabled={testingSlack}
                >
                  {testingSlack ? t('integrations.sending') : t('integrations.testConnection')}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Milestone Reminders */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" aria-hidden="true" />
                {t('integrations.milestoneReminders')}
              </CardTitle>
              <CardDescription>{t('integrations.milestoneRemindersDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('integrations.enableReminders')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('integrations.remindersNotifyDesc')}
                  </p>
                </div>
                <Switch
                  checked={milestoneRemindersEnabled}
                  onCheckedChange={handleMilestoneRemindersToggle}
                  disabled={updatePrefs.isPending}
                  aria-label={t('integrations.enableReminders')}
                />
              </div>

              {milestoneRemindersEnabled && (
                <div className="space-y-2 pl-6 border-l-2 border-muted">
                  <Label>{t('integrations.reminderTiming')}</Label>
                  <Select 
                    value={reminderDays.toString()} 
                    onValueChange={handleReminderDaysChange}
                    disabled={updatePrefs.isPending}
                  >
                    <SelectTrigger className="w-48" aria-label={t('integrations.reminderTiming')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('integrations.daysBefore', { count: 1 })}</SelectItem>
                      <SelectItem value="3">{t('integrations.daysBefore', { count: 3 })}</SelectItem>
                      <SelectItem value="5">{t('integrations.daysBefore', { count: 5 })}</SelectItem>
                      <SelectItem value="7">{t('integrations.daysBefore', { count: 7 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4 mt-4">
          <CalendarFeedCard />
        </TabsContent>

        {/* CRM Tab */}
        <TabsContent value="crm" className="space-y-4 mt-4">
          <HubSpotIntegrationCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
