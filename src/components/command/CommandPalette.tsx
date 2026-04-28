import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search, FileText, ListTodo, StickyNote, File, Target, MessageSquare,
  Calendar, CheckSquare, BarChart3, Users, Building2, Settings, Home,
  Briefcase, ArrowRight, Command as CommandIcon, Sparkles, Bot, Loader2,
  AlertTriangle, Clock, Rocket,
} from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobalSearch, SearchResult } from '@/hooks/useGlobalSearch';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';

const typeIcons: Record<string, React.ReactNode> = {
  session: <Calendar className="h-4 w-4 text-muted-foreground" />,
  action: <ListTodo className="h-4 w-4 text-muted-foreground" />,
  note: <StickyNote className="h-4 w-4 text-muted-foreground" />,
  document: <File className="h-4 w-4 text-muted-foreground" />,
  message: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
  milestone: <Target className="h-4 w-4 text-muted-foreground" />,
};

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isConsultor, isStaff, isMentor, isFounder } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [copilotMode, setCopilotMode] = useState(false);
  const [copilotThinking, setCopilotThinking] = useState(false);
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState<Array<{ path: string; label: string; type: string }>>([]);

  const { data: searchResults } = useGlobalSearch({ query: copilotMode ? '' : query });
  const { data: workspacesData } = useWorkspaces({});

  // Load recent items from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('sl-command-palette-recents');
      if (raw) setRecentItems(JSON.parse(raw).slice(0, 5));
    } catch { /* ignore */ }
  }, [open]);

  const pushRecent = useCallback((item: { path: string; label: string; type: string }) => {
    try {
      const next = [item, ...recentItems.filter(r => r.path !== item.path)].slice(0, 5);
      setRecentItems(next);
      localStorage.setItem('sl-command-palette-recents', JSON.stringify(next));
    } catch { /* ignore */ }
  }, [recentItems]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runAction = useCallback((path: string, label?: string, type: string = 'nav') => {
    if (label) pushRecent({ path, label, type });
    navigate(path);
    setOpen(false);
    setQuery('');
    setCopilotMode(false);
    setCopilotAnswer(null);
  }, [navigate, pushRecent]);

  // Copilot: simulate AI response
  const handleCopilotSubmit = useCallback(async () => {
    if (!query.trim()) return;
    setCopilotThinking(true);
    setCopilotAnswer(null);
    await new Promise(r => setTimeout(r, 2200));
    // Mock smart answers based on keywords
    const q = query.toLowerCase();
    let answer = `Based on ecosystem data: Your portfolio has 12 active startups. 2 are flagged "at risk" due to late KPI submissions. 3 contracts expire within 30 days. Recommend scheduling check-ins with at-risk startups this week.`;
    if (q.includes('risk') || q.includes('risco')) {
      answer = `🔴 2 startups are flagged At Risk:\n• "TechNova" — missed last 2 KPI submissions, no session in 45 days\n• "GreenFlow" — burn rate increased 40%, runway < 3 months\n\nRecommended: Schedule urgent check-ins and review financial models.`;
    } else if (q.includes('kpi') || q.includes('metric')) {
      answer = `📊 KPI Health Summary:\n• 78% of startups submitted KPIs this month\n• Top improving: "DataPulse" (+23% MRR)\n• Declining: "CloudBase" (-15% NPS)\n• 3 startups have never submitted KPIs — consider automated reminders.`;
    } else if (q.includes('session') || q.includes('sessão')) {
      answer = `📅 Session Insights:\n• 8 sessions scheduled this week\n• Average session frequency: 1.2 per startup/month\n• 4 startups haven't had a session in 30+ days\n• Next overdue: "HealthTech AI" (last session: 38 days ago)`;
    }
    setCopilotAnswer(answer);
    setCopilotThinking(false);
  }, [query]);

  // Extract workspace ID from current path
  const workspaceMatch = location.pathname.match(/\/workspace\/([a-f0-9-]+)/);
  const currentWorkspaceId = workspaceMatch?.[1];

  // Quick actions based on context
  const quickActions = [];

  if (currentWorkspaceId) {
    quickActions.push(
      { id: 'kpis', label: t('quickActions.updateKpis'), icon: <BarChart3 className="h-4 w-4" />, path: `/workspace/${currentWorkspaceId}?tab=kpis` },
      { id: 'action', label: t('quickActions.newAction'), icon: <CheckSquare className="h-4 w-4" />, path: `/workspace/${currentWorkspaceId}?tab=milestones-actions-actions` },
      { id: 'session', label: t('quickActions.scheduleSession'), icon: <Calendar className="h-4 w-4" />, path: `/workspace/${currentWorkspaceId}?tab=agenda` },
      { id: 'document', label: t('quickActions.uploadDocument'), icon: <FileText className="h-4 w-4" />, path: `/workspace/${currentWorkspaceId}?tab=documents` },
    );
  }

  // Navigation items based on role
  const navItems = [
    { id: 'home', label: t('nav.home'), icon: <Home className="h-4 w-4" />, path: '/my-workspaces' },
    { id: 'settings', label: t('nav.settings'), icon: <Settings className="h-4 w-4" />, path: '/settings' },
  ];

  if (isStaff) {
    navItems.push(
      { id: 'crm', label: t('nav.crm'), icon: <Briefcase className="h-4 w-4" />, path: '/crm' },
      { id: 'admin', label: t('nav.adminPanel'), icon: <Building2 className="h-4 w-4" />, path: '/admin' },
    );
  }
  if (isStaff || isMentor) {
    navItems.push(
      { id: 'mentors', label: t('nav.mentors'), icon: <Users className="h-4 w-4" />, path: '/mentors' },
    );
  }

  // Group search results by type
  const groupedResults = searchResults?.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>) || {};

  const typeLabels: Record<string, string> = {
    session: t('search.types.sessions'),
    action: t('search.types.actions'),
    note: t('search.types.notes'),
    document: t('search.types.documents'),
    message: t('search.types.messages'),
    milestone: t('search.types.milestones'),
  };

  const hasSearchResults = searchResults && searchResults.length > 0;
  const showQuickActions = !query && quickActions.length > 0 && !copilotMode;
  const showNav = (!query || query.length < 2) && !copilotMode;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setCopilotMode(false);
      setCopilotAnswer(null);
      setCopilotThinking(false);
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder={copilotMode
          ? t('commandPalette.copilotPlaceholder', { defaultValue: 'Ask the Ecosystem Copilot…' })
          : t('commandPalette.placeholder')
        }
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          if (copilotMode && e.key === 'Enter') {
            e.preventDefault();
            handleCopilotSubmit();
          }
        }}
      />
      <CommandList>
        {/* Copilot Mode */}
        {copilotMode ? (
          <div className="p-4 space-y-3">
            {copilotThinking && (
              <div className="space-y-3 animate-pulse">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  <span>{t('commandPalette.copilotThinking', { defaultValue: 'Analyzing ecosystem data…' })}</span>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            )}
            {copilotAnswer && !copilotThinking && (
              <div className="rounded-xl bg-muted/40 border border-border/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-500" />
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">{t('commandPalette.copilotTitle', 'Ecosystem Copilot')}</span>
                  <Badge variant="outline" className="text-[9px] ml-auto">{t('common.preview', 'Preview')}</Badge>
                </div>
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{copilotAnswer}</p>
                <p className="text-[10px] text-muted-foreground italic">
                  {t('commandPalette.copilotPreviewNote', { defaultValue: 'Modo informativo — dados ilustrativos.' })}
                </p>
              </div>
            )}
            {!copilotThinking && !copilotAnswer && (
              <div className="text-center py-6 space-y-2">
                <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">{t('commandPalette.copilotHint', { defaultValue: 'Try: "Which startups are at risk?" or "KPI summary"' })}</p>
              </div>
            )}
            <button
              onClick={() => { setCopilotMode(false); setCopilotAnswer(null); setQuery(''); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← {t('commandPalette.backToSearch', { defaultValue: 'Back to search' })}
            </button>
          </div>
        ) : (
          <>
            <CommandEmpty>
              {query.length >= 2
                ? t('search.noResultsFor', { query })
                : t('commandPalette.typeToSearch')}
            </CommandEmpty>

            {/* AI Copilot Entry */}
            {!query && (
              <>
                <CommandGroup heading={t('commandPalette.ai', { defaultValue: 'AI Assistant' })}>
                  <CommandItem
                    onSelect={() => setCopilotMode(true)}
                    className="gap-3"
                  >
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    <div className="flex-1">
                      <span className="text-sm">{t('commandPalette.askCopilot', { defaultValue: 'Ask Ecosystem Copilot' })}</span>
                      <span className="text-xs text-muted-foreground block">{t('commandPalette.copilotDesc', { defaultValue: 'AI-powered insights about your portfolio' })}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">AI</Badge>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Search Results */}
            {hasSearchResults && !copilotMode && Object.entries(groupedResults).map(([type, items]) => (
              <CommandGroup key={type} heading={typeLabels[type] || type}>
                {items.slice(0, 5).map(result => (
                  <CommandItem
                    key={result.id}
                    onSelect={() => runAction(result.url)}
                    className="flex items-center gap-3"
                  >
                    {typeIcons[result.type]}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{result.title}</span>
                      {result.snippet && (
                        <span className="text-xs text-muted-foreground truncate block">{result.snippet.slice(0, 80)}</span>
                      )}
                    </div>
                    {result.workspace_name && (
                      <Badge variant="outline" className="text-xs flex-shrink-0">{result.workspace_name}</Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {/* Quick Actions */}
            {showQuickActions && (
              <>
                {hasSearchResults && <CommandSeparator />}
                <CommandGroup heading={t('commandPalette.quickActions')}>
                  {quickActions.map(action => (
                    <CommandItem key={action.id} onSelect={() => runAction(action.path)} className="gap-3">
                      {action.icon}
                      <span>{action.label}</span>
                      <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Navigation */}
            {showNav && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t('commandPalette.navigation')}>
                  {navItems.map(item => (
                    <CommandItem key={item.id} onSelect={() => runAction(item.path)} className="gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
