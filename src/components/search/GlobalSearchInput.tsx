import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search, X, FileText, ListTodo, MessageSquare, File, Target, StickyNote,
  Building2, Rocket, FileSignature, Briefcase, Users, Sparkles, Clock, Bot,
  Loader2, ArrowRight, CornerDownLeft,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGlobalSearch, SearchResult } from '@/hooks/useGlobalSearch';
import { useCopilotChat } from '@/hooks/useCopilotChat';
import { cn } from '@/lib/utils';

const typeIcons: Record<string, React.ReactNode> = {
  session: <FileText className="h-4 w-4" />,
  action: <ListTodo className="h-4 w-4" />,
  note: <StickyNote className="h-4 w-4" />,
  document: <File className="h-4 w-4" />,
  message: <MessageSquare className="h-4 w-4" />,
  milestone: <Target className="h-4 w-4" />,
  startup: <Rocket className="h-4 w-4" />,
  workspace: <Building2 className="h-4 w-4" />,
  contract: <FileSignature className="h-4 w-4" />,
  lead: <Briefcase className="h-4 w-4" />,
  person: <Users className="h-4 w-4" />,
};

const TYPE_CHIPS = ['startup', 'workspace', 'contract', 'lead', 'session', 'action', 'document'] as const;

const RECENTS_KEY = 'sl-search-recents';
const MAX_RECENTS = 6;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw).slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

function saveRecent(q: string) {
  if (!q.trim()) return;
  try {
    const existing = loadRecents().filter(r => r !== q);
    localStorage.setItem(RECENTS_KEY, JSON.stringify([q, ...existing].slice(0, MAX_RECENTS)));
  } catch { /* ignore */ }
}

