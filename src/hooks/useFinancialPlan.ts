// Guided Financial Plan — session, assumptions, and prefill proposal hooks.
// Backend tables: financial_plan_sessions, financial_assumptions, financial_prefill_proposals.
// All RLS-scoped to the workspace; no silent AI writes (source enum enforces provenance).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';


export type PlanScenario = 'base' | 'conservative' | 'optimistic';
export type AssumptionSource =
  | 'founder'
  | 'prefill_profile'
  | 'prefill_kpi'
  | 'prefill_ai'
  | 'imported_xlsm';
export type PrefillStatus = 'pending' | 'accepted' | 'rejected';

export interface FinancialPlanSession {
  id: string;
  workspace_id: string;
  active_version_id: string | null;
  scenario: PlanScenario;
  current_step: string;
  diagnostic_json: Record<string, unknown>;
  completed_packs: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialAssumption {
  id: string;
  workspace_id: string;
  version_id: string | null;
  scenario: PlanScenario;
  key: string;
  period_index: number | null;
  value_numeric: number | null;
  value_json: Record<string, unknown> | null;
  unit: string | null;
  source: AssumptionSource;
  confidence: number | null;
  rationale: string | null;
  owner_user_id: string | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialPrefillProposal {
  id: string;
  workspace_id: string;
  scenario: PlanScenario;
  key: string;
  period_index: number | null;
  proposed_value_numeric: number | null;
  proposed_value_json: Record<string, unknown> | null;
  unit: string | null;
  source: AssumptionSource;
  evidence: Record<string, unknown>;
  status: PrefillStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// -------- Session ----------------------------------------------------------

export function useFinancialPlanSession(workspaceId: string | undefined, scenario: PlanScenario = 'base') {
  return useQuery({
    queryKey: ['financial-plan-session', workspaceId, scenario],
    enabled: !!workspaceId,
    queryFn: async (): Promise<FinancialPlanSession | null> => {
      const { data, error } = await supabase
        .from('financial_plan_sessions')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('scenario', scenario)
        .maybeSingle();
      if (error) throw error;
      return (data as FinancialPlanSession | null) ?? null;
    },
    staleTime: 15_000,
  });
}

export function useUpsertFinancialPlanSession(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<FinancialPlanSession> & { scenario: PlanScenario }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        workspace_id: workspaceId,
        scenario: patch.scenario,
        current_step: patch.current_step ?? 'diagnostic',
        diagnostic_json: patch.diagnostic_json ?? {},
        completed_packs: patch.completed_packs ?? [],
        active_version_id: patch.active_version_id ?? null,
        created_by: userRes.user?.id ?? null,
      };
      const { data, error } = await supabase
        .from('financial_plan_sessions')
        .upsert([payload as any], { onConflict: 'workspace_id,scenario' })
        .select()
        .single();
      if (error) throw error;
      return data as FinancialPlanSession;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: ['financial-plan-session', workspaceId, vars.scenario] });
    },
  });
}

// -------- Assumptions ------------------------------------------------------

export function useFinancialAssumptions(workspaceId: string | undefined, scenario: PlanScenario = 'base') {
  return useQuery({
    queryKey: ['financial-assumptions', workspaceId, scenario],
    enabled: !!workspaceId,
    queryFn: async (): Promise<FinancialAssumption[]> => {
      const { data, error } = await supabase
        .from('financial_assumptions')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('scenario', scenario)
        .order('key');
      if (error) throw error;
      return (data ?? []) as FinancialAssumption[];
    },
    staleTime: 10_000,
  });
}

export interface SaveAssumptionInput {
  key: string;
  scenario?: PlanScenario;
  period_index?: number | null;
  value_numeric?: number | null;
  value_json?: Record<string, unknown> | null;
  unit?: string | null;
  source?: AssumptionSource;
  confidence?: number | null;
  rationale?: string | null;
  version_id?: string | null;
}

