import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';

export interface TierTag {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Fetch the three Tier tags (Tier 1 / 2 / 3) from the "tier" tag category.
 * Cached indefinitely — these rarely change.
 */
export function useTierTags() {
  return useQuery({
    queryKey: ['tier-tags'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TierTag[]> => {
      const { data: cat } = await supabase
        .from('tag_categories')
        .select('id')
        .eq('slug', 'tier')
        .maybeSingle();
      if (!cat?.id) return [];
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('category_id', cat.id)
        .order('name');
      if (error) throw error;
      return (data ?? []) as TierTag[];
    },
  });
}

/**
 * Fetch the current tier tag assignment for a list of workspaces.
 * Returns a Map<workspace_id, TierTag>.
 */
export function useWorkspaceTiers(workspaceIds: string[]) {
  const key = [...workspaceIds].sort().join(',');
  return useQuery({
    queryKey: ['workspace-tiers', key],
    enabled: workspaceIds.length > 0,
    queryFn: async (): Promise<Record<string, TierTag>> => {
      const { data: cat } = await supabase
        .from('tag_categories')
        .select('id')
        .eq('slug', 'tier')
        .maybeSingle();
      if (!cat?.id) return {};
      const { data: tierTags } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('category_id', cat.id);
      const tierIds = (tierTags ?? []).map((t) => t.id);
      if (tierIds.length === 0) return {};
      const { data, error } = await supabase
        .from('workspace_tags')
        .select('workspace_id, tag_id, tag:tags(id, name, color)')
        .in('workspace_id', workspaceIds)
        .in('tag_id', tierIds);
      if (error) throw error;
      const out: Record<string, TierTag> = {};
      for (const row of data ?? []) {
        const tag = (row as { tag: TierTag | null }).tag;
        const wsId = (row as { workspace_id: string }).workspace_id;
        if (tag) out[wsId] = tag;
      }
      return out;
    },
  });
}

/**
 * Set (or clear) the tier tag on a workspace. Removes any existing tier tag
 * on that workspace before assigning the new one so the tier is single‑valued.
 */
export function useSetWorkspaceTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      tagId,
      allTierTagIds,
    }: {
      workspaceId: string;
      tagId: string | null;
      allTierTagIds: string[];
    }) => {
      // Remove any current tier tags for this workspace
      if (allTierTagIds.length > 0) {
        const { error: delErr } = await supabase
          .from('workspace_tags')
          .delete()
          .eq('workspace_id', workspaceId)
          .in('tag_id', allTierTagIds);
        if (delErr) throw delErr;
      }
      if (tagId) {
        const { error: insErr } = await supabase
          .from('workspace_tags')
          .insert({ workspace_id: workspaceId, tag_id: tagId });
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-tiers'] });
      notify.success('Tier atualizado');
    },
    onError: (e: Error) => notify.error(e.message),
  });
}
