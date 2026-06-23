import { useEffect, useMemo, useState } from 'react';
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
import { AdminTemplatesManager } from '@/components/admin/AdminTemplatesManager';
import { AdminTemplateRequestsManager } from '@/components/admin/AdminTemplateRequestsManager';
import { AdminUsersManager } from '@/components/admin/AdminUsersManager';
import { AdminKpisManager } from '@/components/admin/AdminKpisManager';
import { AdminBackoffice } from '@/components/admin/AdminBackoffice';
import { AdminAnnouncementsManager } from '@/components/admin/AdminAnnouncementsManager';
import { PendingApprovalsManager } from '@/components/admin/PendingApprovalsManager';
import { ComplianceDashboard } from '@/components/admin/ComplianceDashboard';
import { CohortAnalytics } from '@/components/analytics/CohortAnalytics';
import { BulkReportGenerator } from '@/components/analytics/BulkReportGenerator';
import { HealthModelViewer } from '@/components/admin/HealthModelViewer';
import { AdminExternalMentorsManager } from '@/components/admin/AdminExternalMentorsManager';
import { AdminSupportMaterialsManager } from '@/components/admin/AdminSupportMaterialsManager';
import { AdminSurveysManager } from '@/components/admin/AdminSurveysManager';
import { DataQualityDashboard } from '@/components/admin/DataQualityDashboard';
import { AdminProgramsManager } from '@/components/admin/AdminProgramsManager';
import { AdminMissionControlDirectory } from '@/components/admin/AdminMissionControlDirectory';
import { EnrollmentControlCenter } from '@/components/admin/EnrollmentControlCenter';
import { EcosystemPulseCard } from '@/components/admin/EcosystemPulseCard';
import { SystemHealthDashboard } from '@/components/admin/SystemHealthDashboard';

const ADMIN_ONLY_TABS = new Set(['users', 'data-quality', 'system-health']);

const TAB_GROUPS_BASE: Record<string, string[]> = {
  operations: ['approvals', 'enrollment', 'backoffice', 'announcements'],
  // CRM is accessed directly via /crm (no inline tab)
  programs: ['programs-setup', 'kpis', 'templates', 'template-requests', 'support-materials', 'surveys'],
  reports: ['analytics', 'health', 'compliance', 'data-quality', 'system-health'],
  users: ['users', 'mentors'],
};

export default function Admin() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const TAB_GROUPS = useMemo(() => {
    const filtered: Record<string, string[]> = {};
    for (const [group, tabs] of Object.entries(TAB_GROUPS_BASE)) {
      const visibleTabs = tabs.filter(tab => isAdmin || !ADMIN_ONLY_TABS.has(tab));
      if (visibleTabs.length > 0) filtered[group] = visibleTabs;
    }
    return filtered;
  }, [isAdmin]);

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
          <PendingApprovalsManager />
        </TabsContent>

        <TabsContent value="enrollment">
          <EnrollmentControlCenter />
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceDashboard />
        </TabsContent>

        <TabsContent value="backoffice">
          <AdminBackoffice />
        </TabsContent>

        <TabsContent value="announcements">
          <AdminAnnouncementsManager />
        </TabsContent>

        <TabsContent value="data-quality">
          <DataQualityDashboard />
        </TabsContent>

        <TabsContent value="users">
          <AdminUsersManager />
        </TabsContent>

        <TabsContent value="mentors">
          <AdminExternalMentorsManager />
        </TabsContent>

        <TabsContent value="programs-setup">
          <AdminProgramsManager />
        </TabsContent>

        <TabsContent value="kpis">
          <AdminKpisManager />
        </TabsContent>

        <TabsContent value="templates">
          <AdminTemplatesManager />
        </TabsContent>

        <TabsContent value="template-requests">
          <AdminTemplateRequestsManager />
        </TabsContent>

        <TabsContent value="support-materials">
          <AdminSupportMaterialsManager />
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CohortAnalytics />
            </div>
            <div>
              <BulkReportGenerator />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="health">
          <HealthModelViewer />
        </TabsContent>

        <TabsContent value="surveys">
          <AdminSurveysManager />
        </TabsContent>

        <TabsContent value="system-health">
          <SystemHealthDashboard />
        </TabsContent>



        {/* CRM/Funnel content moved to dedicated /crm page */}
      </Tabs>
    </AppLayout>
  );
}
