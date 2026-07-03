import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Settings, 
  LogOut, 
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  MessageCircle,
  Target,
  Calendar,
  CheckSquare,
  FileText,
  Network,
  Headphones,
  BarChart3,
  Briefcase,
  ClipboardList,
  Contact,
  GraduationCap,
  Database,
  Home,
  UserCircle,
  NotebookPen,
  BookOpen,
  Shield,
  Cog,
  BookOpenCheck,
  HelpCircle,
  FolderOpen,
  Globe2,
  DollarSign,
  Clock,
  Stethoscope,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAttentionCount } from '@/hooks/useAttentionCount';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import startupLeiriaLogo from '@/assets/startup-leiria.svg';
import { MessagingPanel } from '@/components/messaging/MessagingPanel';
import { SidebarContactInfo } from './SidebarContactInfo';
import { useConversations } from '@/hooks/useMessaging';

import { useBackofficeSidebarBadges } from '@/hooks/backoffice/useBackofficeSidebarBadges';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  children?: NavItem[];
  badge?: number;
}

export function AppSidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { profile, isAdmin, isMentor, isConsultor, isBackoffice, isStaff, roles, signOut } = useAuth();
  const isFounder = roles.includes('founder');
  const [collapsed, setCollapsed] = useState(false);
  const [messagingOpen, setMessagingOpen] = useState(false);
  const { data: conversations } = useConversations();
  const totalUnread = (conversations || []).reduce((sum, c: any) => sum + (c.unread_count || 0), 0);
  const unreadLabel = totalUnread > 9 ? '9+' : String(totalUnread);


  // Global "messaging:open" event so any deep-linked CTA can open the panel
  // without prop-drilling. Mirrors the existing `copilot:open` contract.
  useEffect(() => {
    const onOpen = () => setMessagingOpen(true);
    window.addEventListener('messaging:open', onOpen as EventListener);
    return () => window.removeEventListener('messaging:open', onOpen as EventListener);
  }, []);

  // Get founder's workspace for contact info
  const { data: workspaces = [] } = useWorkspaces();
  const workspaceIdFromRoute = location.pathname.startsWith('/workspace/')
    ? location.pathname.split('/')[2]
    : null;
  const founderWorkspaceId = isFounder
    ? (workspaceIdFromRoute || (workspaces.length === 1 ? workspaces[0].id : null))
    : null;

  // Get first workspace ID for founder navigation
  const firstWorkspaceId = workspaces.length > 0 ? workspaces[0].id : null;
  // Prefer the workspace currently being viewed so deep-links follow context
  const routeMatch = location.pathname.match(/^\/workspace\/([^/?#]+)/);
  const activeWorkspaceId = routeMatch?.[1] ?? firstWorkspaceId;

  // ============================================
  // ROLE-SPECIFIC NAVIGATION ITEMS
  // ============================================

  // FOUNDER OS Navigation - rational structure with collapsible "A Minha Startup"
  const [startupExpanded, setStartupExpanded] = useState(
    location.pathname.startsWith('/workspace/')
  );

  const founderNavigation: NavItem[] = [
    { name: t('nav.founder.home', { defaultValue: 'Início' }), href: '/my-workspaces', icon: Home, exact: true },
    ...(activeWorkspaceId ? [
      {
        name: t('nav.founder.myStartup', { defaultValue: 'A Minha Startup' }),
        href: `/workspace/${activeWorkspaceId}`,
        icon: Building2,
      },
      {
        name: t('nav.founder.documents', { defaultValue: 'Documentos' }),
        href: `/workspace/${activeWorkspaceId}?tab=documents`,
        icon: FolderOpen,
      },
    ] : []),
    { name: t('nav.founder.networkResources', { defaultValue: 'Rede & Recursos' }), href: '/resources', icon: Network },
    { name: t('nav.founder.mentors', { defaultValue: 'Mentores' }), href: '/mentors', icon: Headphones },
    { name: t('nav.founder.glossaryFaq', { defaultValue: 'Glossário & FAQ' }), href: '/help', icon: HelpCircle },
  ];

  // CONSULTOR OS Navigation (Portfolio OS)
  const consultorNavigation: NavItem[] = [
    { name: t('nav.consultor.portfolio', { defaultValue: 'Portefólio' }), href: '/my-workspaces', icon: Briefcase, exact: true },
    { name: t('nav.consultor.sessions', { defaultValue: 'Sessões' }), href: '/staff-cockpit', icon: Calendar },
    { name: t('nav.consultor.actionsFollowups', { defaultValue: 'Ações & Follow-ups' }), href: '/staff-cockpit', icon: CheckSquare },
    { name: t('nav.consultor.documents', { defaultValue: 'Documentos' }), href: '/documents', icon: FolderOpen },
    { name: t('nav.consultor.crmPipeline', { defaultValue: 'CRM & Pipeline' }), href: '/crm', icon: Contact },
    { name: t('nav.consultor.ecosystem', { defaultValue: 'Ecossistema' }), href: '/ecosystem', icon: Globe2 },
    { name: t('nav.consultor.programs', { defaultValue: 'Programas' }), href: '/admin?tab=programs-setup', icon: GraduationCap },
    { name: t('nav.consultor.reports', { defaultValue: 'Relatórios' }), href: '/admin?tab=analytics', icon: BarChart3 },
    { name: t('nav.consultor.quickGuide', { defaultValue: 'Guia Rápido' }), href: '/guide', icon: BookOpenCheck },
    { name: t('nav.founder.glossaryFaq', { defaultValue: 'Glossário & FAQ' }), href: '/help', icon: HelpCircle },
  ];

  // MENTOR COMPANION Navigation
  const mentorNavigation: NavItem[] = [
    { name: t('nav.mentor.assignedStartups', { defaultValue: 'Startups Atribuídas' }), href: '/my-workspaces', icon: Building2, exact: true },
    { name: t('nav.mentor.impact', { defaultValue: 'O Meu Impacto' }), href: '/mentors/impact', icon: BarChart3 },
    { name: t('nav.mentor.resources', { defaultValue: 'Conexões & Recursos' }), href: '/mentors', icon: BookOpen },
    { name: t('nav.mentor.quickGuide', { defaultValue: 'Guia Rápido' }), href: '/guide', icon: BookOpenCheck },
    { name: t('nav.founder.glossaryFaq', { defaultValue: 'Glossário & FAQ' }), href: '/help', icon: HelpCircle },
    { name: t('nav.mentor.profile', { defaultValue: 'Perfil' }), href: '/settings', icon: UserCircle },
  ];

  // BACKOFFICE Navigation (focused on spaces, contracts, invoices)
  const backofficeBadgesEnabled = isBackoffice || isAdmin;
  const { data: bofBadges } = useBackofficeSidebarBadges(backofficeBadgesEnabled);
  const backofficeNavigation: NavItem[] = [
    { name: t('nav.backoffice.cockpit', { defaultValue: 'Painel' }), href: '/staff-cockpit', icon: Home, exact: true },
    { name: t('nav.backoffice.spaces', { defaultValue: 'Espaços' }), href: '/admin?tab=backoffice', icon: Building2 },
    { name: t('nav.backoffice.contracts', { defaultValue: 'Contratos' }), href: '/admin?tab=backoffice&subtab=contracts', icon: FileText, badge: bofBadges?.expiringContracts },
    // Billing/Invoices removed from nav per user request
    { name: t('nav.backoffice.approvals', { defaultValue: 'Aprovações' }), href: '/admin?tab=approvals', icon: Clock, badge: bofBadges?.pendingApprovals },
    { name: t('nav.backoffice.quickGuide', { defaultValue: 'Guia Rápido' }), href: '/guide', icon: BookOpenCheck },
    { name: t('nav.founder.glossaryFaq', { defaultValue: 'Glossário & FAQ' }), href: '/help', icon: HelpCircle },
  ];

  // ADMIN Navigation (simplified)
  const adminNavigation: NavItem[] = [
    { name: t('staffCockpit.navLabel', { defaultValue: 'Painel' }), href: '/staff-cockpit', icon: Home, exact: true },
    { name: t('ecosystemHub.navLabel', { defaultValue: 'Hub de Gestão' }), href: '/admin', icon: ClipboardList, exact: true },
    { name: t('admin.crmPipeline', { defaultValue: 'CRM & Leads' }), href: '/crm', icon: Contact },
    { name: t('nav.admin.ecosystem', { defaultValue: 'Diretório Ecossistema' }), href: '/ecosystem', icon: Globe2 },
    { name: t('nav.admin.programsCohorts', { defaultValue: 'Programas e Coortes' }), href: '/admin?tab=programs-setup', icon: GraduationCap },
    { name: t('nav.admin.reports', { defaultValue: 'Relatórios' }), href: '/admin?tab=analytics', icon: BarChart3 },
    { name: t('nav.admin.usersPermissions', { defaultValue: 'Utilizadores & Permissões' }), href: '/admin?tab=users', icon: Shield },
    { name: t('consultorTools.title', { defaultValue: 'Ferramentas de Consultor' }), href: '/consultor-tools', icon: Briefcase },
    { name: t('nav.admin.quickGuide', { defaultValue: 'Guia Rápido' }), href: '/guide', icon: BookOpenCheck },
    { name: t('nav.founder.glossaryFaq', { defaultValue: 'Glossário & FAQ' }), href: '/help', icon: HelpCircle },
    { name: t('systemSettings.navLabel', { defaultValue: 'Definições do Sistema' }), href: '/system-settings', icon: Cog },
    { name: t('nav.admin.diagnostics', { defaultValue: 'Diagnósticos' }), href: '/admin/diagnostics', icon: Stethoscope },
  ];

  // Determine which navigation to show based on role priority
  // Admin who is also consultor should see admin nav with consultor tools
  const getActiveNavigation = (): NavItem[] => {
    // Pure admin (no consultor role) sees admin nav
    if (isAdmin && !isConsultor) {
      return adminNavigation;
    }
    // Admin who is also consultor - show admin nav (they can access consultor tools via admin)
    if (isAdmin && isConsultor) {
      return adminNavigation;
    }
    // Backoffice role sees dedicated backoffice nav (spaces, contracts, invoices)
    if (isBackoffice && !isAdmin && !isConsultor) {
      return backofficeNavigation;
    }
    // Consultor (not admin) sees portfolio OS
    if (isConsultor) {
      return consultorNavigation;
    }
    // External mentor sees mentor companion
    if (isMentor && !isFounder && !isStaff) {
      return mentorNavigation;
    }
    // Founder sees founder OS
    if (isFounder) {
      return founderNavigation;
    }
    // Default fallback
    return [{ name: t('nav.myWorkspaces'), href: '/my-workspaces', icon: Building2 }];
  };

  const activeNavigation = getActiveNavigation();

  // Real notification count from database
  const { data: attentionStats, isLoading: attentionLoading } = useAttentionCount();
  const notificationCount = attentionStats?.totalAttention || 0;

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const isActiveRoute = (item: NavItem): boolean => {
    if (item.href.includes('?')) {
      const [path, query] = item.href.split('?');
      if (location.pathname !== path) return false;
      
      const itemParams = new URLSearchParams(query);
      const locationParams = new URLSearchParams(location.search);
      
      for (const [key, value] of itemParams.entries()) {
        if (locationParams.get(key) !== value) return false;
      }
      
      // Don't highlight parent when a more specific child is active
      if (!itemParams.has('subtab') && locationParams.has('subtab')) {
        return false;
      }
      
      return true;
    }

    if (item.exact) {
      return location.pathname === item.href && location.search === '';
    }
    return location.pathname.startsWith(item.href);
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = isActiveRoute(item);
    const hasActiveChild = item.children?.some(child => isActiveRoute(child));
    
    // If item has children, render as collapsible dropdown
    if (item.children && !collapsed) {
      return (
        <Collapsible 
          key={item.name} 
          open={startupExpanded} 
          onOpenChange={setStartupExpanded}
        >
          <div className="space-y-0.5">
           <div className="flex items-center">
              <Link
                to={item.href}
                className={cn(
                  "flex-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 relative",
                  // Parent is only "active" when exact match without ?tab (no query params)
                  // When a child is active, parent is just "expanded" (open) but not highlighted
                  isActive && !location.search
                    ? "bg-sidebar-accent/60 text-sidebar-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-[3px] before:rounded-r-sm before:bg-sidebar-primary before:shadow-[0_0_10px_hsl(var(--sidebar-primary)/0.55)]"
                    : hasActiveChild
                      ? "text-sidebar-foreground hover:bg-sidebar-accent/40"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className={cn("h-[18px] w-[18px] shrink-0", (isActive && !location.search) && "text-sidebar-primary")} />
                <span className="truncate flex-1">{item.name}</span>
              </Link>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 shrink-0"
                 aria-label={t('common.expand')}>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", startupExpanded && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="pl-4 space-y-0.5">
              {item.children.map(child => {
                const childActive = isActiveRoute(child);
                return (
                  <Link
                    key={child.name}
                    to={child.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 relative",
                      childActive
                        ? "bg-sidebar-accent/60 text-sidebar-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-sm before:bg-sidebar-primary before:shadow-[0_0_8px_hsl(var(--sidebar-primary)/0.5)]"
                        : "text-sidebar-foreground/50 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
                    )}
                  >
                    <child.icon className={cn("h-4 w-4 shrink-0", childActive && "text-sidebar-primary")} />
                    <span className="truncate">{child.name}</span>
                  </Link>
                );
              })}
            </CollapsibleContent>
          </div>
        </Collapsible>
      );
    }

    // Standard nav item (no children or collapsed)
    const badgeValue = item.badge ?? 0;
    const NavLink = (
      <Link
        key={item.name}
        to={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 relative",
          isActive
            ? "bg-sidebar-accent/60 text-sidebar-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-[3px] before:rounded-r-sm before:bg-sidebar-primary before:shadow-[0_0_10px_hsl(var(--sidebar-primary)/0.55)]"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-sidebar-primary")} />
        {!collapsed && (
          <>
            <span className="truncate flex-1">{item.name}</span>
            {badgeValue > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-warning/20 text-warning text-[10px] font-semibold flex items-center justify-center">
                {badgeValue > 99 ? '99+' : badgeValue}
              </span>
            )}
          </>
        )}
        {collapsed && badgeValue > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-warning text-warning-foreground text-[9px] font-semibold flex items-center justify-center">
            {badgeValue > 9 ? '9+' : badgeValue}
          </span>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.name} delayDuration={0}>
          <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.name}
          </TooltipContent>
        </Tooltip>
      );
    }
    return NavLink;
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 z-40 h-dvh gradient-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo - clickable to navigate home */}
        <Link 
          to="/"
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border transition-all duration-300 hover:opacity-80 cursor-pointer bg-transparent",
            collapsed ? "justify-center px-2" : "justify-center px-4"
          )}
        >
          <img 
            src={startupLeiriaLogo} 
            alt="Startup Leiria" 
            className={cn(
              "transition-all duration-300 pointer-events-none object-contain brightness-0 invert",
              collapsed ? "h-8 w-8" : "h-9 w-auto max-w-[160px]"
            )}
          />
        </Link>

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar-background text-sidebar-foreground hover:bg-sidebar-accent shadow-md z-50"
         aria-label={t('common.next')}>
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </Button>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto scrollbar-thin" data-tour="workspaces">
          {activeNavigation.map(renderNavItem)}

          {/* Admin link for staff who aren't admins */}
          {isConsultor && !isAdmin && (
            <>
              <div className="my-4 h-px bg-sidebar-border" />
              {renderNavItem({
                name: t('nav.adminPanel'),
                href: '/admin',
                icon: Settings,
              })}
            </>
          )}
        </nav>

        {/* Notifications - muted amber instead of red */}
        {attentionLoading ? (
          <div className={cn("mx-3 mb-3", collapsed ? "p-2" : "p-3")}>
            <Skeleton className="h-10 w-full" />
          </div>
        ) : notificationCount > 0 ? (
          <Link
            to="/my-workspaces?filter=attention"
            className={cn(
              "mx-3 mb-3 rounded-md bg-warning/10 border border-warning/20 transition-all duration-200 block hover:bg-warning/15 cursor-pointer",
              collapsed ? "p-2" : "p-3"
            )}
            data-tour="notifications"
          >
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="flex justify-center">
                    <div className="relative">
                      <AlertCircle className="h-4.5 w-4.5 text-warning" />
                      <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-warning text-[9px] font-semibold text-warning-foreground flex items-center justify-center">
                        {notificationCount > 9 ? '9+' : notificationCount}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t('dashboard.itemsNeedAttention', { count: notificationCount })}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-warning">
                    {t('dashboard.itemsNeedAttention', { count: notificationCount })}
                  </p>
                  {attentionStats && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {[
                        attentionStats.criticalCount > 0 && `${attentionStats.criticalCount} ${t('health.levels.critical')}`,
                        attentionStats.atRiskCount > 0 && `${attentionStats.atRiskCount} ${t('health.levels.at_risk')}`,
                        attentionStats.overdueCount > 0 && `${attentionStats.overdueCount} ${t('actions.overdue')}`,
                      ].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </Link>
        ) : null}

        {/* Contact Info - Consultant/Mentor for founders */}
        {isFounder && founderWorkspaceId && (
          <SidebarContactInfo workspaceId={founderWorkspaceId} collapsed={collapsed} onOpenMessaging={() => setMessagingOpen(true)} />
        )}

        {/* Messaging button */}
        <div className={cn("mx-3 mb-2", collapsed ? "text-center" : "")}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMessagingOpen(true)}
                  className="relative h-10 w-10 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                 aria-label={t('common._iconOpenChat')}>
                  <MessageCircle className="h-5 w-5" />
                  {totalUnread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                      {unreadLabel}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('common.messages')}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setMessagingOpen(true)}
              className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="flex-1 text-left">{t('common.messages')}</span>
              {totalUnread > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                  {unreadLabel}
                </span>
              )}
            </Button>
          )}
        </div>

        {/* User section */}
        <div className="border-t border-sidebar-border p-3">
          <div className={cn(
            "flex items-center rounded-lg bg-sidebar-accent/30 transition-all duration-300",
            collapsed ? "justify-center p-2" : "gap-3 p-3"
          )}>
            <Avatar className={cn(
              "transition-all duration-300",
              collapsed ? "h-8 w-8" : "h-9 w-9"
            )}>
              <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || 'User avatar'} />
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0 animate-fade-in">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">
                    {profile?.full_name || 'User'}
                  </p>
                  <p className="text-xs text-sidebar-muted truncate">
                    {profile?.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
                  onClick={() => signOut()}
                 aria-label={t('common.logout')}>

                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {collapsed && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full mt-2 h-8 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  onClick={() => signOut()}
                 aria-label={t('common.logout')}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('auth.signOut')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Messaging Panel */}
      <MessagingPanel open={messagingOpen} onOpenChange={setMessagingOpen} />
    </aside>
  );
}
