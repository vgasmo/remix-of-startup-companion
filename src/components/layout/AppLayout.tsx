import { ReactNode, useState, useEffect, forwardRef, useMemo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Building2, Users, Settings, Home, Briefcase, Calendar, 
  Contact, BookOpen, MoreHorizontal, Cog, FileText, ClipboardList,
  Network, MessageCircle, LucideIcon
} from 'lucide-react';
import { useConversations } from '@/hooks/useMessaging';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { OfflineBadge } from '@/components/ui/OfflineBadge';
import { GlobalEcosystemCopilot } from '@/components/ai/GlobalEcosystemCopilot';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export const AppLayout = forwardRef<HTMLDivElement, AppLayoutProps>(function AppLayout(
  { children, title, subtitle, actions },
  ref
) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  useDocumentTitle(title);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const handleResize = () => {
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        setSidebarCollapsed(sidebar.classList.contains('w-[72px]'));
      }
    };

    const observer = new MutationObserver(handleResize);
    const sidebar = document.querySelector('aside');
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-h-dvh bg-background">
      {/* Sidebar - hidden on mobile, shown on lg+ */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>
      
      {/* Mobile bottom nav - shown only on mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border safe-area-bottom">
        <MobileBottomNav />
      </nav>
      
      <main className={cn(
        "transition-all duration-300 ease-in-out",
        // On mobile, no margin needed. On desktop, account for sidebar
        "ml-0 lg:ml-64",
        sidebarCollapsed && "lg:ml-[72px]",
        // Add bottom padding on mobile for bottom nav
        "pb-20 lg:pb-0"
      )}>
        {/* Top bar with user info - always visible */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 lg:h-16 items-center justify-between gap-4 px-4 lg:px-8">
            <div className={cn(
              "transition-[opacity,transform] duration-200 ease-out min-w-0 overflow-hidden motion-reduce:transition-none",
              mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
            )}>
              {title && (
                <h1 className="font-heading text-lg lg:text-xl font-semibold text-foreground truncate" title={title}>
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-xs lg:text-sm text-muted-foreground truncate" title={subtitle}>{subtitle}</p>
              )}
            </div>
            <div className={cn(
              "flex items-center gap-2 lg:gap-4 transition-[opacity,transform] duration-200 delay-75 flex-shrink-0 ml-auto motion-reduce:transition-none",
              mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
            )}>
              {actions}
              <TopBar />
            </div>
          </div>
        </header>
        <div 
          className={cn(
            "px-4 py-6 lg:px-6 lg:py-6 mx-auto max-w-7xl",
            "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          )}
          data-page-transition
        >
          {children}
        </div>
      </main>
      <OfflineBadge />
      <GlobalEcosystemCopilot />
    </div>
  );
});

interface MobileNavItem {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  label: string;
  badge?: number;
}

// Mobile bottom navigation - role-aware
function MobileBottomNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isAdmin, isConsultor, isBackoffice, isStaff, isExternalMentor, isFounder } = useAuth();
  const { data: workspaces = [] } = useWorkspaces();
  const firstWorkspaceId = workspaces.length > 0 ? workspaces[0].id : null;

  const { data: conversations } = useConversations();
  const unread = (conversations || []).reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
  const openMessaging = () => window.dispatchEvent(new Event('messaging:open'));
  const messagingItem: MobileNavItem = {
    onClick: openMessaging,
    icon: MessageCircle,
    label: t('common.messages'),
    badge: unread,
  };
  
  const navItems = useMemo((): MobileNavItem[] => {
    // ADMIN
    if (isAdmin) {
      return [
        { href: '/staff-cockpit', icon: Home, label: t('nav.mobile.cockpit', { defaultValue: 'Cockpit' }) },
        { href: '/admin', icon: ClipboardList, label: t('nav.mobile.ecosystem', { defaultValue: 'Ecossistema' }) },
        { href: '/crm', icon: Contact, label: t('nav.mobile.crm', { defaultValue: 'CRM' }) },
        messagingItem,
        { href: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    
    // BACKOFFICE
    if (isBackoffice && !isConsultor) {
      return [
        { href: '/staff-cockpit', icon: Home, label: t('nav.mobile.cockpit', { defaultValue: 'Cockpit' }) },
        { href: '/admin?tab=backoffice', icon: Building2, label: t('nav.mobile.spaces', { defaultValue: 'Espaços' }) },
        { href: '/admin?tab=backoffice&subtab=contracts', icon: FileText, label: t('nav.mobile.contracts', { defaultValue: 'Contratos' }) },
        messagingItem,
        { href: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    
    // CONSULTOR
    if (isConsultor) {
      return [
        { href: '/my-workspaces', icon: Briefcase, label: t('nav.mobile.portfolio', { defaultValue: 'Portefólio' }) },
        { href: '/consultor-tools', icon: Calendar, label: t('nav.mobile.sessions', { defaultValue: 'Sessões' }) },
        { href: '/crm', icon: Contact, label: t('nav.mobile.crm', { defaultValue: 'CRM' }) },
        messagingItem,
        { href: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    
    // EXTERNAL MENTOR
    if (isExternalMentor && !isFounder) {
      return [
        { href: '/my-workspaces', icon: Building2, label: t('nav.mobile.startups', { defaultValue: 'Startups' }) },
        { href: '/my-workspaces#session-prep', icon: Calendar, label: t('nav.mobile.sessions', { defaultValue: 'Sessões' }) },
        { href: '/mentors', icon: BookOpen, label: t('nav.mobile.resources', { defaultValue: 'Recursos' }) },
        messagingItem,
        { href: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    
    // FOUNDER
    if (isFounder) {
      return [
        { href: '/my-workspaces', icon: Home, label: t('nav.mobile.home', { defaultValue: 'Início' }) },
        ...(firstWorkspaceId ? [{ href: `/workspace/${firstWorkspaceId}`, icon: Building2, label: t('nav.mobile.startup', { defaultValue: 'Startup' }) }] : []),
        messagingItem,
        { href: '/resources', icon: Network, label: t('nav.mobile.resources', { defaultValue: 'Recursos' }) },
        { href: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    
    // Default fallback
    return [
      { href: '/my-workspaces', icon: Home, label: t('nav.home', { defaultValue: 'Home' }) },
      { href: '/settings', icon: Settings, label: t('nav.settings') },
    ];
  }, [isAdmin, isConsultor, isBackoffice, isStaff, isExternalMentor, isFounder, firstWorkspaceId, t, unread]);
  
  return (
    <div className="flex items-center justify-around h-16 px-2" role="navigation" aria-label="Mobile navigation">
      {navItems.map((item, idx) => {
        const isActive = item.href
          ? (item.href.includes('?')
              ? location.pathname + location.search === item.href
              : location.pathname === item.href || 
                (item.href !== '/' && item.href !== '/my-workspaces' && location.pathname.startsWith(item.href)))
          : false;

        const className = cn(
          "relative flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px] min-h-[44px]",
          isActive 
            ? "text-primary bg-primary/10" 
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        );

        const content = (
          <>
            <item.icon className="h-5 w-5" />
            {(item.badge ?? 0) > 0 && (
              <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                {item.badge! > 9 ? '9+' : item.badge}
              </span>
            )}
            <span className="text-[10px] font-medium">{item.label}</span>
          </>
        );

        if (item.onClick) {
          return (
            <button key={`btn-${idx}`} type="button" onClick={item.onClick} className={className}>
              {content}
            </button>
          );
        }

        return (
          <Link key={item.href} to={item.href!} className={className}>
            {content}
          </Link>
        );
      })}
    </div>
  );

}