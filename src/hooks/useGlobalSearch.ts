import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface SearchResult {
  type: 'session' | 'action' | 'note' | 'document' | 'message' | 'milestone'
      | 'startup' | 'workspace' | 'contract' | 'lead' | 'person';
  id: string;
  workspace_id: string;
  title: string;
  snippet: string;
  updated_at: string;
  url: string;
  workspace_name?: string;
}

export interface SearchFilters {
  query: string;
  types?: string[];
  workspaceIds?: string[];
  tagIds?: string[];
  dateRange?: 'week' | 'month' | 'quarter' | 'all';
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// Helper: Build FTS query from search term
function buildTsQuery(searchTerm: string): string {
  return searchTerm.split(' ').filter(Boolean).map(w => `${w}:*`).join(' & ');
}

// Global search across multiple tables using FTS
export function useGlobalSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: ['global-search', filters],
    queryFn: async () => {
      if (!filters.query || filters.query.length < 2) return [];

      const searchTerm = filters.query.trim();
      const tsQuery = buildTsQuery(searchTerm);
      const ilikeTerm = `%${searchTerm}%`;
      
      const typesToSearch = filters.types?.length 
        ? filters.types 
        : ['session', 'action', 'note', 'document', 'message', 'milestone',
           'startup', 'workspace', 'contract', 'lead', 'person'];

      // Calculate date filter
      let dateFilter: string | null = null;
      if (filters.dateRange && filters.dateRange !== 'all') {
        const now = new Date();
        if (filters.dateRange === 'week') {
          now.setDate(now.getDate() - 7);
        } else if (filters.dateRange === 'month') {
          now.setDate(now.getDate() - 30);
        } else if (filters.dateRange === 'quarter') {
          now.setDate(now.getDate() - 90);
        }
        dateFilter = now.toISOString();
      }

      // Build tag filter set
      const tagIdsSet = new Set(filters.tagIds || []);
      const hasTagFilter = tagIdsSet.size > 0;

      // Execute searches in parallel for performance
      const searchPromises: Promise<SearchResult[]>[] = [];

      // Search sessions (with session_tags join for tag filtering)
      if (typesToSearch.includes('session')) {
        searchPromises.push((async () => {
          let query = supabase
            .from('sessions')
            .select('id, workspace_id, title, notes, updated_at, workspaces!inner(startup:startups(name))')
            .or(`title.ilike.${ilikeTerm},notes.ilike.${ilikeTerm},agenda.ilike.${ilikeTerm}`)
            .limit(20);

          if (filters.workspaceIds?.length) {
            query = query.in('workspace_id', filters.workspaceIds);
          }
          if (dateFilter) {
            query = query.gte('updated_at', dateFilter);
          }

          const { data } = await query;
          let results = (data || []).map(s => ({
            type: 'session' as const,
            id: s.id,
            workspace_id: s.workspace_id,
            title: s.title,
            snippet: s.notes?.slice(0, 150) || '',
            updated_at: s.updated_at,
            url: `/workspace/${s.workspace_id}?tab=agenda`,
            workspace_name: (s.workspaces as any)?.startup?.name,
          }));

          // Apply tag filter if needed
          if (hasTagFilter && results.length > 0) {
            const { data: sessionTags } = await supabase
              .from('session_tags')
              .select('session_id, tag_id')
              .in('session_id', results.map(r => r.id));
            
            const sessionTagMap = new Map<string, Set<string>>();
            (sessionTags || []).forEach(st => {
              if (!sessionTagMap.has(st.session_id)) {
                sessionTagMap.set(st.session_id, new Set());
              }
              sessionTagMap.get(st.session_id)!.add(st.tag_id);
            });

            results = results.filter(r => {
              const tags = sessionTagMap.get(r.id);
              return tags && [...tagIdsSet].some(tid => tags.has(tid));
            });
          }

          return results;
        })());
      }

      // Search action items (with action_tags join for tag filtering)
      if (typesToSearch.includes('action')) {
        searchPromises.push((async () => {
          let query = supabase
            .from('action_items')
            .select('id, workspace_id, title, description, updated_at, workspaces!inner(startup:startups(name))')
            .or(`title.ilike.${ilikeTerm},description.ilike.${ilikeTerm}`)
            .limit(20);

          if (filters.workspaceIds?.length) {
            query = query.in('workspace_id', filters.workspaceIds);
          }
          if (dateFilter) {
            query = query.gte('updated_at', dateFilter);
          }

          const { data } = await query;
          let results = (data || []).map(a => ({
            type: 'action' as const,
            id: a.id,
            workspace_id: a.workspace_id,
            title: a.title,
            snippet: a.description?.slice(0, 150) || '',
            updated_at: a.updated_at,
            url: `/workspace/${a.workspace_id}?tab=milestones-actions-actions`,
            workspace_name: (a.workspaces as any)?.startup?.name,
          }));

          // Apply tag filter if needed
          if (hasTagFilter && results.length > 0) {
            const { data: actionTags } = await supabase
              .from('action_tags')
              .select('action_id, tag_id')
              .in('action_id', results.map(r => r.id));
            
            const actionTagMap = new Map<string, Set<string>>();
            (actionTags || []).forEach(at => {
              if (!actionTagMap.has(at.action_id)) {
                actionTagMap.set(at.action_id, new Set());
              }
              actionTagMap.get(at.action_id)!.add(at.tag_id);
            });

            results = results.filter(r => {
              const tags = actionTagMap.get(r.id);
              return tags && [...tagIdsSet].some(tid => tags.has(tid));
            });
          }

          return results;
        })());
      }

      // Search consultant notes
      if (typesToSearch.includes('note')) {
        searchPromises.push((async () => {
          let query = supabase
            .from('consultant_notes')
            .select('id, workspace_id, content, updated_at, workspaces!inner(startup:startups(name))')
            .ilike('content', ilikeTerm)
            .limit(20);

          if (filters.workspaceIds?.length) {
            query = query.in('workspace_id', filters.workspaceIds);
          }
          if (dateFilter) {
            query = query.gte('updated_at', dateFilter);
          }

          const { data } = await query;
          return (data || []).map(n => ({
            type: 'note' as const,
            id: n.id,
            workspace_id: n.workspace_id,
            title: 'Nota',
            snippet: n.content.slice(0, 150),
            updated_at: n.updated_at,
            url: `/workspace/${n.workspace_id}?tab=notes`,
            workspace_name: (n.workspaces as any)?.startup?.name,
          }));
        })());
      }

      // Search documents
      if (typesToSearch.includes('document')) {
        searchPromises.push((async () => {
          let query = supabase
            .from('documents')
            .select('id, workspace_id, name, description, updated_at, workspaces!inner(startup:startups(name))')
            .or(`name.ilike.${ilikeTerm},description.ilike.${ilikeTerm}`)
            .limit(20);

          if (filters.workspaceIds?.length) {
            query = query.in('workspace_id', filters.workspaceIds);
          }
          if (dateFilter) {
            query = query.gte('updated_at', dateFilter);
          }

          const { data } = await query;
          return (data || []).map(d => ({
            type: 'document' as const,
            id: d.id,
            workspace_id: d.workspace_id,
            title: d.name,
            snippet: d.description?.slice(0, 150) || '',
            updated_at: d.updated_at,
            url: `/workspace/${d.workspace_id}?tab=documents`,
            workspace_name: (d.workspaces as any)?.startup?.name,
          }));
        })());
      }

      // Search milestones
      if (typesToSearch.includes('milestone')) {
        searchPromises.push((async () => {
          let query = supabase
            .from('milestones')
            .select('id, workspace_id, title, description, updated_at, workspaces!inner(startup:startups(name))')
            .or(`title.ilike.${ilikeTerm},description.ilike.${ilikeTerm}`)
            .limit(20);

          if (filters.workspaceIds?.length) {
            query = query.in('workspace_id', filters.workspaceIds);
          }
          if (dateFilter) {
            query = query.gte('updated_at', dateFilter);
          }

          const { data } = await query;
          return (data || []).map(m => ({
            type: 'milestone' as const,
            id: m.id,
            workspace_id: m.workspace_id,
            title: m.title,
            snippet: m.description?.slice(0, 150) || '',
            updated_at: m.updated_at,
            url: `/workspace/${m.workspace_id}?tab=milestones-actions`,
            workspace_name: (m.workspaces as any)?.startup?.name,
          }));
        })());
      }

      // Search messages (NEW)
      if (typesToSearch.includes('message')) {
        searchPromises.push((async () => {
          // Messages need to be joined with conversations to get workspace_id
          let query = supabase
            .from('messages')
            .select(`
              id, content, updated_at, conversation_id, sender_id,
              conversation:conversations!inner(
                id, workspace_id, title,
                workspace:workspaces(startup:startups(name))
              )
            `)
            .ilike('content', ilikeTerm)
            .limit(20);

          if (dateFilter) {
            query = query.gte('updated_at', dateFilter);
          }

          const { data } = await query;
          
          let results = (data || [])
            .filter(m => {
              const conv = m.conversation as any;
              const wsId = conv?.workspace_id;
              // Apply workspace filter
              if (filters.workspaceIds?.length && wsId) {
                return filters.workspaceIds.includes(wsId);
              }
              return true;
            })
            .map(m => {
              const conv = m.conversation as any;
              return {
                type: 'message' as const,
                id: m.id,
                workspace_id: conv?.workspace_id || '',
                title: conv?.title || 'Message',
                snippet: m.content.slice(0, 150),
                updated_at: m.updated_at,
                url: `/messages?conversation=${m.conversation_id}`,
                workspace_name: conv?.workspace?.startup?.name,
              };
            });

          return results;
        })());
      }

      // Search startups (RLS will filter to what the user can see)
      if (typesToSearch.includes('startup')) {
        searchPromises.push((async () => {
          const { data } = await supabase
            .from('startups')
            .select('id, name, description, updated_at')
            .or(`name.ilike.${ilikeTerm},description.ilike.${ilikeTerm}`)
            .is('archived_at', null)
            .limit(20);
          // Map startup → its first workspace for navigation
          const ids = (data || []).map(s => s.id);
          let wsByStartup: Record<string, string> = {};
          if (ids.length) {
            const { data: ws } = await supabase
              .from('workspaces')
              .select('id, startup_id')
              .in('startup_id', ids);
            (ws || []).forEach(w => { if (!wsByStartup[w.startup_id]) wsByStartup[w.startup_id] = w.id; });
          }
          return (data || []).map(s => ({
            type: 'startup' as const,
            id: s.id,
            workspace_id: wsByStartup[s.id] || '',
            title: s.name,
            snippet: s.description?.slice(0, 150) || '',
            updated_at: s.updated_at,
            url: wsByStartup[s.id] ? `/workspace/${wsByStartup[s.id]}` : `/ecosystem?startup=${s.id}`,
            workspace_name: s.name,
          }));
        })());
      }

      // Search workspaces (by startup name / program — already filtered by RLS)
      if (typesToSearch.includes('workspace')) {
        searchPromises.push((async () => {
          const { data } = await supabase
            .from('workspaces')
            .select('id, stage, status, updated_at, startup:startups(name), program:programs(name)')
            .limit(50);
          const q = searchTerm.toLowerCase();
          return (data || [])
            .filter((w: any) =>
              w.startup?.name?.toLowerCase().includes(q) ||
              w.program?.name?.toLowerCase().includes(q)
            )
            .slice(0, 20)
            .map((w: any) => ({
              type: 'workspace' as const,
              id: w.id,
              workspace_id: w.id,
              title: w.startup?.name || 'Workspace',
              snippet: `${w.program?.name || ''} • ${w.stage || ''} • ${w.status || ''}`,
              updated_at: w.updated_at,
              url: `/workspace/${w.id}`,
              workspace_name: w.startup?.name,
            }));
        })());
      }

      // Search contracts (staff via RLS)
      if (typesToSearch.includes('contract')) {
        searchPromises.push((async () => {
          const { data } = await supabase
            .from('startup_contracts')
            .select('id, contract_number, status, updated_at, workspace_id, startup:startups(name)')
            .or(`contract_number.ilike.${ilikeTerm}`)
            .limit(20);
          return (data || []).map((c: any) => ({
            type: 'contract' as const,
            id: c.id,
            workspace_id: c.workspace_id || '',
            title: c.contract_number || 'Contract',
            snippet: `${c.startup?.name || ''} • ${c.status || ''}`,
            updated_at: c.updated_at,
            url: `/admin/contracts?contract=${c.id}`,
            workspace_name: c.startup?.name,
          }));
        })());
      }

      // Search CRM leads (staff via RLS)
      if (typesToSearch.includes('lead')) {
        searchPromises.push((async () => {
          const { data } = await supabase
            .from('funnel_items')
            .select('id, organization_name, contact_name, contact_email, stage, updated_at')
            .or(`organization_name.ilike.${ilikeTerm},contact_name.ilike.${ilikeTerm},contact_email.ilike.${ilikeTerm}`)
            .limit(20);
          return (data || []).map((l: any) => ({
            type: 'lead' as const,
            id: l.id,
            workspace_id: '',
            title: l.organization_name || l.contact_name || 'Lead',
            snippet: `${l.contact_name || ''} ${l.contact_email ? `• ${l.contact_email}` : ''} • ${l.stage || ''}`.trim(),
            updated_at: l.updated_at,
            url: `/crm?lead=${l.id}`,
          }));
        })());
      }

      // Search people (mentors / consultants / founders via profiles_safe)
      if (typesToSearch.includes('person')) {
        searchPromises.push((async () => {
          const { data } = await supabase
            .from('profiles_safe')
            .select('id, full_name, email')
            .or(`full_name.ilike.${ilikeTerm},email.ilike.${ilikeTerm}`)
            .limit(15);
          return (data || []).map((p: any) => ({
            type: 'person' as const,
            id: p.id,
            workspace_id: '',
            title: p.full_name || p.email || 'Person',
            snippet: p.email || '',
            updated_at: new Date().toISOString(),
            url: `/mentors?user=${p.id}`,
          }));
        })());
      }

      // Execute all searches in parallel
      const allResults = await Promise.all(searchPromises);
      const results = allResults.flat();

      // Sort by updated_at descending
      results.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      return results.slice(0, 50);
    },
    enabled: !!filters.query && filters.query.length >= 2,
    staleTime: 30000,
  });
}

