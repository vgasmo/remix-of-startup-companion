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
import { MomentumPanel } from '@/components/staff/MomentumPanel';
import { OnboardingPipelineCard } from '@/components/staff/OnboardingPipelineCard';
import { AdminQuickAccessCard } from '@/components/staff/AdminQuickAccessCard';
import { NextBestActionStaff } from '@/components/dashboard/NextBestActionPanels';

import { PendingApprovalsManager } from '@/components/admin/PendingApprovalsManager';
import { IntakeRoutingManager } from '@/components/admin/IntakeRoutingManager';
import { ClaimRequestsQueue } from '@/components/admin/ClaimRequestsQueue';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { DayCompleteRing } from '@/components/staff/DayCompleteRing';
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

  const isBackoffice = roles?.includes('backoffice');
  const isAdmin = roles?.includes('admin');

  // Counts for NextBestActionStaff (backoffice branch)
  const { data: backofficeCounts } = useQuery({
    queryKey: ['staff-cockpit-nba-counts'],
    enabled: !!(isBackoffice || isAdmin),
    queryFn: async () => {
      const [contractsRes, intakesRes, unassignedRes] = await Promise.all([
        supabase.from('startup_contracts').select('id', { count: 'exact', head: true }).eq('status', 'pending_signature'),
        supabase.from('contract_intakes').select('id', { count: 'exact', head: true }).in('status', ['review_pending', 'changes_requested']),
        supabase.from('workspaces').select('id', { count: 'exact', head: true }).eq('status', 'active').is('primary_consultor_id', null),
      ]);
      return {
        contractsAwaitingSignatureCount: contractsRes.count ?? 0,
        intakesBlockedCount: intakesRes.count ?? 0,
        unassignedActiveWorkspacesCount: unassignedRes.count ?? 0,
      };
    },
    staleTime: 60_000,
  });


  const isConsultor = roles?.includes('consultor');

  const greeting = profile?.full_name
    ? t('staffCockpit.greeting', { defaultValue: 'Olá, {{name}}', name: profile.full_name.split(' ')[0] })
    : t('staffCockpit.greetingGeneric', { defaultValue: 'Bem-vindo ao Painel' });

  return (
    <AppLayout
      title={t('staffCockpit.title', { defaultValue: 'Painel' })}
      subtitle={greeting}
    >
      <div className="space-y-6">
        {/* Command Bar */}
        <div className="rounded-xl border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-5 py-4 flex flex-wrap items-center gap-4 shadow-sm">
          <DayCompleteRing />
          <div className="min-w-0">
            <h2 className="text-lg font-heading font-semibold text-foreground truncate">{greeting}</h2>
            <p className="text-xs text-muted-foreground">
              {t('staffCockpit.heroTagline', { defaultValue: 'Painel operacional · decisões e prioridades do dia' })}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {heroLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  {workspaces.length}
                  <span className="text-muted-foreground font-normal">{t('staffCockpit.pillStartups', { defaultValue: 'startups' })}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  {programsCount}
                  <span className="text-muted-foreground font-normal">{t('staffCockpit.pillPrograms', { defaultValue: 'programas' })}</span>
                </span>
              </>
            )}
          </div>
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

        {/* Momentum / Stall Prediction — consolidates SilentDisengagement
            into a multi-signal, explainable view with recommended actions. */}
        {(isAdmin || isConsultor) && (
          <MomentumPanel workspaces={workspaces} />
        )}

        {/* Backoffice-specific: Next best action + Contracts expiring + Startup Portugal status */}
        {(isBackoffice || isAdmin) && (
          <WidgetErrorBoundary name="NextBestActionStaff">
            <NextBestActionStaff
              contractsAwaitingSignatureCount={backofficeCounts?.contractsAwaitingSignatureCount ?? 0}
              intakesBlockedCount={backofficeCounts?.intakesBlockedCount ?? 0}
              unassignedActiveWorkspacesCount={backofficeCounts?.unassignedActiveWorkspacesCount ?? 0}
            />
          </WidgetErrorBoundary>
        )}
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

        {/* Main Grid: Triage + Daily Work — Work Queue stacks first on mobile */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT (desktop) / SECOND (mobile): Smart Triage & Intake */}
          {(isAdmin || isConsultor) && (
            <div className="space-y-0 order-2 lg:order-1">
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
                      <TabsList className="w-full grid grid-cols-3 h-10 p-1 bg-muted/60 rounded-lg">
                        <TabsTrigger
                          value="approvals"
                          className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                          {t('staffCockpit.pendingApprovals', { defaultValue: 'Aprovações Pendentes' })}
                        </TabsTrigger>
                        <TabsTrigger
                          value="claims"
                          className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                          {t('staffCockpit.claimRequests', { defaultValue: 'Associações' })}
                        </TabsTrigger>
                        <TabsTrigger
                          value="routing"
                          className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
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

          {/* RIGHT (desktop) / FIRST (mobile): Daily Work Queue & Tasks */}
          <div className="space-y-6 order-1 lg:order-2">
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
          <FileText className="h-4 w-4 text-warning" />
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
                <Badge variant="outline" className="text-warning border-warning/30">
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

/** Staff widget: count of startups with Startup Portugal certification */
function StartupPortugalCertifiedCard() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['startup-portugal-certified-stats'],
    queryFn: async () => {
      const [{ count: total }, { count: certified }, { data: recent }] = await Promise.all([
        supabase.from('startups').select('id', { count: 'exact', head: true }),
        supabase
          .from('startups')
          .select('id', { count: 'exact', head: true })
          .eq('has_startup_portugal_status', true),
        supabase
          .from('startups')
          .select('id, name')
          .eq('has_startup_portugal_status', true)
          .order('updated_at', { ascending: false })
          .limit(5),
      ]);
      return {
        total: total ?? 0,
        certified: certified ?? 0,
        recent: recent || [],
      };
    },
    staleTime: 5 * 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-success" />
          {t('staffCockpit.startupPortugalTitle', { defaultValue: 'Estatuto Startup Portugal' })}
          {!isLoading && (
            <Badge variant="secondary" className="ml-auto">
              {data?.certified ?? 0} / {data?.total ?? 0}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (data?.certified ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('staffCockpit.noStartupPortugalCertified', { defaultValue: 'Ainda nenhuma startup com estatuto Startup Portugal certificado.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                <span className="font-medium truncate">{s.name}</span>
                <Badge
                  variant="outline"
                  className="text-xs border-success/30 text-success"
                >
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  {t('admin.startupsManager.startupPortugal', { defaultValue: 'Startup Portugal' })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin?tab=startups">
              {t('staffCockpit.viewAllStartups', { defaultValue: 'Gerir startups' })}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
