import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Flag, Plug, TestTube, Activity, Workflow, FileSignature } from 'lucide-react';
import { AdminFeatureFlagsManager } from '@/components/admin/AdminFeatureFlagsManager';
import { EnrollmentControlCenter } from '@/components/admin/EnrollmentControlCenter';
import { IntegrationErrorsPanel } from '@/components/admin/IntegrationErrorsPanel';
import { AdminTeamsTestPanel } from '@/components/admin/AdminTeamsTestPanel';
import { IntegrationTestHarness } from '@/components/admin/IntegrationTestHarness';
import { WorkflowIntegrations } from '@/components/settings/WorkflowIntegrations';
import { ActivityLogViewerEnhanced } from '@/components/admin/ActivityLogViewerEnhanced';
import { SignatureProvidersCard } from '@/components/admin/SignatureProvidersCard';
import { FounderNotificationsKillSwitch } from '@/components/admin/FounderNotificationsKillSwitch';

export default function SystemSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('integrations');

  return (
    <AppLayout
      title={t('systemSettings.title', { defaultValue: 'System Preferences & IT' })}
      subtitle={t('systemSettings.subtitle', { defaultValue: 'Technical configurations, integrations and system diagnostics' })}
    >
      {/* Warning banner */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
        <p className="text-sm text-destructive font-medium font-mono">
          {t('systemSettings.warningBanner', { defaultValue: 'Super-Admin Area — Changes here affect the entire platform.' })}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 border">
          <TabsTrigger value="integrations" className="gap-1.5 text-xs">
            <Plug className="h-3.5 w-3.5" />
            {t('systemSettings.tabs.integrations', { defaultValue: 'Integrations' })}
          </TabsTrigger>
          <TabsTrigger value="signatures" className="gap-1.5 text-xs">
            <FileSignature className="h-3.5 w-3.5" />
            {t('systemSettings.tabs.signatures', { defaultValue: 'Assinaturas' })}
          </TabsTrigger>
          <TabsTrigger value="flags" className="gap-1.5 text-xs">
            <Flag className="h-3.5 w-3.5" />
            {t('systemSettings.tabs.featureFlags', { defaultValue: 'Feature Flags' })}
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-1.5 text-xs">
            <Workflow className="h-3.5 w-3.5" />
            {t('systemSettings.tabs.workflows', { defaultValue: 'Workflow Rules' })}
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5" />
            {t('systemSettings.tabs.auditLog', { defaultValue: 'Audit Log' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations">
          <div className="space-y-6">
            <IntegrationTestHarness />
            <AdminTeamsTestPanel />
            <IntegrationErrorsPanel maxHeight="500px" />
          </div>
        </TabsContent>

        <TabsContent value="signatures">
          <SignatureProvidersCard />
        </TabsContent>

        <TabsContent value="flags">
          <div className="space-y-6">
            <FounderNotificationsKillSwitch />
            <EnrollmentControlCenter />
            <AdminFeatureFlagsManager />
          </div>
        </TabsContent>

        <TabsContent value="workflows">
          <WorkflowIntegrations />
        </TabsContent>

        <TabsContent value="audit">
          <ActivityLogViewerEnhanced maxHeight="700px" />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
