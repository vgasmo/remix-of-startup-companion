import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Users, Building2, FileText, BarChart3, Clock, TrendingUp,
  Heart, ShieldCheck, Users2, BookOpen, ClipboardList, Bell,
  ChevronDown, Database, UserPlus, Activity
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EcosystemPulseCard } from '@/components/admin/EcosystemPulseCard';
import { AdminMissionControlDirectory } from '@/components/admin/AdminMissionControlDirectory';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// Heavy tab managers — lazy so Admin route chunk stays lean.
const AdminTemplatesManager       = lazy(lazyWithRetry(() => import('@/components/admin/AdminTemplatesManager').then(m => ({ default: m.AdminTemplatesManager })), 'lazy:admin-templates'));
const AdminTemplateRequestsManager= lazy(lazyWithRetry(() => import('@/components/admin/AdminTemplateRequestsManager').then(m => ({ default: m.AdminTemplateRequestsManager })), 'lazy:admin-template-requests'));
const AdminUsersManager           = lazy(lazyWithRetry(() => import('@/components/admin/AdminUsersManager').then(m => ({ default: m.AdminUsersManager })), 'lazy:admin-users'));
const AdminKpisManager            = lazy(lazyWithRetry(() => import('@/components/admin/AdminKpisManager').then(m => ({ default: m.AdminKpisManager })), 'lazy:admin-kpis'));
const AdminBackoffice             = lazy(lazyWithRetry(() => import('@/components/admin/AdminBackoffice').then(m => ({ default: m.AdminBackoffice })), 'lazy:admin-backoffice'));
const AdminAnnouncementsManager   = lazy(lazyWithRetry(() => import('@/components/admin/AdminAnnouncementsManager').then(m => ({ default: m.AdminAnnouncementsManager })), 'lazy:admin-announcements'));
const PendingApprovalsManager     = lazy(lazyWithRetry(() => import('@/components/admin/PendingApprovalsManager').then(m => ({ default: m.PendingApprovalsManager })), 'lazy:admin-approvals'));
const ComplianceDashboard         = lazy(lazyWithRetry(() => import('@/components/admin/ComplianceDashboard').then(m => ({ default: m.ComplianceDashboard })), 'lazy:admin-compliance'));
const CohortAnalytics             = lazy(lazyWithRetry(() => import('@/components/analytics/CohortAnalytics').then(m => ({ default: m.CohortAnalytics })), 'lazy:analytics-cohort'));
const BulkReportGenerator         = lazy(lazyWithRetry(() => import('@/components/analytics/BulkReportGenerator').then(m => ({ default: m.BulkReportGenerator })), 'lazy:analytics-bulk-report'));
const HealthModelViewer           = lazy(lazyWithRetry(() => import('@/components/admin/HealthModelViewer').then(m => ({ default: m.HealthModelViewer })), 'lazy:admin-health'));
const AdminExternalMentorsManager = lazy(lazyWithRetry(() => import('@/components/admin/AdminExternalMentorsManager').then(m => ({ default: m.AdminExternalMentorsManager })), 'lazy:admin-mentors'));
const AdminSupportMaterialsManager= lazy(lazyWithRetry(() => import('@/components/admin/AdminSupportMaterialsManager').then(m => ({ default: m.AdminSupportMaterialsManager })), 'lazy:admin-support-materials'));
const AdminSurveysManager         = lazy(lazyWithRetry(() => import('@/components/admin/AdminSurveysManager').then(m => ({ default: m.AdminSurveysManager })), 'lazy:admin-surveys'));
const DataQualityDashboard        = lazy(lazyWithRetry(() => import('@/components/admin/DataQualityDashboard').then(m => ({ default: m.DataQualityDashboard })), 'lazy:admin-data-quality'));
const AdminProgramsManager        = lazy(lazyWithRetry(() => import('@/components/admin/AdminProgramsManager').then(m => ({ default: m.AdminProgramsManager })), 'lazy:admin-programs'));
const EnrollmentControlCenter     = lazy(lazyWithRetry(() => import('@/components/admin/EnrollmentControlCenter').then(m => ({ default: m.EnrollmentControlCenter })), 'lazy:admin-enrollment'));
const SystemHealthDashboard       = lazy(lazyWithRetry(() => import('@/components/admin/SystemHealthDashboard').then(m => ({ default: m.SystemHealthDashboard })), 'lazy:admin-system-health'));

const TabFallback = () => (
  <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">…</div>
);

