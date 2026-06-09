import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Building2, 
  Target, 
  Calendar, 
  CheckSquare, 
  FileText, 
  Network,
  Briefcase,
  BarChart3,
  Contact,
  GraduationCap,
  Home,
  UserCircle,
  NotebookPen,
  Shield,
  Cog,
  Lightbulb,
  ArrowRight,
  Rocket,
  Users,
  TrendingUp,
  Star,
  AlertTriangle,
  MessageCircle,
  Stethoscope,
  ClipboardCheck,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface GuideSection {
  icon: React.ElementType;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
}

interface RoleGuide {
  id: string;
  titleKey: string;
  titleDefault: string;
  taglineKey: string;
  taglineDefault: string;
  color: string;
  icon: React.ElementType;
  missionKey: string;
  missionDefault: string;
  quickStartKeys: { key: string; default: string }[];
  navigation: GuideSection[];
  tipsKeys: { key: string; default: string }[];
  gotchasKeys: { key: string; default: string }[];
}

const ROLE_GUIDES: RoleGuide[] = [
  {
    id: 'founder',
    titleKey: 'guide.founder.title',
    titleDefault: 'Founder OS',
    taglineKey: 'guide.founder.tagline',
    taglineDefault: 'For Entrepreneurs',
    color: 'text-[hsl(var(--success))]',
    icon: Rocket,
    missionKey: 'guide.founder.mission',
    missionDefault: 'Your daily command center. Focus on what matters today to grow tomorrow.',
    quickStartKeys: [
      { key: 'guide.founder.qs1', default: '1. Complete the Onboarding Wizard (NDA, company info, program)' },
      { key: 'guide.founder.qs2', default: '2. Set your Milestones — strategic progress markers for your startup' },
      { key: 'guide.founder.qs3', default: '3. Create Actions from each milestone with clear deadlines' },
      { key: 'guide.founder.qs4', default: '4. Configure KPIs and update them weekly (MRR, users, runway, etc.)' },
      { key: 'guide.founder.qs5', default: '5. Upload documents and evidence to prepare for investors' },
      { key: 'guide.founder.qs6', default: '6. Schedule sessions with your consultant or request mentoring when blocked' },
    ],
    navigation: [
      { icon: Home, titleKey: 'guide.founder.nav.home', titleDefault: 'Home', descKey: 'guide.founder.nav.homeDesc', descDefault: 'Your daily panel with "Focus Today" — priority actions, next steps, and quick KPI overview' },
      { icon: Building2, titleKey: 'guide.founder.nav.startup', titleDefault: 'My Startup', descKey: 'guide.founder.nav.startupDesc', descDefault: 'Startup overview: team, health score, progress, milestones, and AI-powered status updates' },
      { icon: Target, titleKey: 'guide.founder.nav.kpis', titleDefault: 'Goals & KPIs', descKey: 'guide.founder.nav.kpisDesc', descDefault: 'Track key metrics: MRR, users, runway, etc. Submit weekly check-ins with trend indicators' },
      { icon: Calendar, titleKey: 'guide.founder.nav.sessions', titleDefault: 'Sessions & Mentoring', descKey: 'guide.founder.nav.sessionsDesc', descDefault: 'Schedule and review sessions with consultants and mentors. Generate AI summaries after each session' },
      { icon: CheckSquare, titleKey: 'guide.founder.nav.actions', titleDefault: 'Actions & Plan', descKey: 'guide.founder.nav.actionsDesc', descDefault: 'Task list and milestones with deadlines, priorities, and completion tracking' },
      { icon: FileText, titleKey: 'guide.founder.nav.docs', titleDefault: 'Documents', descKey: 'guide.founder.nav.docsDesc', descDefault: 'Pitch decks, contracts, financial models, and important files. Includes AI analysis and Dataroom for investors' },
      { icon: Network, titleKey: 'guide.founder.nav.network', titleDefault: 'Network & Resources', descKey: 'guide.founder.nav.networkDesc', descDefault: 'Connect with mentors, browse expertise areas, and access curated resources and playbooks' },
      { icon: MessageCircle, titleKey: 'guide.founder.nav.messaging', titleDefault: 'Messaging', descKey: 'guide.founder.nav.messagingDesc', descDefault: 'Direct chat with your consultant, mentors, and team. Supports text and attachments' },
    ],
    tipsKeys: [
      { key: 'guide.founder.tip1', default: '🎯 Focus on 1-3 actions per day, no more' },
      { key: 'guide.founder.tip2', default: '📊 Update KPIs weekly to see trends and get better consultant support' },
      { key: 'guide.founder.tip3', default: '📅 Schedule sessions regularly — consistency is key to progress' },
      { key: 'guide.founder.tip4', default: '📝 Document learnings after each session while they are fresh' },
      { key: 'guide.founder.tip5', default: '💼 Keep your Dataroom updated — investors check it before meetings' },
      { key: 'guide.founder.tip6', default: '🤖 Use AI summaries after sessions to capture actions automatically' },
    ],
    gotchasKeys: [
      { key: 'guide.founder.gotcha1', default: '⚠️ Don\'t skip the weekly check-in — it signals engagement to your consultant' },
      { key: 'guide.founder.gotcha2', default: '⚠️ Upload your financial model early — AI analysis takes a few minutes' },
      { key: 'guide.founder.gotcha3', default: '⚠️ Expired Dataroom links show "Access Denied" — renew before investor meetings' },
    ],
  },
  {
    id: 'consultor',
    titleKey: 'guide.consultor.title',
    titleDefault: 'Portfolio OS',
    taglineKey: 'guide.consultor.tagline',
    taglineDefault: 'For Consultants',
    color: 'text-[hsl(var(--info))]',
    icon: Briefcase,
    missionKey: 'guide.consultor.mission',
    missionDefault: 'Manage your startup portfolio. Identify risks, prioritize attention, maximize impact.',
    quickStartKeys: [
      { key: 'guide.consultor.qs1', default: '1. Check your Cockpit — startups at risk appear first' },
      { key: 'guide.consultor.qs2', default: '2. Review weekly check-ins from your portfolio' },
      { key: 'guide.consultor.qs3', default: '3. Prepare sessions with Session Frameworks' },
      { key: 'guide.consultor.qs4', default: '4. Validate pending KPIs and action completions' },
      { key: 'guide.consultor.qs5', default: '5. Monitor the CRM pipeline for new leads' },
      { key: 'guide.consultor.qs6', default: '6. Use AI session summaries to save time on notes' },
    ],
    navigation: [
      { icon: Briefcase, titleKey: 'guide.consultor.nav.portfolio', titleDefault: 'Portfolio', descKey: 'guide.consultor.nav.portfolioDesc', descDefault: 'Dashboard with startups prioritized by risk and need for attention. Health scores and trend indicators at a glance' },
      { icon: Building2, titleKey: 'guide.consultor.nav.startups', titleDefault: 'Startups', descKey: 'guide.consultor.nav.startupsDesc', descDefault: 'Complete list of assigned startups with quick access to KPIs, milestones, and session history' },
      { icon: Calendar, titleKey: 'guide.consultor.nav.sessions', titleDefault: 'Sessions', descKey: 'guide.consultor.nav.sessionsDesc', descDefault: 'Weekly schedule, session preparation with frameworks (Value Prop, Quality Gates), and AI note generation' },
      { icon: CheckSquare, titleKey: 'guide.consultor.nav.actions', titleDefault: 'Actions & Follow-ups', descKey: 'guide.consultor.nav.actionsDesc', descDefault: 'Pending actions and follow-ups per startup. Track completion rates across your portfolio' },
      { icon: Contact, titleKey: 'guide.consultor.nav.crm', titleDefault: 'CRM & Pipeline', descKey: 'guide.consultor.nav.crmDesc', descDefault: 'Lead management with drag-and-drop stages. Track deal values, conversion forecasts, and intake flow' },
      { icon: GraduationCap, titleKey: 'guide.consultor.nav.programs', titleDefault: 'Programs', descKey: 'guide.consultor.nav.programsDesc', descDefault: 'Program and cohort configuration: milestones, KPIs, session templates, and progress tracking' },
      { icon: BarChart3, titleKey: 'guide.consultor.nav.reports', titleDefault: 'Reports', descKey: 'guide.consultor.nav.reportsDesc', descDefault: 'Aggregated analytics: KPI evolution, action rates, stage distribution, cohort comparison. CSV export available' },
      { icon: BookOpen, titleKey: 'guide.consultor.nav.tools', titleDefault: 'Consultant Tools', descKey: 'guide.consultor.nav.toolsDesc', descDefault: 'Playbook library, exercise catalog, and session framework builder for structured coaching' },
    ],
    tipsKeys: [
      { key: 'guide.consultor.tip1', default: '🔴 Prioritize "at risk" startups at the start of each day' },
      { key: 'guide.consultor.tip2', default: '📞 Schedule follow-ups at the end of every session' },
      { key: 'guide.consultor.tip3', default: '📊 Use session frameworks for consistency across your portfolio' },
      { key: 'guide.consultor.tip4', default: '🎯 Set stage-specific KPIs for each startup' },
      { key: 'guide.consultor.tip5', default: '🤖 Review AI-generated session summaries before saving' },
      { key: 'guide.consultor.tip6', default: '📋 Use the CRM pipeline weekly to track lead conversion' },
    ],
    gotchasKeys: [
      { key: 'guide.consultor.gotcha1', default: '⚠️ Startups without check-ins for 2+ weeks get flagged — follow up proactively' },
      { key: 'guide.consultor.gotcha2', default: '⚠️ Health scores update after KPI submissions — stale data means stale scores' },
      { key: 'guide.consultor.gotcha3', default: '⚠️ CRM stage changes trigger automated emails if rules are configured' },
    ],
  },
  {
    id: 'mentor',
    titleKey: 'guide.mentor.title',
    titleDefault: 'Mentor Companion',
    taglineKey: 'guide.mentor.tagline',
    taglineDefault: 'For External Mentors',
    color: 'text-primary',
    icon: Star,
    missionKey: 'guide.mentor.mission',
    missionDefault: 'Share your expertise. Support assigned startups and maximize your impact.',
    quickStartKeys: [
      { key: 'guide.mentor.qs1', default: '1. Sign the NDA during onboarding' },
      { key: 'guide.mentor.qs2', default: '2. Complete your profile: expertise areas, availability, and bio' },
      { key: 'guide.mentor.qs3', default: '3. Accept incoming mentoring requests' },
      { key: 'guide.mentor.qs4', default: '4. Review startup context before each session (health, KPIs, milestones)' },
      { key: 'guide.mentor.qs5', default: '5. Record session notes and create actionable takeaways' },
    ],
    navigation: [
      { icon: Home, titleKey: 'guide.mentor.nav.home', titleDefault: 'Home', descKey: 'guide.mentor.nav.homeDesc', descDefault: 'Summary of upcoming sessions, assigned startups, and pending mentoring requests' },
      { icon: Calendar, titleKey: 'guide.mentor.nav.sessions', titleDefault: 'Upcoming Sessions', descKey: 'guide.mentor.nav.sessionsDesc', descDefault: 'Scheduled sessions with dates, times, and startup context. Prepare by reviewing health and KPIs' },
      { icon: Building2, titleKey: 'guide.mentor.nav.startups', titleDefault: 'Assigned Startups', descKey: 'guide.mentor.nav.startupsDesc', descDefault: 'Startups with active mentoring. See health score, recent KPIs, and milestones for each' },
      { icon: NotebookPen, titleKey: 'guide.mentor.nav.notes', titleDefault: 'Notes & Actions', descKey: 'guide.mentor.nav.notesDesc', descDefault: 'Session notes, action items, and follow-ups. Generate actions directly from notes' },
      { icon: Network, titleKey: 'guide.mentor.nav.resources', titleDefault: 'Resources', descKey: 'guide.mentor.nav.resourcesDesc', descDefault: 'Resource library, frameworks, and connections to other mentors in the ecosystem' },
      { icon: UserCircle, titleKey: 'guide.mentor.nav.profile', titleDefault: 'Profile', descKey: 'guide.mentor.nav.profileDesc', descDefault: 'Your expertise areas, availability calendar, bio, and settings' },
    ],
    tipsKeys: [
      { key: 'guide.mentor.tip1', default: '🕐 Set fixed availability slots so startups can self-book' },
      { key: 'guide.mentor.tip2', default: '📝 Record notes immediately after sessions — details fade quickly' },
      { key: 'guide.mentor.tip3', default: '🎯 Focus on 2-3 key takeaways per session for maximum impact' },
      { key: 'guide.mentor.tip4', default: '🤝 Be specific and actionable in the tasks you define' },
      { key: 'guide.mentor.tip5', default: '📊 Check the startup health score before each session for context' },
    ],
    gotchasKeys: [
      { key: 'guide.mentor.gotcha1', default: '⚠️ You see limited data — only what\'s needed for effective mentoring' },
      { key: 'guide.mentor.gotcha2', default: '⚠️ Accept or decline requests promptly — startups are waiting for help' },
      { key: 'guide.mentor.gotcha3', default: '⚠️ Session notes are visible to the startup and consultant — be constructive' },
    ],
  },
  {
    id: 'admin',
    titleKey: 'guide.admin.title',
    titleDefault: 'Ops & Compliance',
    taglineKey: 'guide.admin.tagline',
    taglineDefault: 'For Administrators',
    color: 'text-[hsl(var(--warning))]',
    icon: Shield,
    missionKey: 'guide.admin.mission',
    missionDefault: 'Ensure ecosystem operations. Manage users, programs, and system configuration.',
    quickStartKeys: [
      { key: 'guide.admin.qs1', default: '1. Review and approve pending user accounts' },
      { key: 'guide.admin.qs2', default: '2. Create or assign workspaces to approved founders' },
      { key: 'guide.admin.qs3', default: '3. Configure programs, cohorts, and default milestones' },
      { key: 'guide.admin.qs4', default: '4. Set up integrations (Microsoft Graph, email)' },
      { key: 'guide.admin.qs5', default: '5. Configure feature flags and system settings' },
      { key: 'guide.admin.qs6', default: '6. Monitor data quality and user activity via diagnostics' },
    ],
    navigation: [
      { icon: Briefcase, titleKey: 'guide.admin.nav.ops', titleDefault: 'Operations', descKey: 'guide.admin.nav.opsDesc', descDefault: 'Operational dashboard with key metrics: active startups, pending approvals, session activity, and system health' },
      { icon: Contact, titleKey: 'guide.admin.nav.crm', titleDefault: 'CRM', descKey: 'guide.admin.nav.crmDesc', descDefault: 'Full CRM pipeline with intake management, lead tracking, and automated stage email rules' },
      { icon: GraduationCap, titleKey: 'guide.admin.nav.programs', titleDefault: 'Programs & Cohorts', descKey: 'guide.admin.nav.programsDesc', descDefault: 'Create and configure incubation programs: milestones, KPIs, session templates, and cohort management' },
      { icon: BarChart3, titleKey: 'guide.admin.nav.reports', titleDefault: 'Reports', descKey: 'guide.admin.nav.reportsDesc', descDefault: 'Analytics, data export, and ecosystem-wide reporting. KPI aggregation and cohort comparison' },
      { icon: Users, titleKey: 'guide.admin.nav.users', titleDefault: 'Users & Permissions', descKey: 'guide.admin.nav.usersDesc', descDefault: 'User management: approve accounts, assign roles, create workspaces, and manage team memberships' },
      { icon: ClipboardCheck, titleKey: 'guide.admin.nav.approvals', titleDefault: 'Approvals', descKey: 'guide.admin.nav.approvalsDesc', descDefault: 'Pending account approvals with email-based company suggestions for workspace matching' },
      { icon: Cog, titleKey: 'guide.admin.nav.settings', titleDefault: 'System Settings', descKey: 'guide.admin.nav.settingsDesc', descDefault: 'Feature flags, incubation types, buildings/spaces, pricing tables, and integration configuration' },
      { icon: Stethoscope, titleKey: 'guide.admin.nav.diagnostics', titleDefault: 'Diagnostics', descKey: 'guide.admin.nav.diagnosticsDesc', descDefault: 'Activity logs, system health, data quality checks, and troubleshooting tools' },
    ],
    tipsKeys: [
      { key: 'guide.admin.tip1', default: '🔒 Review user permissions and roles regularly' },
      { key: 'guide.admin.tip2', default: '📊 Monitor data quality weekly with diagnostics' },
      { key: 'guide.admin.tip3', default: '⚙️ Test integrations in a sandbox before activating for all users' },
      { key: 'guide.admin.tip4', default: '📋 Document processes and decisions for the team' },
      { key: 'guide.admin.tip5', default: '🏢 Keep building/space assignments up-to-date for accurate billing' },
      { key: 'guide.admin.tip6', default: '🚩 Use feature flags to roll out new features gradually' },
    ],
    gotchasKeys: [
      { key: 'guide.admin.gotcha1', default: '⚠️ Deleting a user is irreversible — deactivate instead when possible' },
      { key: 'guide.admin.gotcha2', default: '⚠️ Workspace creation triggers onboarding — confirm program first' },
      { key: 'guide.admin.gotcha3', default: '⚠️ Feature flag changes apply immediately — no deploy needed' },
    ],
  },
];

