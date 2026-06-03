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
  Video,
  Copy,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

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

// Bilingual content table — keeps this technical guide out of the global i18n bundle
// while honoring the project's PT/EN parity rule.
const CONTENT = {
  pt: {
    back: 'Voltar',
    title: 'Guia de Configuração de Integrações',
    intro: 'Conecte o Startup Leiria ao seu ambiente Microsoft 365 para notificações e sincronização de calendário sem atritos.',
    tabs: { teams: 'Teams', outlook: 'Outlook', email: 'Email', sso: 'SSO' },
    teams: {
      title: 'Notificações Microsoft Teams',
      description: 'Receba notificações em tempo real no seu canal de Teams',
      benefitsTitle: 'O que vai obter',
      benefits: 'Mensagens automáticas no Teams quando: check-ins são submetidos, ações são atribuídas ou ficam em atraso, sessões são agendadas, e alertas de saúde são despoletados.',
      option1: 'Opção 1: Teams Workflows (mais fácil)',
      option1Steps: [
        'Abrir o Microsoft Teams e navegar até ao canal alvo',
        'Clicar no menu ⋯ → Workflows',
        'Procurar por "Post to a channel when a webhook request is received"',
        'Configurar o workflow e copiar o URL do webhook gerado',
        'Colar o URL em Definições → Integrações → Microsoft Teams',
      ],
      option2: 'Opção 2: Fluxo Power Automate',
      option2Steps: [
        'Aceder ao Power Automate',
        'Criar novo → Fluxo de nuvem instantâneo',
        'Adicionar gatilho: "When an HTTP request is received"',
        'Adicionar ação: "Post message in a chat or channel" (Microsoft Teams)',
        'Configurar a mensagem para usar conteúdo dinâmico do corpo do pedido',
        'Guardar e copiar o URL HTTP POST',
      ],
      schemaLabel: 'Esquema do corpo do pedido (colar no Power Automate):',
      notifTypesTitle: 'Tipos de notificação',
      notifTypes: [
        { k: 'Check-in submetido:', v: 'quando uma startup completa o check-in mensal' },
        { k: 'Ação atribuída:', v: 'quando uma nova ação é atribuída a alguém' },
        { k: 'Ação em atraso:', v: 'lembrete diário para ações em atraso' },
        { k: 'Sessão criada:', v: 'quando uma nova sessão/reunião é agendada' },
        { k: 'Alerta de saúde:', v: 'quando o health score de uma startup cai significativamente' },
      ],
    },
    outlook: {
      title: 'Sincronização com Calendário Outlook',
      description: 'Cria automaticamente eventos no Outlook com link de reunião Teams',
      benefitsTitle: 'O que vai obter',
      benefits: 'Quando são criadas sessões no Startup Leiria, são automaticamente adicionadas ao Outlook com um link de reunião Teams. Atualizações e cancelamentos sincronizam automaticamente.',
      pa: 'Configuração Power Automate (recomendado)',
      paSteps: [
        'Aceder ao Power Automate',
        'Criar novo → Fluxo de nuvem instantâneo',
        'Adicionar gatilho: "When an HTTP request is received"',
        'Adicionar ação: "Create event (V4)" do Office 365 Outlook',
      ],
      eventConfig: 'Configurar o evento:',
      eventFields: [
        'Calendário: o seu calendário ou um calendário partilhado',
        'Assunto: @{triggerBody()[\'title\']}',
        'Início: @{triggerBody()[\'start\']}',
        'Fim: @{triggerBody()[\'end\']}',
        'É reunião online: Sim',
      ],
      paSteps2: [
        'Adicionar ação: "Response" para devolver o ID do evento e o URL Teams',
        'Guardar e copiar o URL HTTP POST',
      ],
      responseLabel: 'Corpo da resposta (na ação Response):',
      graphTitle: 'Microsoft Graph API direto (em breve)',
      graphIntro: 'Para uma experiência totalmente integrada, estamos a trabalhar na integração direta com Microsoft Graph. Isto vai requerer registo de aplicação no Azure AD com as seguintes permissões:',
      comingSoon: 'Disponível na Fase 2',
    },
    email: {
      title: 'Ingestão de Email',
      description: 'Captura automaticamente emails do Outlook para as comunicações do workspace',
      howTitle: 'Como funciona',
      how: 'Emails enviados para o endereço único do workspace são automaticamente registados no separador Comunicações. Ideal para capturar correspondência com founders.',
      forwardTitle: 'Reencaminhamento automático com Power Automate',
      forwardSteps: [
        'Criar uma caixa de correio partilhada no Microsoft 365 Admin Center (ex.: startups@oseudominio.com)',
        'Aceder ao Power Automate',
        'Criar novo → Fluxo de nuvem automatizado',
        'Adicionar gatilho: "When a new email arrives (V3)"',
        'Adicionar ação: "HTTP" com método POST',
        'Configurar a ação HTTP com o URL do webhook de email de entrada',
      ],
      httpLabel: 'Corpo do pedido HTTP:',
      tagsTitle: 'Dicas de etiquetagem de emails',
      tagsIntro: 'Use prefixos no assunto para categorizar emails:',
      tags: [
        { k: '[Startup]', v: 'comunicações gerais de startups' },
        { k: '[Deal]', v: 'correspondência relacionada com investimento' },
        { k: '[Support]', v: 'pedidos de suporte' },
      ],
    },
    sso: {
      title: 'SSO Microsoft (Single Sign-On)',
      description: 'Permite que utilizadores iniciem sessão com a sua conta Microsoft 365',
      setupRequired: 'Configuração necessária',
      preTitle: 'Pré-requisitos',
      pre: 'É necessário acesso de administrador Azure AD para registar uma aplicação e configurar OAuth.',
      azureTitle: 'Registo de aplicação Azure AD',
      azureSteps1: [
        'Aceder ao Azure Portal → App Registrations',
        'Clicar em "New registration"',
      ],
      configure: 'Configurar:',
      configureFields: [
        'Nome: Startup Leiria',
        'Tipos de conta suportados: Apenas contas neste diretório organizacional',
        'Redirect URI: Web → URL de callback de autenticação do backend',
      ],
      azureSteps2: [
        'Após criação, anotar o Application (client) ID',
        'Ir a Certificates & secrets → New client secret',
        'Copiar o valor do secret (será necessário para o backend)',
      ],
      apiPerms: 'Ir a API permissions → Adicionar:',
      apiPermsList: [
        'Microsoft Graph → Delegated → User.Read',
        'Microsoft Graph → Delegated → email',
        'Microsoft Graph → Delegated → profile',
        'Microsoft Graph → Delegated → openid',
      ],
      azureSteps3: [
        'Clicar em "Grant admin consent"',
      ],
      backendTitle: 'Configuração no backend',
      backendIntro: 'Após criar a app Azure AD, configure o provider Microsoft no backend:',
      backendSteps: [
        'Aceder ao projeto Lovable Cloud → Authentication → Providers',
        'Ativar Azure (Microsoft)',
        'Introduzir o Client ID e o Client Secret do Azure AD',
        'Copiar o URL de callback do backend para os redirect URIs da app Azure AD',
      ],
      experienceTitle: 'O que os utilizadores vão ver',
      experience: 'Depois de configurado, os utilizadores verão um botão "Iniciar sessão com Microsoft" na página de login. Autenticam-se via Microsoft e são automaticamente mapeados para o seu workspace.',
    },
    resources: 'Recursos úteis',
    copy: 'Copiar',
    copied: 'Copiado para a área de transferência',
    copyError: 'Não foi possível copiar',
  },
  en: {
    back: 'Back',
    title: 'Integrations Setup Guide',
    intro: 'Connect Startup Leiria to your Microsoft 365 environment for seamless notifications and calendar sync.',
    tabs: { teams: 'Teams', outlook: 'Outlook', email: 'Email', sso: 'SSO' },
    teams: {
      title: 'Microsoft Teams Notifications',
      description: 'Receive real-time notifications in your Teams channel',
      benefitsTitle: "What you'll get",
      benefits: 'Automatic Teams messages when: check-ins are submitted, actions are assigned/overdue, sessions are scheduled, and health alerts are triggered.',
      option1: 'Option 1: Teams Workflows (easiest)',
      option1Steps: [
        'Open Microsoft Teams and navigate to your target channel',
        'Click the ⋯ menu → Workflows',
        'Search for "Post to a channel when a webhook request is received"',
        'Configure the workflow and copy the generated webhook URL',
        'Paste the URL in Settings → Integrations → Microsoft Teams',
      ],
      option2: 'Option 2: Power Automate Flow',
      option2Steps: [
        'Go to Power Automate',
        'Create new → Instant cloud flow',
        'Add trigger: "When an HTTP request is received"',
        'Add action: "Post message in a chat or channel" (Microsoft Teams)',
        'Configure the message to use dynamic content from the request body',
        'Save and copy the HTTP POST URL',
      ],
      schemaLabel: 'Request body schema (paste in Power Automate):',
      notifTypesTitle: 'Notification types',
      notifTypes: [
        { k: 'Check-in submitted:', v: 'when a startup completes their monthly check-in' },
        { k: 'Action assigned:', v: 'when a new action item is assigned to someone' },
        { k: 'Action overdue:', v: 'daily reminder for overdue actions' },
        { k: 'Session created:', v: 'when a new session/meeting is scheduled' },
        { k: 'Health alert:', v: "when a startup's health score drops significantly" },
      ],
    },
    outlook: {
      title: 'Outlook Calendar Sync',
      description: 'Automatically create Outlook calendar events with Teams meeting links',
      benefitsTitle: "What you'll get",
      benefits: "When sessions are created in Startup Leiria, they're automatically added to Outlook with a Teams meeting link. Updates and cancellations sync automatically.",
      pa: 'Power Automate setup (recommended)',
      paSteps: [
        'Go to Power Automate',
        'Create new → Instant cloud flow',
        'Add trigger: "When an HTTP request is received"',
        'Add action: "Create event (V4)" from Office 365 Outlook',
      ],
      eventConfig: 'Configure the event:',
      eventFields: [
        'Calendar: your calendar or a shared calendar',
        'Subject: @{triggerBody()[\'title\']}',
        'Start time: @{triggerBody()[\'start\']}',
        'End time: @{triggerBody()[\'end\']}',
        'Is online meeting: Yes',
      ],
      paSteps2: [
        'Add action: "Response" to return the event ID and Teams URL',
        'Save and copy the HTTP POST URL',
      ],
      responseLabel: 'Response body (in Response action):',
      graphTitle: 'Direct Microsoft Graph API (coming soon)',
      graphIntro: "For a fully seamless experience, we're working on direct Microsoft Graph integration. This will require Azure AD app registration with the following permissions:",
      comingSoon: 'Coming in Phase 2',
    },
    email: {
      title: 'Email Ingestion',
      description: 'Automatically capture emails from Outlook into workspace communications',
      howTitle: 'How it works',
      how: "Emails sent to your workspace's unique address are automatically logged in the Communications tab. Great for capturing founder correspondence.",
      forwardTitle: 'Automatic email forwarding with Power Automate',
      forwardSteps: [
        'Create a shared mailbox in Microsoft 365 Admin Center (e.g. startups@yourdomain.com)',
        'Go to Power Automate',
        'Create new → Automated cloud flow',
        'Add trigger: "When a new email arrives (V3)"',
        'Add action: "HTTP" with POST method',
        'Configure the HTTP action with your inbound email webhook URL',
      ],
      httpLabel: 'HTTP request body:',
      tagsTitle: 'Email tagging tips',
      tagsIntro: 'Use subject prefixes to categorize emails:',
      tags: [
        { k: '[Startup]', v: 'general startup communications' },
        { k: '[Deal]', v: 'investment-related correspondence' },
        { k: '[Support]', v: 'support requests' },
      ],
    },
    sso: {
      title: 'Microsoft SSO (Single Sign-On)',
      description: 'Allow users to sign in with their Microsoft 365 accounts',
      setupRequired: 'Setup required',
      preTitle: 'Prerequisites',
      pre: 'You need Azure AD admin access to register an application and configure OAuth.',
      azureTitle: 'Azure AD app registration',
      azureSteps1: [
        'Go to Azure Portal → App Registrations',
        'Click "New registration"',
      ],
      configure: 'Configure:',
      configureFields: [
        'Name: Startup Leiria',
        'Supported account types: Accounts in this organizational directory only',
        'Redirect URI: Web → backend auth callback URL',
      ],
      azureSteps2: [
        'After creation, note the Application (client) ID',
        'Go to Certificates & secrets → New client secret',
        "Copy the secret value (you'll need it for the backend)",
      ],
      apiPerms: 'Go to API permissions → Add:',
      apiPermsList: [
        'Microsoft Graph → Delegated → User.Read',
        'Microsoft Graph → Delegated → email',
        'Microsoft Graph → Delegated → profile',
        'Microsoft Graph → Delegated → openid',
      ],
      azureSteps3: [
        'Click "Grant admin consent"',
      ],
      backendTitle: 'Backend configuration',
      backendIntro: 'After creating the Azure AD app, configure the Microsoft provider in the backend:',
      backendSteps: [
        'Go to your Lovable Cloud project → Authentication → Providers',
        'Enable Azure (Microsoft)',
        'Enter your Azure AD Client ID and Client Secret',
        "Copy the callback URL from the backend to your Azure AD app's redirect URIs",
      ],
      experienceTitle: 'What users will experience',
      experience: 'Once configured, users will see a "Sign in with Microsoft" button on the login page. They authenticate through Microsoft and are automatically mapped to their workspace.',
    },
    resources: 'Useful resources',
    copy: 'Copy',
    copied: 'Copied to clipboard',
    copyError: 'Could not copy',
  },
} as const;

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

