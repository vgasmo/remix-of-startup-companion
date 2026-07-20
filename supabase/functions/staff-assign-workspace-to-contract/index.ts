/**
 * staff-assign-workspace-to-contract
 *
 * Staff-only: assigns a workspace to an existing contract (fixes the
 * "contract active without workspace" lifecycle mismatch). If the contract
 * has a legal representative email, ensures a founder auth account + role +
 * workspace membership exist, so the founder appears in the user list.
 *
 * Body: { contract_id: string, workspace_id: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireUser, generateRequestId, createLogger, errorResponse, ErrorCode } from '../_shared/security.ts';
import { autoCreateFounderAccount, enqueueFounderInviteTask } from '../_shared/founderAccount.ts';

const FUNCTION_NAME = 'staff-assign-workspace-to-contract';

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const authRes = await requireUser(req, userClient);
    if ('error' in authRes) return authRes.error;
    const { user } = authRes;

    const admin = createClient(supabaseUrl, serviceKey);

    // Staff check
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const isStaff = (roles || []).some((r: any) => ['admin', 'consultor'].includes(r.role));
    if (!isStaff) {
      return errorResponse(req, 'Staff role required', ErrorCode.FORBIDDEN, 403);
    }

    const body = await req.json().catch(() => ({}));
    const contractId = String(body.contract_id || '').trim();
    const workspaceId = String(body.workspace_id || '').trim();
    if (!contractId || !workspaceId) {
      return errorResponse(req, 'contract_id and workspace_id required', ErrorCode.BAD_REQUEST, 400);
    }

    const { data: contract, error: cErr } = await admin
      .from('startup_contracts')
      .select('id, status, workspace_id, legal_representative_email, legal_representative_name')
      .eq('id', contractId)
      .single();
    if (cErr || !contract) {
      return errorResponse(req, 'Contract not found', ErrorCode.NOT_FOUND, 404);
    }
    if (contract.workspace_id && contract.workspace_id !== workspaceId) {
      return errorResponse(
        req,
        'Contract already linked to a different workspace',
        ErrorCode.BAD_REQUEST,
        409,
      );
    }

    const { data: ws, error: wsErr } = await admin
      .from('workspaces')
      .select('id, startup_id, status')
      .eq('id', workspaceId)
      .single();
    if (wsErr || !ws) {
      return errorResponse(req, 'Workspace not found', ErrorCode.NOT_FOUND, 404);
    }

    // Update contract
    const { error: updErr } = await admin
      .from('startup_contracts')
      .update({ workspace_id: workspaceId, updated_at: new Date().toISOString() })
      .eq('id', contractId);
    if (updErr) throw updErr;

    log.info('contract_workspace_assigned', { contractId, workspaceId, actorId: user.id });

    // If contract is active and we have a founder email, ensure founder account exists.
    let founder: { ok: boolean; userId?: string; reason?: string } = { ok: false, reason: 'skipped' };
    if (contract.status === 'active' && contract.legal_representative_email) {
      founder = await autoCreateFounderAccount(admin, {
        id: contract.id,
        workspace_id: workspaceId,
        legal_representative_email: contract.legal_representative_email,
        legal_representative_name: contract.legal_representative_name,
      });
      if (!founder.ok) {
        await enqueueFounderInviteTask(
          admin,
          {
            id: contract.id,
            workspace_id: workspaceId,
            legal_representative_email: contract.legal_representative_email,
            legal_representative_name: contract.legal_representative_name,
          },
          founder.reason || 'unknown',
        );
      }
    }

    return corsJsonResponse(
      { ok: true, contract_id: contractId, workspace_id: workspaceId, founder },
      req,
      200,
    );
  } catch (err: any) {
    log.error('failed', { error: String(err?.message || err) });
    return errorResponse(req, String(err?.message || err), ErrorCode.INTERNAL_ERROR, 500);
  }
});
