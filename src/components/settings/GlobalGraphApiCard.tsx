import React, { useState } from 'react';
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
  Link2,
  Globe,
  Loader2,
  TestTube,
  FileText,
} from 'lucide-react';
import { useGlobalGraphSettings, useUpdateGlobalGraphSettings, useToggleGlobalGraph, GraphApiGlobalSettings } from '@/hooks/useGlobalIntegrations';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);


export function GlobalGraphApiCard() {
  const { data: settings, isLoading } = useGlobalGraphSettings();
  const updateSettings = useUpdateGlobalGraphSettings();
  const toggleEnabled = useToggleGlobalGraph();
  
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [showPolicyGuide, setShowPolicyGuide] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const settingsJson = settings?.settings_json as GraphApiGlobalSettings | undefined;
  const isConfigured = !!(settingsJson?.tenant_id && settingsJson?.client_id);
  const isEnabled = settings?.is_enabled && isConfigured;
  
  // Pre-populate fields with current values when data loads
  React.useEffect(() => {
    if (settingsJson && !isInitialized) {
      setTenantId(settingsJson.tenant_id || '');
      setClientId(settingsJson.client_id || '');
      setIsInitialized(true);
    }
  }, [settingsJson, isInitialized]);

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

    await updateSettings.mutateAsync({
      tenant_id: tenantId,
      client_id: clientId,
    });
  };

  const handleToggle = async (enabled: boolean) => {
    if (enabled && !isConfigured) {
      notify.error(t('settings.pleaseConfigureAzureAdCredentials'));
      return;
    }
    await toggleEnabled.mutateAsync(enabled);
  };

  const handleTestGraph = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      notify.error(t('settings.enterAValidConsultantEmail'));
      return;
    }

    setIsTesting(true);
    try {
      const { data, error } = await invokeWithAuth('test-graph-api', {
        body: { test_email: testEmail },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        notify.success(
          data.teams_url 
            ? `✓ Test passed! Teams URL: ${data.teams_url.slice(0, 50)}...` 
            : '✓ Event created and deleted successfully'
        );
      } else {
        notify.error(data?.error || 'Test failed - check console for details');
      }
    } catch (err: any) {
      logger.error('[GlobalGraphApiCard] Test failed', {}, err);
      notify.error(err.message || 'Failed to run test - are you logged in as admin?');
    } finally {
      setIsTesting(false);
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
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          {t('settings.globalGraphApi')}
          {isEnabled && (
            <Badge variant="outline" className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('settings.active')}
            </Badge>
          )}
          {isConfigured && !isEnabled && (
            <Badge variant="outline">{t('settings.configured')}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t('settings.graphApiCardDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-primary/5 border-primary/20">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>{t('settings.howItWorks')}</strong> {t('settings.howItWorksDesc')}
          </AlertDescription>
        </Alert>

        {/* Features */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 text-[#0078D4]" />
            <span>{t('settings.outlookEvents')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Video className="h-4 w-4 text-[#6264A7]" />
            <span>{t('settings.teamsMeetings')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{t('settings.perConsultantCalendars')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{t('settings.autoTranscripts')}</span>
          </div>
        </div>

        {/* Azure AD Credentials */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[hsl(var(--warning))]" />
            <Label className="font-medium">{t('settings.azureAdAppRegistration')}</Label>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="global-tenant-id" className="text-xs">{t('settings.tenantIdLabel')}</Label>
            <Input
              id="global-tenant-id"
              type="text"
              placeholder={settingsJson?.tenant_id || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-client-id" className="text-xs">{t('settings.clientIdLabel')}</Label>
            <Input
              id="global-client-id"
              type="text"
              placeholder={settingsJson?.client_id || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <Alert className="bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30">
            <Shield className="h-4 w-4 text-[hsl(var(--warning))]" />
            <AlertDescription className="text-xs text-[hsl(var(--warning))]">
              <strong>Client Secret</strong> {t('settings.clientSecretNote')}
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleSaveCredentials}
            disabled={(!tenantId || !clientId) || updateSettings.isPending}
            size="sm"
            className="w-full"
          >
            {updateSettings.isPending ? t('settings.saving') : isConfigured ? t('settings.updateIdentifiers') : t('settings.saveIdentifiers')}
          </Button>
        </div>

        {/* Test Graph API */}
        {isConfigured && (
          <div className="space-y-2 pt-3 border-t">
            <Label className="flex items-center gap-2 text-sm">
              <TestTube className="h-4 w-4" />
              {t('settings.testGraphConnection')}
            </Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="consultor@startupleiria.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleTestGraph}
                disabled={isTesting || !testEmail}
              >
                {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('settings.test')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.testDesc')}
            </p>
          </div>
        )}

        {/* Setup Instructions */}
        <Collapsible open={showSetup} onOpenChange={setShowSetup}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs p-0 h-auto">
              <ChevronDown className={`h-3 w-3 transition-transform ${showSetup ? 'rotate-180' : ''}`} />
              {t('settings.howToSetupAzure')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
              <h4 className="font-medium">1. Create Azure AD App Registration:</h4>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 text-xs">
                <li>Go to <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Azure Portal → App Registrations <ExternalLink className="h-3 w-3 inline" /></a></li>
                <li>Click "New registration"</li>
                <li>Name: "Startup Leiria Calendar Sync"</li>
                <li>Supported account types: "Single tenant"</li>
                <li>Click "Register"</li>
              </ol>
              
              <h4 className="font-medium pt-2">2. Configure API Permissions (Application, not Delegated):</h4>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 text-xs">
                <li>Go to "API Permissions" → "Add a permission"</li>
                <li>Select "Microsoft Graph" → "Application permissions"</li>
                <li>Add these permissions:
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li><code className="bg-muted px-1 rounded">Calendars.ReadWrite</code></li>
                    <li><code className="bg-muted px-1 rounded">OnlineMeetings.ReadWrite.All</code></li>
                    <li><code className="bg-muted px-1 rounded">OnlineMeetingTranscript.Read.All</code></li>
                    <li><code className="bg-muted px-1 rounded">User.Read.All</code></li>
                  </ul>
                </li>
                <li><strong>Click "Grant admin consent for [Your Org]"</strong></li>
              </ol>

              <h4 className="font-medium pt-2">3. Create Client Secret:</h4>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 text-xs">
                <li>Go to "Certificates & secrets"</li>
                <li>Click "New client secret"</li>
                <li>Set expiry (recommend: 24 months)</li>
                <li>Copy the secret value immediately (only shown once!)</li>
              </ol>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Teams Application Access Policy Guide */}
        <Collapsible open={showPolicyGuide} onOpenChange={setShowPolicyGuide}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs p-0 h-auto text-[hsl(var(--warning))]">
              <ChevronDown className={`h-3 w-3 transition-transform ${showPolicyGuide ? 'rotate-180' : ''}`} />
              {t('settings.teamsAccessPolicy')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 p-4 space-y-3 text-sm">
              <p className="text-muted-foreground text-xs">
                By default, Microsoft blocks apps from accessing meeting transcripts. You must create an Application Access Policy to allow this app to access consultant meetings.
              </p>
              
              <h4 className="font-medium">PowerShell Commands (run as Teams Admin):</h4>
              <div className="bg-background rounded p-2 font-mono text-xs space-y-2 overflow-x-auto">
                <p className="text-muted-foreground"># 1. Connect to Teams</p>
                <code>Connect-MicrosoftTeams</code>
                <br /><br />
                <p className="text-muted-foreground"># 2. Create an access policy (replace APP_CLIENT_ID)</p>
                <code>New-CsApplicationAccessPolicy -Identity "StartupLeiriaAccess" -AppIds "YOUR_APP_CLIENT_ID" -Description "Allow Startup Leiria to access meetings"</code>
                <br /><br />
                <p className="text-muted-foreground"># 3. Grant to all consultants (or a specific group)</p>
                <code>Grant-CsApplicationAccessPolicy -PolicyName "StartupLeiriaAccess" -Global</code>
                <br /><br />
                <p className="text-muted-foreground"># OR grant to specific user:</p>
                <code>Grant-CsApplicationAccessPolicy -PolicyName "StartupLeiriaAccess" -Identity "consultor@startupleiria.com"</code>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="space-y-0.5">
            <Label>{t('settings.enableGraphGlobally')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.allWorkspacesCanUse')}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={toggleEnabled.isPending || !isConfigured}
          />
        </div>

        {isEnabled && (
          <div className="text-xs text-muted-foreground bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30 rounded-lg p-3">
            <p className="font-medium text-[hsl(var(--success))]">🎉 {t('settings.globalIntegrationActive')}</p>
            <p>{t('settings.globalIntegrationDesc')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