// P0 fix: `enrollment` (EnrollmentControlCenter) exposes the global open_registration
// toggle and other admin-only controls. Consultores must not see this tab.
// P4: broaden to match RLS — backoffice/announcements/compliance/health/mentors/template-requests
// require is_admin() at the data layer, so hide their tabs from non-admin staff to avoid
// dead-end UI that renders empty or throws on mutations.
const ADMIN_ONLY_TABS = new Set([
  'users',
  'data-quality',
  'system-health',
  'enrollment',
  'announcements',
  'compliance',
  'health',
  'mentors',
  'template-requests',
  // P2.9: every write on survey_* is is_admin() at the data layer.
  'surveys',
]);

// Tabs that require any staff role (admin, consultor, backoffice) but not
// admin-only. `backoffice` (contracts / pricing / spaces) is one of those:
// backoffice operators need it, admins too. Consultants stay locked out.
const STAFF_ONLY_TABS = new Set(['backoffice']);

const TAB_GROUPS_BASE: Record<string, string[]> = {
  operations: ['approvals', 'enrollment', 'backoffice', 'announcements'],
  programs: ['programs-setup', 'kpis', 'templates', 'template-requests', 'support-materials', 'surveys'],
  reports: ['analytics', 'health', 'compliance', 'data-quality', 'system-health'],
  users: ['users', 'mentors'],
};

