import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireCronSecret } from '../_shared/security.ts';
import { syncIntakeOnCompleted } from '../_shared/lifecycleSync.ts';
import { handleLifecycleSyncResult } from '../_shared/lifecycleSyncResultHandler.ts';

Deno.serve(async (req) => {
  const authorization = await requireCronSecret(req);
  if ('error' in authorization) return authorization.error;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return Response.json({ error: 'service_unavailable' }, { status: 503 });
  const client = createClient(url, key);
  const { data: contracts, error } = await client.from('startup_contracts')
    .select('id, workspace_id').eq('activation_sync_pending', true)
    .in('status', ['draft', 'pending_signature', 'active'])
    .in('signature_status', ['signed', 'completed'])
    .not('signed_at', 'is', null).order('updated_at', { ascending: true }).limit(50);
  if (error) return Response.json({ error: 'recovery_lookup_failed' }, { status: 503 });
  let completed = 0;
  for (const contract of contracts ?? []) {
    try {
      const result = await syncIntakeOnCompleted(client, contract.id, contract.workspace_id, null, 'activation_recovery');
      await handleLifecycleSyncResult(client, result, {
        contractId: contract.id, workspaceId: result.workspaceId ?? contract.workspace_id,
        source: 'activation_recovery', operation: 'completed',
      });
      if (result.synced && !result.awaitingFounder) completed++;
    } catch (err) {
      console.error('activation recovery failed', { contractId: contract.id, error: String(err) });
    }
  }
  return Response.json({ checked: contracts?.length ?? 0, completed });
});