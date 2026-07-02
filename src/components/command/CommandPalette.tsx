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
import { useCopilotChat } from '@/hooks/useCopilotChat';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

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
  const [recentItems, setRecentItems] = useState<Array<{ path: string; label: string; type: string }>>([]);
  const copilot = useCopilotChat();

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

  // Keyboard shortcut + custom event for "Ask AI" dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    const handleAskAi = (e: Event) => {
      const detail = (e as CustomEvent<{ question?: string }>).detail || {};
      setOpen(true);
      setCopilotMode(true);
      setQuery('');
      if (detail.question?.trim()) {
        // small defer so dialog mounts
        setTimeout(() => copilot.send(detail.question!.trim()), 50);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('sl-ask-ai', handleAskAi as EventListener);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('sl-ask-ai', handleAskAi as EventListener);
    };
  }, [copilot]);

  const runAction = useCallback((path: string, label?: string, type: string = 'nav') => {
    if (label) pushRecent({ path, label, type });
    navigate(path);
    setOpen(false);
    setQuery('');
    setCopilotMode(false);
    copilot.reset();
  }, [navigate, pushRecent, copilot]);

  // Real AI copilot via streaming edge function
  const handleCopilotSubmit = useCallback(async () => {
    if (!query.trim()) return;
    await copilot.send(query);
  }, [query, copilot]);

  // Extract workspace ID from current path
  const workspaceMatch = location.pathname.match(/\/workspace\/([a-f0-9-]+)/);
  const currentWorkspaceId = workspaceMatch?.[1];

  // Quick actions based on context
  const quickActions = [];

  if (currentWorkspaceId) {
    quickActions.push(
      { id: 'kpis', label: t('quickActions.updateKpis'), icon: <BarChart3 className="h-4 w-4" />, path: `/workspace/${currentWorkspaceId}?tab=kpis` },
      { id: 'action', label: t('quickActions.newAction'), icon: <CheckSquare className="h-4 w-4" />, path: `/workspace/${currentWorkspaceId}?tab=milestones-actions&sub=actions` },
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

  const buildSearchContextPrompt = useCallback((rawQuery: string) => {
    const text = rawQuery.trim();
    if (!text) return '';

    const entityResults = (searchResults || []).slice(0, 8);
    if (entityResults.length === 0) return text;

    const lines: string[] = [
      `O utilizador pesquisou por "${text}" na barra global da aplicação.`,
      'Usa os resultados encontrados abaixo para responder com contexto real da app, priorizando entidades encontradas, o que são, e qual o próximo passo recomendado.',
      '',
      `Resultados encontrados (${entityResults.length}):`,
    ];

    entityResults.forEach((result, index) => {
      const snippet = result.snippet ? ` — ${result.snippet.slice(0, 120)}` : '';
      const workspaceName = result.workspace_name ? ` (${result.workspace_name})` : '';
      lines.push(`${index + 1}. [${result.type}] ${result.title}${workspaceName}${snippet}`);
    });

    lines.push('');
    lines.push(`Pergunta do utilizador: ${text}`);

    return lines.join('\n');
  }, [searchResults]);

  const hasSearchResults = searchResults && searchResults.length > 0;
  const showQuickActions = !query && quickActions.length > 0 && !copilotMode;
  const showNav = (!query || query.length < 2) && !copilotMode;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setCopilotMode(false);
      copilot.reset();
    }
  };

  // Workspace jump — filter by query, cap to 6
  const matchingWorkspaces = useMemo(() => {
    if (copilotMode || !workspacesData) return [];
    const q = query.trim().toLowerCase();
    const list = workspacesData
      .filter(w => w.startup?.name)
      .filter(w => !q || w.startup!.name.toLowerCase().includes(q))
      .slice(0, q ? 6 : 4);
    return list;
  }, [workspacesData, query, copilotMode]);

  const showRecents = !query && !copilotMode && recentItems.length > 0;

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
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-primary ">
                {t('commandPalette.copilotTitle', 'Ecosystem Copilot')}
              </span>
              {copilot.isThinking && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-auto" />}
            </div>

            {copilot.messages.length === 0 && !copilot.isThinking && (
              <div className="text-center py-4 space-y-2">
                <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {t('commandPalette.copilotHint', { defaultValue: 'Pergunte algo sobre os seus dados ou como usar a app. Pressione Enter para enviar.' })}
                </p>
              </div>
            )}

            {copilot.messages.map(m => (
              <div
                key={m.id}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-primary/10 text-foreground ml-8 whitespace-pre-wrap'
                    : 'bg-muted/50 text-foreground mr-8 border border-border/40'
                )}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-a:text-primary">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children, ...props }) => {
                          const safe = sanitizeUrl(href);
                          if (!safe) return <span>{children}</span>;
                          const isExternal = safe.startsWith('http');
                          return (
                            <a
                              {...props}
                              href={safe}
                              target={isExternal ? '_blank' : undefined}
                              rel={isExternal ? 'noopener noreferrer' : undefined}
                              onClick={(e) => {
                                if (!isExternal && safe.startsWith('/')) {
                                  e.preventDefault();
                                  navigate(safe);
                                  setOpen(false);
                                  setQuery('');
                                  setCopilotMode(false);
                                  copilot.reset();
                                }
                              }}
                            >
                              {children}
                            </a>
                          );
                        },
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            ))}

            {copilot.isThinking && copilot.messages[copilot.messages.length - 1]?.role !== 'assistant' && (
              <div className="space-y-2 mr-8">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            )}

            <button
              onClick={() => { setCopilotMode(false); copilot.reset(); setQuery(''); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← {t('commandPalette.backToSearch', { defaultValue: 'Voltar à pesquisa' })}
            </button>
          </div>
        ) : (
          <>
            <CommandEmpty>
              {query.length >= 2
                ? t('search.noResultsFor', { query })
                : t('commandPalette.typeToSearch')}
            </CommandEmpty>

            {/* AI Copilot Entry — always visible so users can escalate any query to AI */}
            <CommandGroup heading={t('commandPalette.ai', { defaultValue: 'AI Assistant' })}>
              <CommandItem
                value={`__ai__ ${query}`}
                onSelect={() => {
                  setCopilotMode(true);
                  if (query.trim()) {
                    const prompt = buildSearchContextPrompt(query);
                    setQuery('');
                    copilot.send(prompt);
                  }
                }}
                className="gap-3"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm block truncate">
                    {query.trim()
                      ? t('commandPalette.askAboutQuery', { query, defaultValue: `Perguntar à IA: "${query}"` })
                      : t('commandPalette.askCopilot', { defaultValue: 'Ask Ecosystem Copilot' })}
                  </span>
                  <span className="text-xs text-muted-foreground block">
                    {t('commandPalette.copilotDesc', { defaultValue: 'AI-powered insights about your portfolio' })}
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px]">AI ⌘↵</Badge>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />


            {/* Recent items */}
            {showRecents && (
              <>
                <CommandGroup heading={t('commandPalette.recent', { defaultValue: 'Recent' })}>
                  {recentItems.map((item, i) => (
                    <CommandItem
                      key={`recent-${i}-${item.path}`}
                      onSelect={() => runAction(item.path, item.label, item.type)}
                      className="gap-3"
                    >
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Workspaces — jump-to */}
            {matchingWorkspaces.length > 0 && (
              <CommandGroup heading={t('commandPalette.workspaces', { defaultValue: 'Workspaces' })}>
                {matchingWorkspaces.map(ws => (
                  <CommandItem
                    key={`ws-${ws.id}`}
                    onSelect={() => runAction(`/workspace/${ws.id}`, ws.startup?.name || 'Workspace', 'workspace')}
                    className="gap-3"
                  >
                    <Rocket className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{ws.startup?.name}</span>
                    {ws.program?.name && (
                      <Badge variant="outline" className="text-[10px]">{ws.program.name}</Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Search Results */}
            {hasSearchResults && !copilotMode && Object.entries(groupedResults).map(([type, items]) => (
              <CommandGroup key={type} heading={typeLabels[type] || type}>
                {items.slice(0, 5).map(result => (
                  <CommandItem
                    key={result.id}
                    onSelect={() => runAction(result.url, result.title, result.type)}
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
                    <CommandItem key={action.id} onSelect={() => runAction(action.path, action.label, 'action')} className="gap-3">
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
                    <CommandItem key={item.id} onSelect={() => runAction(item.path, item.label, 'nav')} className="gap-3">
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
