import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Settings2,
  Zap,
  Mail,
  Copy,
  Info,
} from 'lucide-react';
import { notify } from '@/lib/notify';

// Microsoft Teams icon
const TeamsIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.19 8.77c1.32 0 2.4-1.06 2.4-2.38s-1.08-2.39-2.4-2.39c-.51 0-.98.16-1.37.43.25.52.38 1.1.38 1.71 0 .94-.32 1.8-.86 2.48.39.1.81.15 1.25.15h.6zm-4.12-3.4c0-1.62-1.32-2.93-2.95-2.93s-2.95 1.31-2.95 2.93 1.32 2.93 2.95 2.93 2.95-1.31 2.95-2.93zM5.27 11.53c0-.78.28-1.49.75-2.04H3.3v6.23c0 1.37 1.12 2.48 2.5 2.48.17 0 .33-.02.49-.05v-6.62h-1.02zm11.22-2.04H9.65c-1.38 0-2.5 1.11-2.5 2.48v5.81c0 .87.71 1.58 1.58 1.58H16c.87 0 1.58-.71 1.58-1.58v-7.43c0-.47-.38-.86-.86-.86h-.23zm.41 7.91c0 .31-.25.56-.56.56H9.22c-.31 0-.56-.25-.56-.56v-4.62c0-.31.25-.56.56-.56h7.12c.31 0 .56.25.56.56v4.62zm3.8-8.87c-.34-.15-.71-.24-1.1-.24h-.24c.56.62.9 1.44.9 2.33 0 .34-.05.67-.14.98h.91c.83 0 1.5.67 1.5 1.5v3.42c0 .31-.25.56-.56.56h-2.04v1.02h2.55c.87 0 1.58-.71 1.58-1.58v-5.81c0-1.08-.61-2.02-1.36-2.18z"/>
  </svg>
);

// Outlook icon
const OutlookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.88 12.04c0 .78-.29 1.47-.88 2.06-.59.59-1.28.88-2.06.88s-1.47-.29-2.06-.88c-.59-.59-.88-1.28-.88-2.06s.29-1.47.88-2.06c.59-.59 1.28-.88 2.06-.88s1.47.29 2.06.88c.59.59.88 1.28.88 2.06zM24 12v9.38c0 .46-.17.85-.5 1.18-.33.33-.72.5-1.18.5H8.32c-.46 0-.85-.17-1.18-.5-.33-.33-.5-.72-.5-1.18V14.5l7.5-5.25c.5-.35 1.04-.35 1.54 0L24 14.5V12zm0-2.62l-7.5-5.25c-.5-.35-1.04-.35-1.54 0L7.46 9.38V2.62c0-.46.17-.85.5-1.18.33-.33.72-.5 1.18-.5h13.68c.46 0 .85.17 1.18.5.33.33.5.72.5 1.18v6.76z"/>
  </svg>
);

const TEAMS_SCHEMA = `{
  "type": "object",
  "properties": {
    "type": { "type": "string" },
    "attachments": { "type": "array" }
  }
}`;

const OUTLOOK_RESPONSE = `{
  "event_id": "@{body('Create_event_(V4)')?['id']}",
  "teams_url": "@{body('Create_event_(V4)')?['onlineMeetingUrl']}"
}`;

const EMAIL_BODY = `{
  "alias": "startup-{workspace-id}",
  "from": "@{triggerOutputs()?['body/from']}",
  "subject": "@{triggerOutputs()?['body/subject']}",
  "body_text": "@{triggerOutputs()?['body/body']}"
}`;

type KV = { k: string; v: string };

