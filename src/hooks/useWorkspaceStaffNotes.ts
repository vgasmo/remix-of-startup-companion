import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface WorkspaceStaffNotes {
  health_notes: string | null;
  priority_notes: string | null;
}

export const workspaceStaffNotesKey = (workspaceId: string | undefined) => ['workspace-staff-notes', workspaceId] as const;

/**
 * Notas internas do staff sobre um workspace (saúde e prioridade).
 * Vivem em workspace_staff_notes, que só o staff lê: o founder nunca as recebe, nem por API.
 */
export function useWorkspaceStaffNotes(workspaceId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: workspaceStaffNotesKey(workspaceId),
    enabled: !!workspaceId && enabled,
    queryFn: async (): Promise<WorkspaceStaffNotes | null> => {
      const { data, error } = await supabase
        .from('workspace_staff_notes')
        .select('health_notes, priority_notes')
        .eq('workspace_id', workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Grava só os campos indicados. Lança erro se a RLS não deixar gravar (0 linhas devolvidas). */
export async function saveWorkspaceStaffNotes(
  workspaceId: string,
  patch: Partial<WorkspaceStaffNotes>,
  userId: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('workspace_staff_notes')
    .upsert(
      { workspace_id: workspaceId, ...patch, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id' },
    )
    .select('workspace_id');
  if (error) throw error;
  if (!data?.length) throw new Error('workspace_staff_notes: 0 rows written');
}
