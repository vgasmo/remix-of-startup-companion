import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, FileText, CheckSquare, MessageSquare, File, Calendar, Target, Save, Loader2, X, Sparkles, Send, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useCopilotChat } from '@/hooks/useCopilotChat';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useGlobalSearch, useTags, useSaveSearch, useSavedSearches, useDeleteSavedSearch, SearchResult, SearchFilters } from '@/hooks/useGlobalSearch';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const RESULT_TYPES = [
  { key: 'session', label: 'Sessions', icon: Calendar },
  { key: 'action', label: 'Actions', icon: CheckSquare },
  { key: 'note', label: 'Notes', icon: FileText },
  { key: 'document', label: 'Documents', icon: File },
  { key: 'message', label: 'Messages', icon: MessageSquare },
  { key: 'milestone', label: 'Milestones', icon: Target },
] as const;

const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'quarter', label: 'Last 90 days' },
];

export default function SearchPage() {
  const { t } = useTranslation();
  const { isAdmin, isConsultor } = useAuth();
  const isStaff = isAdmin || isConsultor;
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [filters, setFilters] = useState<Omit<SearchFilters, 'query'>>({
    types: [],
    workspaceIds: [],
    tagIds: [],
    dateRange: undefined,
  });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState('');

  // Default: only active workspaces. Staff can toggle to see all statuses.
  const workspaceStatuses = (isStaff && showAllStatuses) ? ALL_WORKSPACE_STATUSES : undefined;
  const { data: workspaces } = useWorkspaces({}, false, workspaceStatuses);
  const { data: tags } = useTags();
  const { data: savedSearches } = useSavedSearches();
  const saveSearch = useSaveSearch();
  const deleteSearch = useDeleteSavedSearch();

  // Debounce query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
      if (query) {
        setSearchParams({ q: query });
      } else {
        setSearchParams({});
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [query, setSearchParams]);

  const searchFilters: SearchFilters = {
    query: debouncedQuery,
    ...filters,
  };

  const { data: results, isLoading } = useGlobalSearch(searchFilters);

  const toggleType = (type: string) => {
    setFilters(prev => ({
      ...prev,
      types: prev.types?.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...(prev.types || []), type],
    }));
  };

  const handleSaveSearch = () => {
    if (!searchName.trim()) {
      toast.error(t('search.enterName', 'Introduza um nome'));
      return;
    }
    saveSearch.mutate({
      name: searchName,
      filters: searchFilters,
    }, {
      onSuccess: () => {
        toast.success(t('search.saved', 'Pesquisa guardada'));
        setSaveDialogOpen(false);
        setSearchName('');
      },
    });
  };

  const loadSavedSearch = (saved: { name: string; filters: any }) => {
    const savedFilters = saved.filters as SearchFilters;
    setQuery(savedFilters.query || '');
    setFilters({
      types: savedFilters.types || [],
      workspaceIds: savedFilters.workspaceIds || [],
      tagIds: savedFilters.tagIds || [],
      dateRange: savedFilters.dateRange,
    });
    toast.success(t('search.loaded', { name: saved.name, defaultValue: `Carregada: ${saved.name}` }));
  };

  const getResultIcon = (type: string) => {
    const config = RESULT_TYPES.find(rt => rt.key === type);
    return config?.icon || FileText;
  };

  const groupedResults = results?.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>) || {};

  return (
    <AppLayout title={t('common.search')}>
      <div className="space-y-6">
        {/* Search Input */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sessions, actions, notes, documents..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!query}>
                <Save className="h-4 w-4 mr-2" />
                Save Search
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('search.saveSearch', 'Save Search')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{t('search.searchName', 'Search Name')}</Label>
                  <Input
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    placeholder={t('search.searchNamePlaceholder', 'My search...')}
                  />
                </div>
                <Button onClick={handleSaveSearch} disabled={saveSearch.isPending}>
                  {saveSearch.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('common.save', 'Save')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          {/* Type filters */}
          <div className="flex flex-wrap gap-2">
            {RESULT_TYPES.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={filters.types?.includes(key) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleType(key)}
              >
                <Icon className="h-3.5 w-3.5 mr-1" />
                {label}
              </Button>
            ))}
          </div>

          {/* Workspace filter */}
          <Select
            value={filters.workspaceIds?.[0] || 'all'}
            onValueChange={(value) => setFilters(prev => ({
              ...prev,
              workspaceIds: value === 'all' ? [] : [value],
            }))}
          >
            <SelectTrigger className="w-[200px]">
               <SelectValue placeholder={t('search.allWorkspaces', 'Todos os workspaces')} />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value="all">{t('search.allWorkspaces', 'Todos os workspaces')}</SelectItem>
              {workspaces?.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {(ws.startup as any)?.name || 'Workspace'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range filter */}
          <Select
            value={filters.dateRange || 'all'}
            onValueChange={(value) => setFilters(prev => ({
              ...prev,
              dateRange: value === 'all' ? undefined : value as 'week' | 'month' | 'quarter',
            }))}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tag filter */}
          {tags && tags.length > 0 && (
            <Select
              value={filters.tagIds?.[0] || 'all'}
              onValueChange={(value) => setFilters(prev => ({
                ...prev,
                tagIds: value === 'all' ? [] : [value],
              }))}
            >
              <SelectTrigger className="w-[150px]">
               <SelectValue placeholder={t('search.allTags', 'Todas as tags')} />
            </SelectTrigger>
            <SelectContent>
                 <SelectItem value="all">{t('search.allTags', 'Todas as tags')}</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Staff: status scope toggle */}
          {isStaff && (
            <div className="flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-muted/30">
              <Switch
                id="show-all-statuses"
                checked={showAllStatuses}
                onCheckedChange={setShowAllStatuses}
              />
              <Label htmlFor="show-all-statuses" className="text-xs text-muted-foreground cursor-pointer">
                {t('search.showAllStatuses', { defaultValue: 'Incluir importadas, pendentes e claims' })}
              </Label>
              {showAllStatuses && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 dark:text-amber-400">
                  {t('search.allStatusesActive', { defaultValue: 'Âmbito alargado' })}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Saved Searches */}
        {savedSearches && savedSearches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">{t('search.savedLabel', 'Guardadas')}:</span>
            {savedSearches.map((saved) => (
              <Badge
                key={saved.id}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80 gap-1"
                onClick={() => loadSavedSearch(saved)}
              >
                {saved.name}
                <X
                  className="h-3 w-3 ml-1 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSearch.mutate(saved.id);
                  }}
                />
              </Badge>
            ))}
          </div>
          )}

          <AskAiPanel seedQuery={debouncedQuery} />

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !debouncedQuery ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('search.startTyping', 'Comece a digitar para pesquisar sessões, ações, notas, documentos e mensagens.')}
          </div>
        ) : Object.keys(groupedResults).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('search.noResultsFor', 'Nenhum resultado encontrado para "{{query}}"', { query: debouncedQuery })}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedResults).map(([type, items]) => {
              const Icon = getResultIcon(type);
              const typeConfig = RESULT_TYPES.find(rt => rt.key === type);
              return (
                <Card key={type}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      {typeConfig?.label || type}
                      <Badge variant="secondary">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {items.map((result) => (
                        <a
                          key={result.id}
                          href={result.url}
                          className="block p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                        >
                          <div className="font-medium">{result.title}</div>
                          {result.snippet && (
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {result.snippet}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(result.updated_at).toLocaleDateString()}
                          </div>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function AskAiPanel({ seedQuery }: { seedQuery: string }) {
  const { t } = useTranslation();
  const { messages, isThinking, isAvailable, send, reset } = useCopilotChat();
  const [input, setInput] = useState('');

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim() || seedQuery.trim();
    if (!text) return;
    setInput('');
    send(text);
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('search.askAI', { defaultValue: 'Perguntar à IA' })}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} className="ml-auto h-7 px-2 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              {t('common.reset', { defaultValue: 'Limpar' })}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('search.askAIHint', { defaultValue: 'Faça uma pergunta sobre o ecossistema ou como usar a aplicação. Ex.: "startups em risco", "como criar um contrato".' })}
          </p>
        )}
        {messages.length > 0 && (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`text-sm rounded-lg p-3 ${
                  m.role === 'user'
                    ? 'bg-muted ml-8'
                    : 'bg-background border border-border/40 mr-8'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            ))}
            {isThinking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mr-8">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('copilot.thinking', { defaultValue: 'A pensar…' })}
              </div>
            )}
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              seedQuery
                ? t('search.askAIPlaceholderSeed', { query: seedQuery, defaultValue: `Perguntar sobre "${seedQuery}"…` })
                : t('search.askAIPlaceholder', { defaultValue: 'Escreva uma pergunta…' })
            }
            disabled={isThinking || !isAvailable}
            className="flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isThinking || !isAvailable || (!input.trim() && !seedQuery.trim())}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        {!isAvailable && (
          <p className="text-xs text-muted-foreground">
            {t('copilot.unavailable', { defaultValue: 'O assistente IA não está disponível neste momento.' })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