export function GlobalSearchInput() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const [activeIndex, setActiveIndex] = useState(0);
  const [aiMode, setAiMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const copilot = useCopilotChat();

  // Debounce
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(h);
  }, [query]);

  const { data: results, isLoading } = useGlobalSearch({
    query: aiMode ? '' : debouncedQuery,
    types: activeTypes.length ? activeTypes : undefined,
  });

  const typeLabels: Record<string, string> = {
    session: t('search.types.sessions'),
    action: t('search.types.actions'),
    note: t('search.types.notes'),
    document: t('search.types.documents'),
    message: t('search.types.messages'),
    milestone: t('search.types.milestones'),
    startup: t('search.types.startups', { defaultValue: 'Startups' }),
    workspace: t('search.types.workspaces', { defaultValue: 'Workspaces' }),
    contract: t('search.types.contracts', { defaultValue: 'Contratos' }),
    lead: t('search.types.leads', { defaultValue: 'Leads' }),
    person: t('search.types.people', { defaultValue: 'Pessoas' }),
  };

  const grouped = useMemo(() => {
    return (results || []).reduce((acc, r) => {
      (acc[r.type] ||= []).push(r);
      return acc;
    }, {} as Record<string, SearchResult[]>);
  }, [results]);

  const flatResults = useMemo(() =>
    Object.values(grouped).flatMap(items => items.slice(0, 4)),
    [grouped]
  );

  const handleSelect = useCallback((r: SearchResult) => {
    saveRecent(query);
    setRecents(loadRecents());
    navigate(r.url);
    setOpen(false);
    setQuery('');
    setAiMode(false);
  }, [navigate, query]);

  const handleViewAll = () => {
    saveRecent(query);
    setRecents(loadRecents());
    navigate(`/search?q=${encodeURIComponent(query)}`);
    setOpen(false);
  };

  const handleAskAI = useCallback(async () => {
    if (!query.trim()) return;
    setAiMode(true);
    saveRecent(query);
    setRecents(loadRecents());
    await copilot.send(query);
  }, [query, copilot]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  // Global Cmd+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0); }, [debouncedQuery, activeTypes]);

  // Keyboard navigation inside the popover
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (aiMode) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex < flatResults.length) {
        handleSelect(flatResults[activeIndex]);
      } else if (query.trim()) {
        handleViewAll();
      }
    } else if (e.key === 'Escape') {
      if (query) setQuery(''); else setOpen(false);
    } else if (e.metaKey && e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      handleAskAI();
    }
  };

  const showRecents = !query && !aiMode && recents.length > 0;
  const hasResults = (results?.length || 0) > 0;

  return (
    <Popover open={open && (query.length >= 2 || aiMode || showRecents)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-[200px] sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            placeholder={t('common.search') + '...'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (aiMode) setAiMode(false);
              if (e.target.value.length >= 2 || recents.length) setOpen(true);
            }}
            onFocus={() => { if (query.length >= 2 || recents.length > 0) setOpen(true); }}
            onKeyDown={onInputKeyDown}
            className="pl-9 pr-16 text-sm"
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); setAiMode(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-1 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              ⌘K
            </kbd>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[480px] p-0" align="start">
        {/* Type chips */}
        {!aiMode && (
          <div className="flex flex-wrap gap-1 p-2 border-b border-border/40">
            {TYPE_CHIPS.map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border transition-colors',
                  activeTypes.includes(type)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted'
                )}
              >
                {typeIcons[type]}
                {typeLabels[type]}
              </button>
            ))}
          </div>
        )}

        <ScrollArea  viewportClassName="max-h-[440px]">
          {/* AI mode */}
          {aiMode ? (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Bot className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">{t('copilot.title', { defaultValue: 'Copilot do Ecossistema' })}</span>
                {copilot.isThinking && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
              </div>
              {copilot.messages.map(m => (
                <div key={m.id} className={cn(
                  'rounded-lg p-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'bg-primary/10 text-foreground ml-6'
                    : 'bg-muted/50 text-foreground mr-6'
                )}>
                  {m.content}
                </div>
              ))}
              {copilot.isThinking && copilot.messages[copilot.messages.length - 1]?.role !== 'assistant' && (
                <div className="bg-muted/50 rounded-lg p-2.5 text-sm text-muted-foreground mr-6">
                  {t('copilot.thinking', { defaultValue: 'A pensar…' })}
                </div>
              )}
              <button
                onClick={() => { setAiMode(false); copilot.reset(); }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                ← {t('search.backToResults', { defaultValue: 'Voltar aos resultados' })}
              </button>
            </div>
          ) : isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('search.searching')}
            </div>
          ) : showRecents && !hasResults ? (
            <div className="p-2">
              <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                <Clock className="h-3 w-3" />
                {t('search.recent', { defaultValue: 'Recentes' })}
              </div>
              {recents.map((r, i) => (
                <button
                  key={`recent-${i}`}
                  onClick={() => { setQuery(r); inputRef.current?.focus(); }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-center gap-2"
                >
                  <Search className="h-3 w-3 text-muted-foreground" />
                  {r}
                </button>
              ))}
            </div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-sm text-muted-foreground space-y-3">
              <div>{t('search.noResultsFor', { query })}</div>
              {query.trim().length >= 3 && (
                <Button size="sm" variant="outline" onClick={handleAskAI} className="gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {t('search.askAI', { defaultValue: 'Perguntar à IA' })}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {Object.entries(grouped).map(([type, items]) => {
                const slice = items.slice(0, 4);
                const startIdx = flatResults.findIndex(r => r.id === slice[0]?.id);
                return (
                  <div key={type} className="p-2">
                    <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      {typeIcons[type]}
                      {typeLabels[type]} <span className="opacity-60">({items.length})</span>
                    </div>
                    {slice.map((r, i) => {
                      const flatIdx = startIdx + i;
                      const active = flatIdx === activeIndex;
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleSelect(r)}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          className={cn(
                            'w-full text-left px-2 py-2 rounded transition-colors',
                            active ? 'bg-accent' : 'hover:bg-muted'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">{r.title}</span>
                            {r.workspace_name && r.type !== 'startup' && r.type !== 'workspace' && (
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                                {r.workspace_name}
                              </Badge>
                            )}
                          </div>
                          {r.snippet && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {r.snippet}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer actions */}
        {!aiMode && (query.length >= 2 || hasResults) && (
          <div className="border-t border-border/40 p-2 flex items-center justify-between gap-2 bg-muted/20">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="hidden sm:inline-flex items-center gap-1">
                <kbd className="px-1 rounded border border-border/60">↑↓</kbd> nav
              </span>
              <span className="hidden sm:inline-flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" /> abrir
              </span>
              <span className="hidden sm:inline-flex items-center gap-1">
                <kbd className="px-1 rounded border border-border/60">⌘↵</kbd> IA
              </span>
            </div>
            <div className="flex items-center gap-1">
              {query.trim().length >= 3 && (
                <Button size="sm" variant="ghost" onClick={handleAskAI} className="gap-1 h-7">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-xs">{t('search.askAI', { defaultValue: 'Perguntar à IA' })}</span>
                </Button>
              )}
              {hasResults && (
                <Button size="sm" variant="ghost" onClick={handleViewAll} className="gap-1 h-7">
                  <span className="text-xs">{t('search.viewAllResults')}</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
