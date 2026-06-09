import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ChevronDown, 
  TrendingUp, 
  Briefcase, 
  Settings,
  Target,
  BarChart3,
  Trophy,
  FileText,
  FolderLock,
  Calendar,
  Users,
  DollarSign,
  StickyNote,
  Clock,
  Shield,
  BookOpen,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  showForRoles?: ('founder' | 'admin' | 'consultor' | 'mentor')[];
  requiresStartup?: boolean;
}

interface TabGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  tabs: TabConfig[];
  defaultOpen?: boolean;
}

interface WorkspaceTabGroupsProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isFounder: boolean;
  isAdmin: boolean;
  isConsultor: boolean;
  isMentor: boolean;
  hasStartup: boolean;
}

export function WorkspaceTabGroups({
  currentTab,
  onTabChange,
  isFounder,
  isAdmin,
  isConsultor,
  isMentor,
  hasStartup,
}: WorkspaceTabGroupsProps) {
  const { t } = useTranslation();

  const tabGroups = useMemo<TabGroup[]>(() => [
    {
      id: 'progress',
      label: t('tabGroups.progress'),
      icon: <TrendingUp className="h-4 w-4" />,
      defaultOpen: true,
      tabs: [
        { id: 'overview', label: t('workspace.overview'), icon: <BarChart3 className="h-4 w-4" /> },
        { id: 'kpis', label: t('workspace.kpis'), icon: <TrendingUp className="h-4 w-4" /> },
        { id: 'milestones', label: t('workspace.milestones'), icon: <Target className="h-4 w-4" /> },
        { id: 'actions', label: t('workspace.actions'), icon: <ClipboardCheck className="h-4 w-4" /> },
        { id: 'playbooks', label: t('workspace.playbooks'), icon: <BookOpen className="h-4 w-4" /> },
        { 
          id: 'benchmark', 
          label: t('workspace.benchmark', 'Benchmark'), 
          icon: <Trophy className="h-4 w-4" />,
          showForRoles: ['founder'],
        },
      ],
    },
    {
      id: 'investor',
      label: t('tabGroups.investor'),
      icon: <Briefcase className="h-4 w-4" />,
      tabs: [
        { id: 'dataroom', label: t('dataroom.title'), icon: <FolderLock className="h-4 w-4" /> },
        { id: 'documents', label: t('workspace.documents'), icon: <FileText className="h-4 w-4" /> },
        { id: 'templates', label: t('workspace.templates'), icon: <FileText className="h-4 w-4" /> },
        { 
          id: 'funding', 
          label: t('workspace.funding'), 
          icon: <DollarSign className="h-4 w-4" />,
          showForRoles: ['founder'],
          requiresStartup: true,
        },
      ],
    },
    {
      id: 'program',
      label: t('tabGroups.program'),
      icon: <Settings className="h-4 w-4" />,
      tabs: [
        { id: 'sessions', label: t('workspace.sessions'), icon: <Calendar className="h-4 w-4" /> },
        { id: 'calendar', label: t('workspace.calendar'), icon: <Calendar className="h-4 w-4" /> },
        { 
          id: 'team', 
          label: t('workspace.team'), 
          icon: <Users className="h-4 w-4" />,
          showForRoles: ['founder'],
          requiresStartup: true,
        },
        { 
          id: 'notes', 
          label: t('workspace.notesAndTasks'), 
          icon: <StickyNote className="h-4 w-4" />,
          showForRoles: ['admin', 'consultor', 'mentor'],
        },
        { 
          id: 'time', 
          label: t('workspace.time'), 
          icon: <Clock className="h-4 w-4" />,
          showForRoles: ['admin', 'consultor'],
        },
        { id: 'governance', label: t('workspace.governance'), icon: <Shield className="h-4 w-4" /> },
        { id: 'settings', label: t('workspace.settings'), icon: <Settings className="h-4 w-4" /> },
      ],
    },
  ], [t]);

  // Find which group contains the current tab
  const activeGroup = useMemo(() => {
    for (const group of tabGroups) {
      if (group.tabs.some(tab => tab.id === currentTab)) {
        return group.id;
      }
    }
    return tabGroups[0].id;
  }, [currentTab, tabGroups]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    // Open the group containing the current tab
    initial.add(activeGroup);
    // Also open the first group by default
    if (tabGroups[0]) initial.add(tabGroups[0].id);
    return initial;
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const isTabVisible = (tab: TabConfig): boolean => {
    if (tab.showForRoles) {
      const hasRole = tab.showForRoles.some(role => {
        switch (role) {
          case 'founder': return isFounder;
          case 'admin': return isAdmin;
          case 'consultor': return isConsultor;
          case 'mentor': return isMentor;
          default: return false;
        }
      });
      if (!hasRole) return false;
    }
    if (tab.requiresStartup && !hasStartup) return false;
    return true;
  };

  return (
    <div className="space-y-1">
      {tabGroups.map(group => {
        const visibleTabs = group.tabs.filter(isTabVisible);
        if (visibleTabs.length === 0) return null;

        const isOpen = openGroups.has(group.id);
        const hasActiveTab = visibleTabs.some(tab => tab.id === currentTab);

        return (
          <Collapsible key={group.id} open={isOpen} onOpenChange={() => toggleGroup(group.id)}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-between h-9 px-3",
                  hasActiveTab && "bg-muted"
                )}
              >
                <span className="flex items-center gap-2">
                  {group.icon}
                  <span className="font-medium text-sm">{group.label}</span>
                </span>
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  isOpen && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 space-y-0.5">
              {visibleTabs.map(tab => (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start h-8 px-3 text-sm transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0",
                    currentTab === tab.id && "chevron-tick bg-primary/10 text-primary"
                  )}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.icon}
                  <span className="ml-2">{tab.label}</span>
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}