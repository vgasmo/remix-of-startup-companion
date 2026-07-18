import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Clock, ShieldCheck, Building2, Bell, Database, Users, Users2,
  BarChart3, FileText, BookOpen, Heart, Filter, GitBranch, 
  ClipboardList, UserPlus, ChevronDown, ChevronRight, Globe2, Activity
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DirectoryItem {
  tab: string;
  label: string;
  icon: React.ElementType;
  description: string;
  group: string;
}

export function AdminMissionControlDirectory() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = searchParams.get('tab');
  const [isExpanded, setIsExpanded] = useState(!activeTab || activeTab === 'approvals');

  const items: (DirectoryItem & { route?: string })[] = [
    { tab: 'ecosystem', label: t('admin.directory.ecosystemLabel', { defaultValue: 'Startups & Workspaces' }), icon: Globe2, description: t('admin.directory.ecosystemDesc', { defaultValue: 'Gestão do ecossistema' }), group: 'operations', route: '/ecosystem' },
    { tab: 'approvals', label: t('admin.approvals'), icon: Clock, description: t('admin.directory.approvalsDesc', { defaultValue: 'Pedidos pendentes de aprovação' }), group: 'operations' },
    { tab: 'enrollment', label: t('admin.directory.enrollmentLabel', { defaultValue: 'Enrollment & Claims' }), icon: UserPlus, description: t('admin.directory.enrollmentDesc', { defaultValue: 'Controlo de inscrições e claims' }), group: 'operations' },
    { tab: 'backoffice', label: t('admin.backoffice.tab'), icon: Building2, description: t('admin.directory.backofficeDesc', { defaultValue: 'Contratos, espaços e operações' }), group: 'operations' },
    { tab: 'announcements', label: t('admin.announcements.tab'), icon: Bell, description: t('admin.directory.announcementsDesc', { defaultValue: 'Comunicados e avisos ao ecossistema' }), group: 'operations' },
    { tab: 'funnel', label: t('admin.directory.crmLabel', { defaultValue: 'CRM & Pipeline' }), icon: Filter, description: t('admin.directory.funnelDesc', { defaultValue: 'Pipeline CRM e leads' }), group: 'crm', route: '/crm' },
    { tab: 'programs-setup', label: t('admin.programsSetup'), icon: Building2, description: t('admin.directory.programsDesc', { defaultValue: 'Programas de aceleração' }), group: 'programs' },
    { tab: 'templates', label: t('admin.templates'), icon: FileText, description: t('admin.directory.templatesDesc', { defaultValue: 'Templates de sessão e documentos' }), group: 'programs' },
    { tab: 'support-materials', label: t('admin.supportMaterials.title'), icon: BookOpen, description: t('admin.directory.supportDesc', { defaultValue: 'Materiais de apoio partilhados' }), group: 'programs' },
    { tab: 'kpis', label: t('admin.kpis'), icon: BarChart3, description: t('admin.directory.kpisDesc', { defaultValue: 'Definições de KPI e métricas' }), group: 'programs' },
    { tab: 'surveys', label: t('admin.surveys.title'), icon: ClipboardList, description: t('admin.directory.surveysDesc', { defaultValue: 'Inquéritos e formulários' }), group: 'programs' },
    { tab: 'users', label: t('admin.users'), icon: Users, description: t('admin.directory.usersDesc', { defaultValue: 'Gestão de utilizadores' }), group: 'users' },
    { tab: 'mentors', label: t('admin.externalMentors'), icon: Users2, description: t('admin.directory.mentorsDesc', { defaultValue: 'Mentores externos e atribuição' }), group: 'users' },
    { tab: 'compliance', label: t('admin.compliance'), icon: ShieldCheck, description: t('admin.directory.complianceDesc', { defaultValue: 'Check-ins e conformidade' }), group: 'reports' },
    { tab: 'data-quality', label: t('dataQuality.title'), icon: Database, description: t('admin.directory.dataQualityDesc', { defaultValue: 'Integridade e qualidade dos dados' }), group: 'reports' },
    { tab: 'analytics', label: t('admin.analytics'), icon: BarChart3, description: t('admin.directory.analyticsDesc', { defaultValue: 'Análises de cohort e relatórios' }), group: 'reports' },
    { tab: 'health', label: t('admin.healthModels'), icon: Heart, description: t('admin.directory.healthDesc', { defaultValue: 'Modelos de saúde do ecossistema' }), group: 'reports' },
    { tab: 'system-health', label: t('admin.systemHealth.tab', { defaultValue: 'Saúde do Sistema' }), icon: Activity, description: t('admin.directory.systemHealthDesc', { defaultValue: 'Automações agendadas, cron e alertas' }), group: 'reports' },
  ];

  const handleNavigate = (tab: string, route?: string) => {
    if (route) {
      navigate(route);
      return;
    }
    setSearchParams({ tab }, { replace: true });
    setIsExpanded(false);
  };

  const groupOrder = ['operations', 'crm', 'programs', 'users', 'reports'];
  const groupLabels: Record<string, string> = {
    operations: t('admin.directory.groupOps', { defaultValue: 'Operações' }),
    crm: t('admin.directory.groupCrm', { defaultValue: 'CRM & Pipeline' }),
    programs: t('admin.directory.groupPrograms', { defaultValue: 'Programas & Conteúdos' }),
    users: t('admin.directory.groupUsers', { defaultValue: 'Pessoas' }),
    reports: t('admin.directory.groupReports', { defaultValue: 'Relatórios & Saúde' }),
  };

  // Find the active item for the collapsed header
  const activeItem = items.find(i => i.tab === activeTab);

  return (
    <Card className="rounded-2xl border-border/60 mb-6">
      <CardContent className="p-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full group"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              {t('admin.directory.title', { defaultValue: 'Mission Control' })}
            </p>
            {!isExpanded && activeItem && (
              <span className="text-xs text-foreground font-medium bg-muted/60 px-2 py-0.5 rounded-md">
                {activeItem.label}
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-4">
            {groupOrder.map(group => {
              const groupItems = items.filter(i => i.group === group);
              if (groupItems.length === 0) return null;
              return (
                <div key={group} className="mb-3 last:mb-0">
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium mb-1.5 pl-1">
                    {groupLabels[group]}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                    {groupItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.tab;
                      return (
                        <button
                          key={item.tab}
                          onClick={() => handleNavigate(item.tab, (item as any).route)}
                          className={cn(
                            'flex flex-col items-start gap-0.5 p-2.5 rounded-xl border text-left',
                            'hover:bg-muted/60 hover:border-border/80 transition-all duration-150',
                            'focus:outline-none focus:ring-2 focus:ring-primary/20',
                            isActive
                              ? 'border-primary/30 bg-primary/5'
                              : 'border-border/40'
                          )}
                        >
                          <Icon className={cn(
                            'h-3.5 w-3.5 mb-0.5',
                            isActive ? 'text-primary' : 'text-primary/70'
                          )} />
                          <span className="text-xs font-medium leading-tight">{item.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-tight line-clamp-1">{item.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}