/**
 * Client Lifecycle Sync — UI MIRROR (NOT canonical truth)
 *
 * The CANONICAL source of truth for contract → intake → CRM → workspace
 * synchronization is the SERVER helper at:
 *   supabase/functions/_shared/lifecycleSync.ts
 *
 * This file exists ONLY for UI-initiated manual transitions performed by
 * authenticated staff (e.g. "Mark as Sent" / "Mark as Signed" buttons in
 * ContractDetailDrawer) where invoking an edge function would add latency
 * with no extra integrity benefit (these flows are RLS-gated to staff).
 *
 * IMPORTANT: These helpers MUST surface intake/CRM/workspace sync failures
 * back to the UI so a manual action cannot be reported as success when a
 * downstream sync silently failed. Callers must check `success === true`
 * AND the absence of `syncError` before toasting success.
 *
 * All webhook / automated paths (DocuSign, PandaDoc, public onboarding,
 * bulk creation) MUST use the server helper instead.
 */
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';
import { INTAKE_TO_CRM_STAGE, type IntakeState } from '@/constants/intakeStates';

/**
 * After a contract signature event, sync the linked intake and CRM stage.
 * 
 * @param contractId - The startup_contracts.id
 * @param targetIntakeStatus - The intake status to transition to
 * @param userId - The user performing the action (for audit trail)
 */
export async function syncIntakeOnContractEvent(
  contractId: string,
  targetIntakeStatus: IntakeState,
  userId?: string,
): Promise<{ synced: boolean; intakeId?: string; error?: string }> {
  try {
    // Find the linked intake
    const { data: intake, error: findErr } = await supabase
      .from('contract_intakes')
      .select('id, status, funnel_item_id')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr) {
      logger.warn('lifecycle_sync_find_failed', { contractId, error: findErr.message });
      return { synced: false, error: findErr.message };
    }

    if (!intake) {
      // No intake linked — this is valid for legacy/manual contracts
      logger.info('lifecycle_sync_no_intake', { contractId, targetIntakeStatus });
      return { synced: false, error: 'no_linked_intake' };
    }

    // Don't regress intake status (e.g., don't go from 'activated' back to 'signed')
    const STATUS_ORDER: IntakeState[] = [
      'draft_internal', 'intake_requested', 'intake_in_progress', 'intake_submitted',
      'review_pending', 'changes_requested', 'approved_for_signature',
      'signature_sent', 'signed', 'activated',
    ];
    const currentIdx = STATUS_ORDER.indexOf(intake.status as IntakeState);
    const targetIdx = STATUS_ORDER.indexOf(targetIntakeStatus);
    
    if (currentIdx >= targetIdx && intake.status !== 'cancelled') {
      logger.info('lifecycle_sync_skip_regression', {
        contractId, intakeId: intake.id,
        currentStatus: intake.status, targetStatus: targetIntakeStatus,
      });
      return { synced: false, intakeId: intake.id, error: 'would_regress' };
    }

    // Update intake status
    const { error: updateErr } = await supabase
      .from('contract_intakes')
      .update({ status: targetIntakeStatus })
      .eq('id', intake.id);

    if (updateErr) {
      logger.error('lifecycle_sync_update_failed', { intakeId: intake.id, error: updateErr.message });
      return { synced: false, intakeId: intake.id, error: updateErr.message };
    }

    // Log audit event
    await supabase.from('intake_events').insert({
      intake_id: intake.id,
      event_type: `lifecycle_sync_${targetIntakeStatus}`,
      from_status: intake.status,
      to_status: targetIntakeStatus,
      performed_by: userId || null,
      metadata: { source: 'contract_lifecycle_sync', contract_id: contractId },
    });

    // Sync CRM stage
    if (intake.funnel_item_id) {
      const crmStage = INTAKE_TO_CRM_STAGE[targetIntakeStatus];
      if (crmStage) {
        const { error: crmErr } = await supabase.from('funnel_items')
          .update({ stage: crmStage })
          .eq('id', intake.funnel_item_id);
        if (crmErr) {
          logger.warn('lifecycle_sync_crm_failed', {
            funnelItemId: intake.funnel_item_id, error: crmErr.message,
          });
          // Surface CRM failure — caller should treat as partial sync error
          return { synced: false, intakeId: intake.id, error: `crm_sync: ${crmErr.message}` };
        }
        logger.info('lifecycle_sync_crm_updated', {
          funnelItemId: intake.funnel_item_id, crmStage,
        });
      }
    }

    logger.info('lifecycle_sync_completed', {
      contractId, intakeId: intake.id,
      fromStatus: intake.status, toStatus: targetIntakeStatus,
    });

    return { synced: true, intakeId: intake.id };
  } catch (err: any) {
    logger.error('lifecycle_sync_error', { contractId, error: err?.message });
    return { synced: false, error: err?.message };
  }
}

