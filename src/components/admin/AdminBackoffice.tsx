import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, FileText, MapPin, Package, Archive, Inbox } from 'lucide-react';

// Backoffice sub-tab components
import { BackofficeDashboard } from '@/components/backoffice/BackofficeDashboard';
import { BackofficeContractsTab } from '@/components/backoffice/BackofficeContractsTab';
import { BackofficeIncubationTypesTab } from '@/components/backoffice/BackofficeIncubationTypesTab';
import { InfrastructureTab } from '@/components/backoffice/InfrastructureTab';
import { SpaceOperationsConsole } from '@/components/backoffice/SpaceOperationsConsole';
import { OpsActionPrompts } from '@/components/backoffice/OpsActionPrompts';
import { ContractLifecycleHub } from '@/components/admin/ContractLifecycleHub';
import { AdminArchiveBackupTab } from '@/components/admin/AdminArchiveBackupTab';
import { FounderRequestsInbox } from '@/components/staff/FounderRequestsInbox';
import { StartupChangeRequestsInbox } from '@/components/admin/StartupChangeRequestsInbox';

const SUBTABS = ['dashboard', 'contracts', 'spaces', 'incubation', 'founder-requests', 'archive'] as const;
const SUBTAB_ALIASES: Record<string, (typeof SUBTABS)[number]> = {
  overview: 'dashboard', invoices: 'contracts', operations: 'spaces',
  infrastructure: 'spaces', infra: 'spaces', waitlist: 'spaces',
};

export function AdminBackoffice() {
  const { t } = useTranslation();
  const { isAdmin, isBackoffice } = useAuth();
  const isGovernance = isAdmin || isBackoffice;
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSubTab = searchParams.get('subtab') ?? searchParams.get('section');
  const candidate = rawSubTab ? (SUBTAB_ALIASES[rawSubTab] ?? rawSubTab) : 'dashboard';
  const activeSubTab = (SUBTABS as readonly string[]).includes(candidate) && !(candidate === 'archive' && !isGovernance) ? candidate : 'dashboard';
  const setActiveSubTabAndUrl = (subtab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'backoffice');
    next.set('subtab', subtab);
    next.delete('section');
    setSearchParams(next, { replace: false });
  };


  return (
    <div className="space-y-6">
      {/* Simplified sub-tabs: 5 clear sections */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTabAndUrl}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            {t('admin.backoffice.dashboard', { defaultValue: 'Visão Geral' })}
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5">
            <FileText className="h-4 w-4" />
            {t('admin.backoffice.contractsAndLifecycle', { defaultValue: 'Contratos' })}
          </TabsTrigger>
          {/* Invoices tab removed per user request */}
          <TabsTrigger value="spaces" className="gap-1.5">
            <MapPin className="h-4 w-4" />
            {t('admin.backoffice.spacesAndInfra', { defaultValue: 'Espaços & Infraestrutura' })}
          </TabsTrigger>
          <TabsTrigger value="incubation" className="gap-1.5">
            <Package className="h-4 w-4" />
            {t('admin.backoffice.incubationTypes', { defaultValue: 'Tipos de Incubação' })}
          </TabsTrigger>
          <TabsTrigger value="founder-requests" className="gap-1.5">
            <Inbox className="h-4 w-4" />
            {t('admin.backoffice.founderRequests', { defaultValue: 'Pedidos Founders' })}
          </TabsTrigger>
          {isGovernance && (
            <TabsTrigger value="archive" className="gap-1.5">
              <Archive className="h-4 w-4" />
              {t('admin.backoffice.archiveAndBackups', { defaultValue: 'Arquivo & Backups' })}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Dashboard Tab - KPIs + Overview + Action Prompts */}
        <TabsContent value="dashboard">
          <div className="space-y-6">
            <OpsActionPrompts />
            <BackofficeDashboard />
          </div>
        </TabsContent>

        {/* Invoices tab removed per user request */}
        {/* Contracts Tab — merged with lifecycle */}
        <TabsContent value="contracts">
          <div className="space-y-8">
            <BackofficeContractsTab />
            <ContractLifecycleHub />
          </div>
        </TabsContent>

        {/* Spaces & Infrastructure — merged */}
        <TabsContent value="spaces">
          <div className="space-y-8">
            <SpaceOperationsConsole />
            <InfrastructureTab />
          </div>
        </TabsContent>

        {/* Incubation Types Tab */}
        <TabsContent value="incubation">
          <BackofficeIncubationTypesTab />
        </TabsContent>

        <TabsContent value="founder-requests">
          <div className="space-y-6">
            <StartupChangeRequestsInbox />
            <FounderRequestsInbox />
          </div>
        </TabsContent>

        {/* Archive & Backups Tab — governance roles only */}
        {isGovernance && (
          <TabsContent value="archive">
            <AdminArchiveBackupTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