export default function QuickGuide() {
  const { t } = useTranslation();
  const { roles, isAdmin, isConsultor, isMentor, isAuthReady } = useAuth();
  const isFounder = roles.includes('founder');
  const isStaff = isAdmin || isConsultor;

  if (!isAuthReady) {
    return (
      <AppLayout title={t('guide.title', { defaultValue: 'Quick Guide' })}>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  const getDefaultTab = () => {
    if (isFounder && !isStaff) return 'founder';
    if (isMentor && !isStaff && !isFounder) return 'mentor';
    if (isAdmin) return 'admin';
    if (isConsultor) return 'consultor';
    return 'founder';
  };

  const getVisibleGuides = (): RoleGuide[] => {
    if (isAdmin) return ROLE_GUIDES;
    if (isConsultor && !isAdmin) return ROLE_GUIDES.filter(g => ['consultor', 'founder'].includes(g.id));
    if (isFounder) return ROLE_GUIDES.filter(g => g.id === 'founder');
    if (isMentor) return ROLE_GUIDES.filter(g => g.id === 'mentor');
    return ROLE_GUIDES.filter(g => g.id === 'founder');
  };

  const visibleGuides = getVisibleGuides();

  return (
    <AppLayout 
      title={t('guide.title', { defaultValue: 'Quick Guide' })} 
      subtitle={t('guide.subtitle', { defaultValue: 'Everything you need to know to get started' })}
    >
      <div className="p-6 max-w-5xl mx-auto">
        {/* Hero */}
        <Card className="mb-8 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Lightbulb className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  {t('guide.welcome', { defaultValue: 'Welcome to Startup Leiria' })}
                </h2>
                <p className="text-muted-foreground">
                  {t('guide.intro', { defaultValue: 'This platform adapts to your profile. Explore the guide below to understand how to get the most out of it.' })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role Tabs */}
        <Tabs defaultValue={getDefaultTab()} className="space-y-6">
          {visibleGuides.length > 1 && (
            <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto gap-2 bg-transparent p-0">
              {visibleGuides.map((guide) => (
                <TabsTrigger
                  key={guide.id}
                  value={guide.id}
                  className="flex flex-col items-center gap-1 py-3 px-4 data-[state=active]:bg-card data-[state=active]:shadow-md border border-transparent data-[state=active]:border-border rounded-lg"
                >
                  <guide.icon className={cn("h-5 w-5", guide.color)} />
                  <span className="text-sm font-medium">{t(guide.titleKey, { defaultValue: guide.titleDefault })}</span>
                  <span className="text-xs text-muted-foreground">{t(guide.taglineKey, { defaultValue: guide.taglineDefault })}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          {visibleGuides.map((guide) => (
            <TabsContent key={guide.id} value={guide.id} className="space-y-6">
              {/* Mission */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", guide.color.replace('text-', 'bg-').replace('600', '100').replace('', ''))}>
                      <guide.icon className={cn("h-6 w-6", guide.color)} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{t(guide.titleKey, { defaultValue: guide.titleDefault })}</CardTitle>
                      <CardDescription>{t(guide.missionKey, { defaultValue: guide.missionDefault })}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Quick Start */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Rocket className="h-4 w-4" />
                    {t('guide.quickStart', { defaultValue: 'Getting Started' })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {guide.quickStartKeys.map((step, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0">
                          {i + 1}
                        </Badge>
                        <span className="text-sm">{t(step.key, { defaultValue: step.default })}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Navigation Guide */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    {t('guide.navigation', { defaultValue: 'Navigation' })}
                  </CardTitle>
                  <CardDescription>
                    {t('guide.navigationDesc', { defaultValue: 'What you find in each section' })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {guide.navigation.map((nav, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="p-2 rounded-lg bg-muted shrink-0">
                          <nav.icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{t(nav.titleKey, { defaultValue: nav.titleDefault })}</p>
                          <p className="text-sm text-muted-foreground">{t(nav.descKey, { defaultValue: nav.descDefault })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Pro Tips */}
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {t('guide.proTips', { defaultValue: 'Pro Tips' })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {guide.tipsKeys.map((tip, i) => (
                      <div key={i} className="text-sm text-foreground/80">
                        {t(tip.key, { defaultValue: tip.default })}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Common Gotchas */}
              <Card className="bg-destructive/5 border-destructive/20">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {t('guide.gotchas', { defaultValue: 'Watch Out' })}
                  </CardTitle>
                  <CardDescription>
                    {t('guide.gotchasDesc', { defaultValue: 'Common mistakes and things to be aware of' })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {guide.gotchasKeys.map((gotcha, i) => (
                      <div key={i} className="text-sm text-foreground/80">
                        {t(gotcha.key, { defaultValue: gotcha.default })}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Footer CTA */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>{t('guide.helpLink', { defaultValue: 'Need more help? Check the' })} <a href="/help" className="text-primary hover:underline">{t('guide.glossary', { defaultValue: 'Glossary & FAQ' })}</a></p>
        </div>
      </div>
    </AppLayout>
  );
}