/**
 * Treat a sync result as a real failure (caller should not toast success).
 * "no_linked_intake" and "would_regress" are benign skips, not failures.
 */
function isRealSyncFailure(syncRes: { synced: boolean; error?: string }): boolean {
  if (syncRes.synced) return false;
  const benign = new Set(['no_linked_intake', 'would_regress']);
  return !!syncRes.error && !benign.has(syncRes.error);
}

/**
 * Full "mark as signed" flow (UI-initiated, staff only):
 * 1. Update startup_contracts (signed_at, signature_status, status)
 * 2. Sync intake to 'signed'
 * 3. Activate workspace (only if contract is truly signed)
 * 4. Sync intake to 'activated'
 *
 * Returns syncError when any downstream sync (intake/CRM/workspace) failed,
 * so the UI does NOT toast success on partial failure.
 */
export async function canonicalMarkAsSigned(
  contractId: string,
  workspaceId: string | null,
  userId?: string,
): Promise<{ success: boolean; error?: string; syncError?: string }> {
  try {
    // 1. Update contract to signed
    const { error: contractErr } = await supabase
      .from('startup_contracts')
      .update({
        signature_status: 'signed',
        signed_at: new Date().toISOString(),
        status: 'active',
      } as any)
      .eq('id', contractId);

    if (contractErr) throw contractErr;

    const syncErrors: string[] = [];

    // 2. Sync intake to 'signed'
    const signedRes = await syncIntakeOnContractEvent(contractId, 'signed', userId);
    if (isRealSyncFailure(signedRes)) syncErrors.push(`intake_signed: ${signedRes.error}`);

    // 3. Activate workspace only if contract is truly signed
    if (workspaceId) {
      const { error: wsErr } = await supabase.from('workspaces')
        .update({ status: 'active', updated_at: new Date().toISOString() } as any)
        .eq('id', workspaceId)
        .in('status', ['pending', 'claimed', 'imported_unclaimed']);
      if (wsErr) syncErrors.push(`workspace_activate: ${wsErr.message}`);
    }

    // 4. Sync intake to 'activated'
    const activatedRes = await syncIntakeOnContractEvent(contractId, 'activated', userId);
    if (isRealSyncFailure(activatedRes)) syncErrors.push(`intake_activated: ${activatedRes.error}`);

    if (syncErrors.length > 0) {
      logger.warn('canonical_mark_signed_partial', { contractId, syncErrors });
      return { success: false, syncError: syncErrors.join('; ') };
    }

    return { success: true };
  } catch (err: any) {
    logger.error('canonical_mark_signed_error', { contractId, error: err?.message });
    return { success: false, error: err?.message };
  }
}

/**
 * "Mark as sent for signature" flow (UI-initiated, staff only):
 * 1. Update startup_contracts signature fields (preserving provider if already sent)
 * 2. Sync intake to 'signature_sent'
 *
 * Provider preservation: if a contract already has a signature_provider AND is
 * already past 'draft' (i.e. sent_for_signature/signed), we do NOT overwrite the
 * provider. This prevents silently switching providers mid-flight.
 *
 * Returns syncError when intake/CRM sync failed so UI does not falsely toast success.
 */
export async function canonicalMarkAsSent(
  contractId: string,
  provider: string,
  userId?: string,
): Promise<{ success: boolean; error?: string; syncError?: string }> {
  try {
    // Read current state to enforce provider preservation
    const { data: current, error: readErr } = await supabase
      .from('startup_contracts')
      .select('signature_provider, signature_status')
      .eq('id', contractId)
      .maybeSingle();

    if (readErr) throw readErr;

    const alreadySent =
      current?.signature_provider &&
      current.signature_status &&
      ['sent_for_signature', 'signed'].includes(current.signature_status as string);

    const updatePayload: Record<string, any> = {
      status: 'pending_signature',
      signature_status: 'sent_for_signature',
      signature_requested_at: new Date().toISOString(),
    };
    // Only set provider if it was not already set on a sent contract
    if (!alreadySent) {
      updatePayload.signature_provider = provider;
    } else if (current?.signature_provider !== provider) {
      logger.warn('canonical_mark_sent_provider_preserved', {
        contractId,
        existingProvider: current?.signature_provider,
        attemptedProvider: provider,
      });
    }

    const { error } = await supabase
      .from('startup_contracts')
      .update(updatePayload as any)
      .eq('id', contractId);

    if (error) throw error;

    void track('contract_sent_for_signature', { properties: { contractId, provider } });

    // Sync intake — surface failure
    const syncRes = await syncIntakeOnContractEvent(contractId, 'signature_sent', userId);
    if (isRealSyncFailure(syncRes)) {
      logger.warn('canonical_mark_sent_partial', { contractId, syncError: syncRes.error });
      return { success: false, syncError: syncRes.error };
    }

    return { success: true };
  } catch (err: any) {
    logger.error('canonical_mark_sent_error', { contractId, error: err?.message });
    return { success: false, error: err?.message };
  }
}