export default function IntegrationsSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const arr = <T,>(key: string): T[] =>
    (t(key, { returnObjects: true }) as unknown as T[]) ?? [];

  const teamsOption1Steps = arr<string>('integrationsSetup.teams.option1Steps');
  const teamsOption2Steps = arr<string>('integrationsSetup.teams.option2Steps');
  const teamsNotifTypes = arr<KV>('integrationsSetup.teams.notifTypes');
  const outlookPaSteps = arr<string>('integrationsSetup.outlook.paSteps');
  const outlookEventFields = arr<string>('integrationsSetup.outlook.eventFields');
  const outlookPaSteps2 = arr<string>('integrationsSetup.outlook.paSteps2');
  const emailForwardSteps = arr<string>('integrationsSetup.email.forwardSteps');
  const emailTags = arr<KV>('integrationsSetup.email.tags');
  const ssoAzureSteps1 = arr<string>('integrationsSetup.sso.azureSteps1');
  const ssoConfigureFields = arr<string>('integrationsSetup.sso.configureFields');
  const ssoAzureSteps2 = arr<string>('integrationsSetup.sso.azureSteps2');
  const ssoApiPermsList = arr<string>('integrationsSetup.sso.apiPermsList');
  const ssoAzureSteps3 = arr<string>('integrationsSetup.sso.azureSteps3');
  const ssoBackendSteps = arr<string>('integrationsSetup.sso.backendSteps');

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(t('integrationsSetup.copied'));
    } catch {
      notify.error(t('integrationsSetup.copyError'));
    }
  };

  return (
    <AppLayout title={t('integrationsSetup.title')}>
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('integrationsSetup.back')}
        </Button>
      </div>

      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('integrationsSetup.title')}</h1>
          <p className="text-muted-foreground mt-2">{t('integrationsSetup.intro')}</p>
        </div>

        <Tabs defaultValue="teams" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="teams" className="gap-2">
              <TeamsIcon className="h-4 w-4" />
              {t('integrationsSetup.tabs.teams')}
            </TabsTrigger>
            <TabsTrigger value="outlook" className="gap-2">
              <OutlookIcon className="h-4 w-4" />
              {t('integrationsSetup.tabs.outlook')}
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              {t('integrationsSetup.tabs.email')}
            </TabsTrigger>
            <TabsTrigger value="sso" className="gap-2">
              <Settings2 className="h-4 w-4" />
              {t('integrationsSetup.tabs.sso')}
            </TabsTrigger>
          </TabsList>

          {/* Teams Integration */}
          <TabsContent value="teams" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TeamsIcon className="h-6 w-6 text-[#6264A7]" />
                  {t('integrationsSetup.teams.title')}
                </CardTitle>
                <CardDescription>{t('integrationsSetup.teams.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertTitle>{t('integrationsSetup.teams.benefitsTitle')}</AlertTitle>
                  <AlertDescription>{t('integrationsSetup.teams.benefits')}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t('integrationsSetup.teams.option1')}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {teamsOption1Steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t('integrationsSetup.teams.option2')}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {teamsOption2Steps.map((s, i) => (
                      <li key={i}>
                        {i === 0 ? (
                          <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            Power Automate <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : s}
                      </li>
                    ))}
                  </ol>

                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">{t('integrationsSetup.teams.schemaLabel')}</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">{TEAMS_SCHEMA}</pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 gap-1"
                      onClick={() => copyToClipboard(TEAMS_SCHEMA)}
                    >
                      <Copy className="h-3 w-3" /> {t('integrationsSetup.copy')}
                    </Button>
                  </div>
                </div>

                <Alert variant="default">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>{t('integrationsSetup.teams.notifTypesTitle')}</AlertTitle>
                  <AlertDescription className="mt-2">
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {teamsNotifTypes.map((n, i) => (
                        <li key={i}><strong>{n.k}</strong> {n.v}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Outlook Integration */}
          <TabsContent value="outlook" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <OutlookIcon className="h-6 w-6 text-[#0078D4]" />
                  {t('integrationsSetup.outlook.title')}
                </CardTitle>
                <CardDescription>{t('integrationsSetup.outlook.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertTitle>{t('integrationsSetup.outlook.benefitsTitle')}</AlertTitle>
                  <AlertDescription>{t('integrationsSetup.outlook.benefits')}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t('integrationsSetup.outlook.pa')}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {outlookPaSteps.map((s, i) => (
                      <li key={i}>
                        {i === 0 ? (
                          <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            Power Automate <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : s}
                      </li>
                    ))}
                    <li>
                      {t('integrationsSetup.outlook.eventConfig')}
                      <ul className="list-disc list-inside ml-4 mt-2 text-muted-foreground">
                        {outlookEventFields.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </li>
                    {outlookPaSteps2.map((s, i) => (
                      <li key={`p2-${i}`}>{s}</li>
                    ))}
                  </ol>

                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">{t('integrationsSetup.outlook.responseLabel')}</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">{OUTLOOK_RESPONSE}</pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 gap-1"
                      onClick={() => copyToClipboard(OUTLOOK_RESPONSE)}
                    >
                      <Copy className="h-3 w-3" /> {t('integrationsSetup.copy')}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t('integrationsSetup.outlook.graphTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{t('integrationsSetup.outlook.graphIntro')}</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground">
                    <li>Calendars.ReadWrite</li>
                    <li>OnlineMeetings.ReadWrite</li>
                  </ul>
                  <Badge variant="secondary">{t('integrationsSetup.outlook.comingSoon')}</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Integration */}
          <TabsContent value="email" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-6 w-6" />
                  {t('integrationsSetup.email.title')}
                </CardTitle>
                <CardDescription>{t('integrationsSetup.email.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{t('integrationsSetup.email.howTitle')}</AlertTitle>
                  <AlertDescription>{t('integrationsSetup.email.how')}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t('integrationsSetup.email.forwardTitle')}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {emailForwardSteps.map((s, i) => (
                      <li key={i}>
                        {i === 1 ? (
                          <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            Power Automate <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : s}
                      </li>
                    ))}
                  </ol>

                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">{t('integrationsSetup.email.httpLabel')}</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">{EMAIL_BODY}</pre>
                  </div>

                  <Alert variant="default">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('integrationsSetup.email.tagsTitle')}</AlertTitle>
                    <AlertDescription className="text-sm">
                      {t('integrationsSetup.email.tagsIntro')}
                      <ul className="list-disc list-inside mt-2">
                        {emailTags.map((tg, i) => (
                          <li key={i}><code>{tg.k}</code> — {tg.v}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SSO Integration */}
          <TabsContent value="sso" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-6 w-6" />
                  {t('integrationsSetup.sso.title')}
                </CardTitle>
                <CardDescription>{t('integrationsSetup.sso.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Badge variant="secondary" className="mb-4">{t('integrationsSetup.sso.setupRequired')}</Badge>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{t('integrationsSetup.sso.preTitle')}</AlertTitle>
                  <AlertDescription>{t('integrationsSetup.sso.pre')}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t('integrationsSetup.sso.azureTitle')}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    <li>
                      <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {ssoAzureSteps1[0]} <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>{ssoAzureSteps1[1]}</li>
                    <li>
                      {t('integrationsSetup.sso.configure')}
                      <ul className="list-disc list-inside ml-4 mt-2 text-muted-foreground">
                        {ssoConfigureFields.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </li>
                    {ssoAzureSteps2.map((s, i) => (
                      <li key={`a2-${i}`}>{s}</li>
                    ))}
                    <li>
                      {t('integrationsSetup.sso.apiPerms')}
                      <ul className="list-disc list-inside ml-4 mt-2 text-muted-foreground">
                        {ssoApiPermsList.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </li>
                    {ssoAzureSteps3.map((s, i) => (
                      <li key={`a3-${i}`}>{s}</li>
                    ))}
                  </ol>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{t('integrationsSetup.sso.backendTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{t('integrationsSetup.sso.backendIntro')}</p>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {ssoBackendSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>

                <Alert variant="default">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>{t('integrationsSetup.sso.experienceTitle')}</AlertTitle>
                  <AlertDescription>{t('integrationsSetup.sso.experience')}</AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>{t('integrationsSetup.resources')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center">
                <Zap className="h-8 w-8 mb-2 text-[#0066FF]" />
                <span className="text-sm font-medium">Power Automate</span>
              </a>
              <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center">
                <Settings2 className="h-8 w-8 mb-2 text-[#0078D4]" />
                <span className="text-sm font-medium">Azure Portal</span>
              </a>
              <a href="https://admin.microsoft.com" target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center">
                <Mail className="h-8 w-8 mb-2 text-[#0078D4]" />
                <span className="text-sm font-medium">Microsoft 365 Admin</span>
              </a>
              <a href="https://learn.microsoft.com/en-us/graph/overview" target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center">
                <ExternalLink className="h-8 w-8 mb-2 text-muted-foreground" />
                <span className="text-sm font-medium">Graph API Docs</span>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
