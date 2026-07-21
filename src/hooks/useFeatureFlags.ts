import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

/**
 * All feature flag keys, in one place. The `FeatureFlagKey` union is derived
 * from this array so the admin picker and the type stay in sync.
 */
export const FEATURE_FLAG_KEYS = [
  'public_first_contact_booking',
  'funnel_ui',
  'founder_gamification',
  'traction_stage',
  'crm_graph_email_sync',
  'crm_ai_recap',
  'open_registration',
  'financial_business_plan_coach_v1',
  'hubspot_importer_v2',
  'founder_monthly_pulse',
] as const;

export type FeatureFlagKey = typeof FEATURE_FLAG_KEYS[number];

interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  scope: 'global' | 'program' | 'workspace';
  program_id: string | null;
  workspace_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to check if a feature flag is enabled.
 * Precedence: workspace override → program override → global.
 */
export function useFeatureFlag(
  key: FeatureFlagKey,
  programId?: string,
  workspaceId?: string,
): boolean {
  const { data: flags } = useFeatureFlags();

  if (!flags) return false;

  // Workspace-scoped override wins (used for admin-driven pilots).
  if (workspaceId) {
    const wsFlag = flags.find(
      (f) => f.key === key && f.scope === 'workspace' && f.workspace_id === workspaceId,
    );
    if (wsFlag) return wsFlag.enabled;
  }

  // Program override next.
  if (programId) {
    const programFlag = flags.find(
      (f) => f.key === key && f.scope === 'program' && f.program_id === programId,
    );
    if (programFlag) return programFlag.enabled;
  }

  // Global fallback.
  const globalFlag = flags.find((f) => f.key === key && f.scope === 'global');
  return globalFlag?.enabled ?? false;
}

/**
 * Hook to get all feature flags.
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: async (): Promise<FeatureFlag[]> => {
      // Skip when unauthenticated — flags are RLS-protected and unused on public pages.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('key');

      if (error) {
        // Demote to warn: a transient RLS/network failure here just falls back to "off",
        // which is the safe default. No user impact.
        logger.warn('[useFeatureFlags] Falling back to empty flag set', { code: error.code, message: error.message });
        return [];
      }

      return (data ?? []) as FeatureFlag[];
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
    retry: false,
  });
}

/**
 * Hook to update a feature flag (admin only).
 */
export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });
}

/**
 * Hook to create a program-scoped feature flag override (admin only).
 */
export function useCreateProgramFlag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      key, 
      programId, 
      enabled, 
      description 
    }: { 
      key: FeatureFlagKey; 
      programId: string; 
      enabled: boolean;
      description?: string;
    }) => {
      const { error } = await supabase
        .from('feature_flags')
        .insert({
          key,
          program_id: programId,
          scope: 'program',
          enabled,
          description: description ?? `Program override for ${key}`,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });
}

/**
 * Hook to create or toggle a workspace-scoped feature flag override (admin only).
 * Upserts on (key, workspace_id) — running with a new `enabled` value flips the pilot.
 */
export function useUpsertWorkspaceFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      key,
      workspaceId,
      enabled,
      description,
    }: {
      key: FeatureFlagKey;
      workspaceId: string;
      enabled: boolean;
      description?: string;
    }) => {
      // Look for an existing workspace-scoped row first — the partial unique
      // index (key, workspace_id) WHERE scope='workspace' guarantees at most one.
      const { data: existing, error: selErr } = await supabase
        .from('feature_flags')
        .select('id')
        .eq('key', key)
        .eq('scope', 'workspace')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing?.id) {
        const { error } = await supabase
          .from('feature_flags')
          .update({ enabled, description: description ?? undefined })
          .eq('id', existing.id);
        if (error) throw error;
        return existing.id;
      }

      const { data, error } = await supabase
        .from('feature_flags')
        .insert({
          key,
          scope: 'workspace',
          workspace_id: workspaceId,
          program_id: null,
          enabled,
          description: description ?? `Workspace pilot override for ${key}`,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });
}

/**
 * Hook to delete a workspace-scoped override, reverting the workspace to
 * the program/global default. Admin only (RLS enforced).
 */
export function useDeleteWorkspaceFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('feature_flags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });
}
