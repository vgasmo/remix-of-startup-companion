import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CockpitQuickActions } from '@/components/staff/CockpitQuickActions';
import { WorkQueuePanel } from '@/components/staff/WorkQueuePanel';
import { StaffTasksPanel } from '@/components/staff/StaffTasksPanel';
import { CockpitPortfolioOverview } from '@/components/staff/CockpitPortfolioOverview';
import { SilentDisengagementCard } from '@/components/staff/SilentDisengagementCard';
import { OnboardingPipelineCard } from '@/components/staff/OnboardingPipelineCard';
import { AdminQuickAccessCard } from '@/components/staff/AdminQuickAccessCard';
import { PendingApprovalsManager } from '@/components/admin/PendingApprovalsManager';
import { IntakeRoutingManager } from '@/components/admin/IntakeRoutingManager';
import { ClaimRequestsQueue } from '@/components/admin/ClaimRequestsQueue';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { LayoutDashboard, Inbox, ListTodo, Zap, Building2, UserCheck, FileText, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

export default function StaffCockpit() {
  const { t } = useTranslation();
  const { profile, roles } = useAuth();
  const { data: workspaces = [], isLoading: workspacesLoading } = useWorkspaces();

  // Real ecosystem-wide programs count (matches Admin Dashboard)
  const { data: programsCount = 0, isLoading: programsLoading } = useQuery({
    queryKey: ['active-programs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('programs')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 5 * 60_000,
  });

  const heroLoading = workspacesLoading || programsLoading;

  const isAdmin = roles?.includes('admin');
  const isConsultor = roles?.includes('consultor');
  const isBackoffice = roles?.includes('backoffice');
  const greeting = profile?.full_name
    ? t('staffCockpit.greeting', { defaultValue: 'Olá, {{name}}', name: profile.full_name.split(' ')[0] })
    : t('staffCockpit.greetingGeneric', { defaultValue: 'Bem-vindo ao Painel' });

  return (
    <AppLayout
      title={t('staffCockpit.title', { defaultValue: 'Painel' })}
      subtitle={greeting}
    >
      <div className="space-y-6">
        {/* Hero greeting */}
        <div className="hero-greeting flex items-center justify-between">
          <div>
            <h2 className="text-xl font-heading font-semibold text-foreground">
              {greeting}
            </h2>
            {heroLoading ? (
              <Skeleton className="h-4 w-64 mt-2" />
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {t('staffCockpit.heroSubtitle', {
                  defaultValue: '{{count}} startups no ecossistema · {{programs}} programas',
                  count: workspaces.length,
                  programs: programsCount,
                })}
              </p>
            )}
          </div>
          <LayoutDashboard className="h-10 w-10 text-primary/20" />
        </div>

        {/* Quick Actions Bar */}
        <CockpitQuickActions workspaces={workspaces} compact={false} />

        {/* Admin-only: Onboarding Pipeline + Quick Access */}
        {isAdmin && (
          <div className="grid gap-4 lg:grid-cols-2">
            <WidgetErrorBoundary name="OnboardingPipeline">
              <OnboardingPipelineCard />
            </WidgetErrorBoundary>
            <WidgetErrorBoundary name="AdminQuickAccess">
              <AdminQuickAccessCard />
            </WidgetErrorBoundary>
          </div>
        )}

        {/* Portfolio Overview - Admin and Consultor */}
        {(isAdmin || isConsultor) && (
          <CockpitPortfolioOverview workspaces={workspaces} />
        )}

        {/* Silent Disengagement Alerts - Admin and Consultor */}
        {(isAdmin || isConsultor) && (
          <SilentDisengagementCard workspaces={workspaces} />
        )}

        {/* Backoffice-specific: Contracts expiring + Startup Portugal status */}
        {(isBackoffice || isAdmin) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <WidgetErrorBoundary name="ContractsExpiring">
              <BackofficeContractsExpiringCard />
            </WidgetErrorBoundary>
            <WidgetErrorBoundary name="StartupPortugalCertified">
              <StartupPortugalCertifiedCard />
            </WidgetErrorBoundary>
          </div>
        )}

        {/* Consultor-only Startup Portugal card (admin already covered above) */}
        {isConsultor && !isAdmin && !isBackoffice && (
          <WidgetErrorBoundary name="StartupPortugalCertified">
            <StartupPortugalCertifiedCard />
          </WidgetErrorBoundary>
        )}

        {/* Main Grid: Triage + Daily Work */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT: Smart Triage & Intake - Admin and Consultor */}
          {(isAdmin || isConsultor) && (
            <div className="space-y-0">
              <Card className="overflow-hidden">
                <div className="px-6 pt-5 pb-3">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold font-heading">
                      {t('staffCockpit.triage', { defaultValue: 'Triagem & Intake' })}
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-7">
                    {t('staffCockpit.triageDesc', { defaultValue: 'O que precisa de decisão agora: aprovações, associações e encaminhamento.' })}
                  </p>
                </div>
                <CardContent className="p-0">
                  <Tabs defaultValue="approvals" className="w-full">
                    <div className="px-6">
                      <TabsList className="w-full grid grid-cols-3">
                        <TabsTrigger value="approvals" className="text-xs">
                          {t('staffCockpit.pendingApprovals', { defaultValue: 'Aprovações Pendentes' })}
                        </TabsTrigger>
                        <TabsTrigger value="claims" className="text-xs">
                          {t('staffCockpit.claimRequests', { defaultValue: 'Associações' })}
                        </TabsTrigger>
                        <TabsTrigger value="routing" className="text-xs">
                          {t('staffCockpit.intakeRouting', { defaultValue: 'Encaminhamento' })}
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <div className="px-6 pb-6 pt-4 max-h-[600px] overflow-y-auto">
                      <TabsContent value="approvals" className="mt-0">
                        <PendingApprovalsManager />
                      </TabsContent>
                      <TabsContent value="claims" className="mt-0">
                        <ClaimRequestsQueue />
                      </TabsContent>
                      <TabsContent value="routing" className="mt-0">
                        <IntakeRoutingManager />
                      </TabsContent>
                    </div>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}

          {/* RIGHT: Daily Work Queue & Tasks */}
          <div className="space-y-6">
            {/* Work Queue */}
            <div>
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold font-heading">
                    {t('staffCockpit.dailyWork', { defaultValue: 'Trabalho do Dia' })}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 ml-7">
                  {t('staffCockpit.dailyWorkDesc', { defaultValue: 'Ações automáticas prioritárias baseadas no estado do portfólio.' })}
                </p>
              </div>
              <WorkQueuePanel compact={false} />
            </div>

            {/* Staff Tasks */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold font-heading">
                  {t('staffCockpit.myTasks', { defaultValue: 'As Minhas Tarefas' })}
                </h2>
              </div>
              <StaffTasksPanel compact={false} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

/** Backoffice widget: contracts expiring within 30 days */
function BackofficeContractsExpiringCard() {
  const { t } = useTranslation();

  const { data: contracts = [] } = useQuery({
    queryKey: ['backoffice-contracts-expiring'],
    queryFn: async () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      const { data, error } = await supabase
        .from('startup_contracts')
        .select('id, contract_number, end_date, startup_id, startups(name)')
        .eq('status', 'active')
        .lte('end_date', thirtyDaysFromNow.toISOString())
        .gte('end_date', new Date().toISOString())
        .order('end_date', { ascending: true })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-amber-500" />
          {t('staffCockpit.contractsExpiring', { defaultValue: 'Contratos a Expirar (30 dias)' })}
          {contracts.length > 0 && (
            <Badge variant="secondary" className="ml-auto">{contracts.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('staffCockpit.noExpiringContracts', { defaultValue: 'Nenhum contrato a expirar nos próximos 30 dias.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {contracts.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                <div>
                  <span className="font-medium">{c.contract_number}</span>
                  <span className="text-muted-foreground ml-2">
                    {(c.startups as any)?.name}
                  </span>
                </div>
                <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600">
                  {t('staffCockpit.expiresOn', { defaultValue: 'Expira em {{date}}', date: c.end_date ? format(new Date(c.end_date), 'dd/MM') : '-' })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
