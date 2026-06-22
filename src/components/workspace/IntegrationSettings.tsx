import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Mail, 
  Video, 
  Copy, 
  Check, 
  ChevronDown,
  ExternalLink,
  Info
} from 'lucide-react';
import { notify } from "@/lib/notify";
import { WorkspaceCalendarCard } from '@/components/settings/WorkspaceCalendarCard';

interface IntegrationSettingsProps {
  workspaceId: string;
  emailAlias?: string;
  canEdit: boolean;
}

export function IntegrationSettings({ workspaceId, emailAlias, canEdit }: IntegrationSettingsProps) {
  const { t } = useTranslation();
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [showMeetingGuide, setShowMeetingGuide] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  // Webhook URL without workspace_id in query string - ID should be in POST body for security
  const meetingWebhookUrl = `${supabaseUrl}/functions/v1/webhook-meeting-ingest`;
  const displayEmailAlias = emailAlias || `workspace-${workspaceId.slice(0, 8)}@capture.startupleiria.com`;

  const copyToClipboard = async (text: string, type: 'email' | 'webhook') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'email') {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      } else {
        setCopiedWebhook(true);
        setTimeout(() => setCopiedWebhook(false), 2000);
      }
      notify.success(t('integrations.copied'));
    } catch (err) {
      notify.error(t('integrations.copyFailed'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendar Sync - Simple email-only config */}
      <WorkspaceCalendarCard workspaceId={workspaceId} canEdit={canEdit} />

      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {t('integrations.title')}
        </CardTitle>
        <CardDescription>{t('integrations.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Forwarding */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {t('integrations.emailForwarding')}
            </Label>
            <Badge variant="outline">{t('integrations.recommended')}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('integrations.emailDescription')}
          </p>
          <div className="flex gap-2">
            <Input 
              value={displayEmailAlias} 
              readOnly 
              className="font-mono text-sm bg-muted"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(displayEmailAlias, 'email')}
             aria-label={t('common.confirm')}>
              {copiedEmail ? (
                <Check className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            {t('integrations.emailHint')}
          </p>
        </div>

        {/* Meeting Webhook */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              {t('integrations.meetingWebhook')}
            </Label>
            <Badge variant="secondary">{t('integrations.advanced')}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('integrations.meetingDescription')}
          </p>
          <div className="flex gap-2">
            <Input 
              value={meetingWebhookUrl} 
              readOnly 
              className="font-mono text-xs bg-muted"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(meetingWebhookUrl, 'webhook')}
             aria-label={t('common.confirm')}>
              {copiedWebhook ? (
                <Check className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Collapsible Guide */}
          <Collapsible open={showMeetingGuide} onOpenChange={setShowMeetingGuide}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                <ChevronDown className={`h-3 w-3 transition-transform ${showMeetingGuide ? 'rotate-180' : ''}`} />
                {t('integrations.howToUse')}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4 text-sm">
                <div>
                  <h4 className="font-medium mb-2">{t('integrations.microsoftTeams')}</h4>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-1 text-xs">
                    <li>{t('integrations.teamsStep1')}</li>
                    <li>{t('integrations.teamsStep2')}</li>
                    <li>{t('integrations.teamsStep3')}</li>
                  </ol>
                </div>
                <div>
                  <h4 className="font-medium mb-2">{t('integrations.zoomMeet')}</h4>
                  <p className="text-muted-foreground text-xs">
                    {t('integrations.zoomMeetNote')}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">{t('integrations.testPayload')}</h4>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
{`{
  "workspace_id": "${workspaceId}",
  "meeting_title": "Session with Startup X",
  "start_time": "2026-01-03T10:00:00Z",
  "end_time": "2026-01-03T11:00:00Z",
  "participants": ["founder@startup.com"],
  "transcript_text": "Discussion notes...",
  "summary": "Key takeaways..."
}`}
                  </pre>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}