// Get all tags
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Tag[];
    },
  });
}

// Get tags for a workspace
export function useWorkspaceTags(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-tags', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_tags')
        .select('tag:tags(*)')
        .eq('workspace_id', workspaceId!);

      if (error) throw error;
      return (data || []).map(d => d.tag) as Tag[];
    },
    enabled: !!workspaceId,
  });
}

// Get tags for a session
export function useSessionTags(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-tags', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_tags')
        .select('tag:tags(*)')
        .eq('session_id', sessionId!);

      if (error) throw error;
      return (data || []).map(d => d.tag) as Tag[];
    },
    enabled: !!sessionId,
  });
}

// Get tags for an action
export function useActionTags(actionId: string | undefined) {
  return useQuery({
    queryKey: ['action-tags', actionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('action_tags')
        .select('tag:tags(*)')
        .eq('action_id', actionId!);

      if (error) throw error;
      return (data || []).map(d => d.tag) as Tag[];
    },
    enabled: !!actionId,
  });
}

// Create a new tag
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const { data, error } = await supabase
        .from('tags')
        .insert({ name, color })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // unique violation
          // Tag already exists, fetch it
          const { data: existing } = await supabase
            .from('tags')
            .select('*')
            .eq('name', name)
            .single();
          return existing;
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Add tag to workspace
export function useAddWorkspaceTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, tagId }: { workspaceId: string; tagId: string }) => {
      const { error } = await supabase
        .from('workspace_tags')
        .insert({ workspace_id: workspaceId, tag_id: tagId });

      if (error && error.code !== '23505') throw error; // Ignore duplicate
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-tags', workspaceId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Remove tag from workspace
export function useRemoveWorkspaceTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, tagId }: { workspaceId: string; tagId: string }) => {
      const { error } = await supabase
        .from('workspace_tags')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-tags', workspaceId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Add tag to session
export function useAddSessionTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, tagId }: { sessionId: string; tagId: string }) => {
      const { error } = await supabase
        .from('session_tags')
        .insert({ session_id: sessionId, tag_id: tagId });

      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session-tags', sessionId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Remove tag from session
export function useRemoveSessionTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, tagId }: { sessionId: string; tagId: string }) => {
      const { error } = await supabase
        .from('session_tags')
        .delete()
        .eq('session_id', sessionId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session-tags', sessionId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Add tag to action
export function useAddActionTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ actionId, tagId }: { actionId: string; tagId: string }) => {
      const { error } = await supabase
        .from('action_tags')
        .insert({ action_id: actionId, tag_id: tagId });

      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_, { actionId }) => {
      queryClient.invalidateQueries({ queryKey: ['action-tags', actionId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Remove tag from action
export function useRemoveActionTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ actionId, tagId }: { actionId: string; tagId: string }) => {
      const { error } = await supabase
        .from('action_tags')
        .delete()
        .eq('action_id', actionId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: (_, { actionId }) => {
      queryClient.invalidateQueries({ queryKey: ['action-tags', actionId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Save search as saved filter
export function useSaveSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: SearchFilters }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('saved_filters')
        .insert({
          user_id: user.id,
          name,
          filters: {
            type: 'search',
            ...filters,
          },
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      toast.success(t('integrations.pesquisaGuardada'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Get saved searches
export function useSavedSearches() {
  return useQuery({
    queryKey: ['saved-searches'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).filter(f => (f.filters as any)?.type === 'search');
    },
  });
}

// Delete saved search
export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('saved_filters')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] });
      toast.success(t('integrations.pesquisaRemovida'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
