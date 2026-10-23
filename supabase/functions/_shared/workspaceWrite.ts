import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isAccountActive } from './security.ts';

/** Evaluate auth.uid()-based permissions with the caller client, never service role. */
export async function canMutateWorkspace(
  userClient: SupabaseClient, adminClient: SupabaseClient,
  userId: string, workspaceId: string, financial = false,
): Promise<boolean> {
  if (!workspaceId || !(await isAccountActive(adminClient, userId))) return false;
  const write = await userClient.rpc('can_write_workspace', { _workspace_id: workspaceId });
  if (write.error || write.data !== true) return false;
  if (!financial) return true;
  const plan = await userClient.rpc('can_edit_financial_plan', { _workspace_id: workspaceId });
  return !plan.error && plan.data === true;
}