export function useSaveAssumption(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveAssumptionInput) => {
      const { data: userRes } = await supabase.auth.getUser();
      const scenario = input.scenario ?? 'base';
      const payload = {
        workspace_id: workspaceId,
        scenario,
        key: input.key,
        period_index: input.period_index ?? null,
        value_numeric: input.value_numeric ?? null,
        value_json: input.value_json ?? null,
        unit: input.unit ?? null,
        source: input.source ?? 'founder',
        confidence: input.confidence ?? null,
        rationale: input.rationale ?? null,
        version_id: input.version_id ?? null,
        owner_user_id: userRes.user?.id ?? null,
        last_validated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('financial_assumptions')
        .upsert([payload as any], { onConflict: 'workspace_id,scenario,key,period_index' })
        .select()
        .single();
      if (error) throw error;
      return data as FinancialAssumption;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['financial-assumptions', workspaceId, row.scenario] });
    },
  });
}

export function useDeleteAssumption(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('financial_assumptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-assumptions', workspaceId] });
    },
  });
}

// -------- Prefill proposals -----------------------------------------------

export function usePrefillProposals(workspaceId: string | undefined, scenario: PlanScenario = 'base') {
  return useQuery({
    queryKey: ['financial-prefill-proposals', workspaceId, scenario],
    enabled: !!workspaceId,
    queryFn: async (): Promise<FinancialPrefillProposal[]> => {
      const { data, error } = await supabase
        .from('financial_prefill_proposals')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('scenario', scenario)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FinancialPrefillProposal[];
    },
    staleTime: 10_000,
  });
}

export function useResolvePrefillProposal(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposal, action }: { proposal: FinancialPrefillProposal; action: 'accept' | 'reject' }) => {
      const { data: userRes } = await supabase.auth.getUser();
      if (action === 'accept') {
        // Materialize into financial_assumptions with the same source.
        const { error: upErr } = await supabase.from('financial_assumptions')
          .upsert([{
            workspace_id: workspaceId,
            scenario: proposal.scenario,
            key: proposal.key,
            period_index: proposal.period_index,
            value_numeric: proposal.proposed_value_numeric,
            value_json: proposal.proposed_value_json,
            unit: proposal.unit,
            source: proposal.source,
            confidence: null,
            rationale: `Accepted from ${proposal.source}`,
            owner_user_id: userRes.user?.id ?? null,
            last_validated_at: new Date().toISOString(),
          } as any],
          { onConflict: 'workspace_id,scenario,key,period_index' },
        );
        if (upErr) throw upErr;
      }
      const { error } = await supabase
        .from('financial_prefill_proposals')
        .update({
          status: action === 'accept' ? 'accepted' : 'rejected',
          reviewed_by: userRes.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', proposal.id);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['financial-prefill-proposals', workspaceId, vars.proposal.scenario] });
      qc.invalidateQueries({ queryKey: ['financial-assumptions', workspaceId, vars.proposal.scenario] });
    },
  });
}

// -------- Prefill generation (server-side) --------------------------------
// Calls the `generate-financial-prefill` edge function. Never writes directly
// to `financial_assumptions` — it inserts *pending* proposals that the founder
// must accept, preserving the "no silent AI writes" contract.
export function useGeneratePrefill(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scenario: PlanScenario = 'base') => {
      const { data, error } = await invokeWithAuth<{
        success: boolean;
        proposals_created: number;
        skipped_keys: string[];
        warnings: string[];
      }>('generate-financial-prefill', { body: { workspace_id: workspaceId, scenario } });
      if (error) throw error;
      return data!;
    },
    onSuccess: (_r, scenario) => {
      qc.invalidateQueries({ queryKey: ['financial-prefill-proposals', workspaceId, scenario] });
    },
  });
}

// -------- XLSM export from guided plan ------------------------------------
// Reuses `export-financial-model` in its assumptions-driven branch: pass
// { workspace_id, scenario } and it fills the canonical XLSM from
// financial_assumptions (VBA byte-preserved).
export function useExportGuidedPlanXlsm(workspaceId: string) {
  return useMutation({
    mutationFn: async (scenario: PlanScenario = 'base') => {
      const { data, error } = await invokeWithAuth<{
        success: boolean;
        download_url: string;
        expires_in: number;
        patched_sheets: string[];
        patch_count: number;
        warnings: string[];
      }>('export-financial-model', { body: { workspace_id: workspaceId, scenario } });
      if (error) throw error;
      return data!;
    },
  });
}