export default function Admin() {
  const { t } = useTranslation();
  const { isAdmin, isBackoffice } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const TAB_GROUPS = useMemo(() => {
    const filtered: Record<string, string[]> = {};
    for (const [group, tabs] of Object.entries(TAB_GROUPS_BASE)) {
      const visibleTabs = tabs.filter(tab => {
        if (ADMIN_ONLY_TABS.has(tab)) return isAdmin;
        if (STAFF_ONLY_TABS.has(tab)) return isAdmin || isBackoffice;
        return true;
      });
      if (visibleTabs.length > 0) filtered[group] = visibleTabs;
    }
    return filtered;
  }, [isAdmin, isBackoffice]);


  const validTabs = useMemo(() => {
    const tabs = new Set<string>();
    for (const groupTabs of Object.values(TAB_GROUPS)) {
      groupTabs.forEach((tab) => tabs.add(tab));
    }
    return tabs;
  }, [TAB_GROUPS]);

  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = searchParams.get('tab');
    return fromUrl && validTabs.has(fromUrl) ? fromUrl : 'approvals';
  });

  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl && validTabs.has(fromUrl) && fromUrl !== activeTab) {
      setActiveTab(fromUrl);
      return;
    }

    if (!fromUrl && activeTab !== 'approvals') {
      setActiveTab('approvals');
    }
  }, [searchParams, validTabs]);

  const setActiveTabAndUrl = (tab: string) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: false });
  };

  const getTabIcon = (tab: string) => {
    const icons: Record<string, React.ReactNode> = {
      approvals: <Clock className="h-4 w-4" />,
      enrollment: <UserPlus className="h-4 w-4" />,
      compliance: <ShieldCheck className="h-4 w-4" />,
      backoffice: <Building2 className="h-4 w-4" />,
      announcements: <Bell className="h-4 w-4" />,
      'data-quality': <Database className="h-4 w-4" />,
      users: <Users className="h-4 w-4" />,
      mentors: <Users2 className="h-4 w-4" />,
      'programs-setup': <Building2 className="h-4 w-4" />,
      kpis: <BarChart3 className="h-4 w-4" />,
      templates: <FileText className="h-4 w-4" />,
      'support-materials': <BookOpen className="h-4 w-4" />,
      surveys: <ClipboardList className="h-4 w-4" />,
      analytics: <TrendingUp className="h-4 w-4" />,
      health: <Heart className="h-4 w-4" />,
      'system-health': <Activity className="h-4 w-4" />,

    };
    return icons[tab];
  };

  const getTabLabel = (tab: string) => {
    const labels: Record<string, string> = {
      approvals: t('admin.approvals'),
      enrollment: t('admin.directory.enrollmentLabel', { defaultValue: 'Enrollment & Claims' }),
      compliance: t('admin.compliance'),
      backoffice: t('admin.backoffice.tab'),
      announcements: t('admin.announcements.tab'),
      'data-quality': t('dataQuality.title'),
      users: t('admin.users'),
      mentors: t('admin.externalMentors'),
      'programs-setup': t('admin.programsSetup'),
      kpis: t('admin.kpis'),
      templates: t('admin.templates'),
      'template-requests': t('templateRequests.adminTitle', { defaultValue: 'Pedidos de Template' }),
      'support-materials': t('admin.supportMaterials.title'),
      surveys: t('admin.surveys.title'),
      analytics: t('admin.analytics'),
      health: t('admin.healthModels'),
      'system-health': t('admin.systemHealth.tab', { defaultValue: 'Saúde do Sistema' }),

    };
    return labels[tab] || tab;
  };

  const getGroupLabel = (group: string) => {
    const labels: Record<string, string> = {
      operations: t('admin.groups.operations'),
      crm: t('nav.crm', { defaultValue: 'CRM' }),
      programs: t('admin.groups.programs'),
      reports: t('admin.groups.reports'),
      users: t('admin.groups.users'),
    };
    return labels[group] || group;
  };

  const activeGroup = useMemo(() => {
    for (const [group, tabs] of Object.entries(TAB_GROUPS)) {
      if (tabs.includes(activeTab as any)) return group;
    }
    return 'operations';
  }, [TAB_GROUPS, activeTab]);

  return (
    <AppLayout title={t('ecosystemHub.title', { defaultValue: 'Hub de Gestão' })} subtitle={t('ecosystemHub.subtitle', { defaultValue: 'Gerir startups, mentores, programas e fluxos operacionais' })}>
      <EcosystemPulseCard />
      <AdminMissionControlDirectory />

      <Tabs value={activeTab} onValueChange={setActiveTabAndUrl} className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b">
          {Object.entries(TAB_GROUPS).map(([group, tabs]) => (
            <DropdownMenu key={group} modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeGroup === group ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5"
                >
                  {getGroupLabel(group)}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {tabs.map((tab) => (
                  <DropdownMenuItem
                    key={tab}
                    onClick={() => setActiveTabAndUrl(tab)}
                    className={activeTab === tab ? 'bg-accent' : ''}
                  >
                    <span className="flex items-center gap-2">
                      {getTabIcon(tab)}
                      {getTabLabel(tab)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{getTabIcon(activeTab)}</span>
          <span className="font-medium text-foreground">{getTabLabel(activeTab)}</span>
        </div>

        <TabsContent value="approvals">
          <Suspense fallback={<TabFallback />}><PendingApprovalsManager /></Suspense>
        </TabsContent>

        <TabsContent value="enrollment">
          <Suspense fallback={<TabFallback />}><EnrollmentControlCenter /></Suspense>
        </TabsContent>

        <TabsContent value="compliance">
          <Suspense fallback={<TabFallback />}><ComplianceDashboard /></Suspense>
        </TabsContent>

        <TabsContent value="backoffice">
          <Suspense fallback={<TabFallback />}><AdminBackoffice /></Suspense>
        </TabsContent>

        <TabsContent value="announcements">
          <Suspense fallback={<TabFallback />}><AdminAnnouncementsManager /></Suspense>
        </TabsContent>

        <TabsContent value="data-quality">
          <Suspense fallback={<TabFallback />}><DataQualityDashboard /></Suspense>
        </TabsContent>

        <TabsContent value="users">
          <Suspense fallback={<TabFallback />}><AdminUsersManager /></Suspense>
        </TabsContent>

        <TabsContent value="mentors">
          <Suspense fallback={<TabFallback />}><AdminExternalMentorsManager /></Suspense>
        </TabsContent>

        <TabsContent value="programs-setup">
          <Suspense fallback={<TabFallback />}><AdminProgramsManager /></Suspense>
        </TabsContent>

        <TabsContent value="kpis">
          <Suspense fallback={<TabFallback />}><AdminKpisManager /></Suspense>
        </TabsContent>

        <TabsContent value="templates">
          <Suspense fallback={<TabFallback />}><AdminTemplatesManager /></Suspense>
        </TabsContent>

        <TabsContent value="template-requests">
          <Suspense fallback={<TabFallback />}><AdminTemplateRequestsManager /></Suspense>
        </TabsContent>

        <TabsContent value="support-materials">
          <Suspense fallback={<TabFallback />}><AdminSupportMaterialsManager /></Suspense>
        </TabsContent>

        <TabsContent value="analytics">
          <Suspense fallback={<TabFallback />}>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CohortAnalytics />
              </div>
              <div>
                <BulkReportGenerator />
              </div>
            </div>
          </Suspense>
        </TabsContent>

        <TabsContent value="health">
          <Suspense fallback={<TabFallback />}><HealthModelViewer /></Suspense>
        </TabsContent>

        <TabsContent value="surveys">
          <Suspense fallback={<TabFallback />}><AdminSurveysManager /></Suspense>
        </TabsContent>

        <TabsContent value="system-health">
          <Suspense fallback={<TabFallback />}><SystemHealthDashboard /></Suspense>
        </TabsContent>



        {/* CRM/Funnel content moved to dedicated /crm page */}
      </Tabs>
    </AppLayout>
  );
}