export default function IntegrationsSetup() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'pt') as 'pt' | 'en';
  const c = CONTENT[lang];

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(c.copied);
    } catch {
      toast.error(c.copyError);
    }
  };

  return (
    <AppLayout title={c.title}>
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {c.back}
        </Button>
      </div>

      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{c.title}</h1>
          <p className="text-muted-foreground mt-2">{c.intro}</p>
        </div>

        <Tabs defaultValue="teams" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="teams" className="gap-2">
              <TeamsIcon className="h-4 w-4" />
              {c.tabs.teams}
            </TabsTrigger>
            <TabsTrigger value="outlook" className="gap-2">
              <OutlookIcon className="h-4 w-4" />
              {c.tabs.outlook}
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              {c.tabs.email}
            </TabsTrigger>
            <TabsTrigger value="sso" className="gap-2">
              <Settings2 className="h-4 w-4" />
              {c.tabs.sso}
            </TabsTrigger>
          </TabsList>

          {/* Teams Integration */}
          <TabsContent value="teams" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TeamsIcon className="h-6 w-6 text-[#6264A7]" />
                  {c.teams.title}
                </CardTitle>
                <CardDescription>{c.teams.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertTitle>{c.teams.benefitsTitle}</AlertTitle>
                  <AlertDescription>{c.teams.benefits}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{c.teams.option1}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {c.teams.option1Steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{c.teams.option2}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {c.teams.option2Steps.map((s, i) => (
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
                    <p className="text-sm font-medium mb-2">{c.teams.schemaLabel}</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">{TEAMS_SCHEMA}</pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 gap-1"
                      onClick={() => copyToClipboard(TEAMS_SCHEMA)}
                    >
                      <Copy className="h-3 w-3" /> {c.copy}
                    </Button>
                  </div>
                </div>

                <Alert variant="default">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>{c.teams.notifTypesTitle}</AlertTitle>
                  <AlertDescription className="mt-2">
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {c.teams.notifTypes.map((n, i) => (
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
                  {c.outlook.title}
                </CardTitle>
                <CardDescription>{c.outlook.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertTitle>{c.outlook.benefitsTitle}</AlertTitle>
                  <AlertDescription>{c.outlook.benefits}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{c.outlook.pa}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {c.outlook.paSteps.map((s, i) => (
                      <li key={i}>
                        {i === 0 ? (
                          <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            Power Automate <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : s}
                      </li>
                    ))}
                    <li>
                      {c.outlook.eventConfig}
                      <ul className="list-disc list-inside ml-4 mt-2 text-muted-foreground">
                        {c.outlook.eventFields.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </li>
                    {c.outlook.paSteps2.map((s, i) => (
                      <li key={`p2-${i}`}>{s}</li>
                    ))}
                  </ol>

                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">{c.outlook.responseLabel}</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">{OUTLOOK_RESPONSE}</pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 gap-1"
                      onClick={() => copyToClipboard(OUTLOOK_RESPONSE)}
                    >
                      <Copy className="h-3 w-3" /> {c.copy}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{c.outlook.graphTitle}</h3>
                  <p className="text-sm text-muted-foreground">{c.outlook.graphIntro}</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground">
                    <li>Calendars.ReadWrite</li>
                    <li>OnlineMeetings.ReadWrite</li>
                  </ul>
                  <Badge variant="secondary">{c.outlook.comingSoon}</Badge>
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
                  {c.email.title}
                </CardTitle>
                <CardDescription>{c.email.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{c.email.howTitle}</AlertTitle>
                  <AlertDescription>{c.email.how}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{c.email.forwardTitle}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    {c.email.forwardSteps.map((s, i) => (
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
                    <p className="text-sm font-medium mb-2">{c.email.httpLabel}</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">{EMAIL_BODY}</pre>
                  </div>

                  <Alert variant="default">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{c.email.tagsTitle}</AlertTitle>
                    <AlertDescription className="text-sm">
                      {c.email.tagsIntro}
                      <ul className="list-disc list-inside mt-2">
                        {c.email.tags.map((tg, i) => (
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
                  {c.sso.title}
                </CardTitle>
                <CardDescription>{c.sso.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Badge variant="secondary" className="mb-4">{c.sso.setupRequired}</Badge>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{c.sso.preTitle}</AlertTitle>
                  <AlertDescription>{c.sso.pre}</AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{c.sso.azureTitle}</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    <li>
                      <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {c.sso.azureSteps1[0]} <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>{c.sso.azureSteps1[1]}</li>
                    <li>
                      {c.sso.configure}
                      <ul className="list-disc list-inside ml-4 mt-2 text-muted-foreground">
                        {c.sso.configureFields.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </li>
                    {c.sso.azureSteps2.map((s, i) => (
                      <li key={`a2-${i}`}>{s}</li>
                    ))}
                    <li>
                      {c.sso.apiPerms}
                      <ul className="list-disc list-inside ml-4 mt-2 text-muted-foreground">
                        {c.sso.apiPermsList.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </li>
                    {c.sso.azureSteps3.map((s, i) => (
                      <li key={`a3-${i}`}>{s}</li>
                    ))}
                  </ol>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{c.sso.backendTitle}</h3>
                  <p className="text-sm text-muted-foreground">{c.sso.backendIntro}</p>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {c.sso.backendSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>

                <Alert variant="default">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>{c.sso.experienceTitle}</AlertTitle>
                  <AlertDescription>{c.sso.experience}</AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>{c.resources}</CardTitle>
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
