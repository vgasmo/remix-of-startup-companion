import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

/**
 * Automatically materializes acceleration deliverables (gates→milestones, week deliverables→actions)
 * when a workspace belongs to an acceleration program and hasn't been materialized yet.
 */
export function useAutoMaterializeDeliverables(
  workspaceId: string | undefined,
  programId: string | undefined,
  programType: string | undefined,
) {
  const queryClient = useQueryClient();

  const isAcceleration = programType === 'acceleration';
  const enabled = !!workspaceId && !!programId && isAcceleration;

  // Check if there are pending deliverables (either no milestones materialized,
  // or some materialized actions are missing their auto-linked platform document).
  const { data: hasMaterialized, isSuccess: checkDone } = useQuery({
    queryKey: ['acceleration-materialized', workspaceId, programId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (!workspaceId || !programId) return true;
      // Scope the "already materialized" check to the CURRENT program, so that
      // switching a workspace between acceleration programs re-materializes the
      // new program's gates/deliverables instead of being blocked by leftover
      // milestones from the previous program.
      const { data, error } = await supabase
        .from('milestones')
        .select('id, source_gate:program_gates!milestones_source_gate_id_fkey(program_id)')
        .eq('workspace_id', workspaceId)
        .not('source_gate_id', 'is', null);
      if (error) {
        logger.error('materialize_deliverables_check_failed', { workspaceId, error: error.message });
        return true; // Assume materialized on error to avoid infinite retry
      }
      const matches = (data ?? []).filter((row: any) => row?.source_gate?.program_id === programId);
      logger.debug('materialize_deliverables_check_result', {
        workspaceId,
        programId,
        totalSourceLinked: data?.length ?? 0,
        matchingCurrentProgram: matches.length,
      });
      return matches.length > 0;
    },
  });

  const materializeMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !programId) throw new Error('Missing workspace or program');
      logger.debug('materialize_deliverables_rpc_start', { workspaceId, programId });
      const { data, error } = await supabase.rpc('materialize_acceleration_deliverables', {
        p_workspace_id: workspaceId,
        p_program_id: programId,
      });
      if (error) throw new Error(error.message || JSON.stringify(error));
      logger.debug('materialize_deliverables_rpc_result', { data });
      return data as { milestones_created: number; actions_created: number };
    },
    onSuccess: (result) => {
      logger.info('materialize_deliverables_success', { workspaceId, programId, result });
      queryClient.invalidateQueries({ queryKey: ['workspace-milestones', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-tab-badges', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['acceleration-materialized', workspaceId] });
    },
    onError: (err: unknown) => {
      // Allow retry on next mount
      didAutoMaterialize.current = false;
      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      logger.error('materialize_deliverables_rpc_failed', { workspaceId, programId, error: errorMsg });
      logger.warn('materialize_deliverables_failed', {
        workspaceId,
        programId,
        error: errorMsg,
      });
    },
  });

  const didAutoMaterialize = useRef(false);

  // Reset ref when workspace changes so re-materialization can happen for new workspaces
  const lastWorkspaceId = useRef(workspaceId);
  useEffect(() => {
    if (workspaceId !== lastWorkspaceId.current) {
      didAutoMaterialize.current = false;
      lastWorkspaceId.current = workspaceId;
    }
  }, [workspaceId]);

  useEffect(() => {
    if (
      enabled &&
      checkDone &&
      hasMaterialized === false &&
      !materializeMutation.isPending &&
      !didAutoMaterialize.current
    ) {
      logger.debug('materialize_deliverables_trigger', { workspaceId, programId, programType });
      didAutoMaterialize.current = true;
      materializeMutation.mutate();
    }
  }, [enabled, checkDone, hasMaterialized, materializeMutation.isPending, workspaceId, programId, programType]);

  return { hasMaterialized, isPending: materializeMutation.isPending };
}
