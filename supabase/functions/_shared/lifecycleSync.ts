import { autoCreateFounderAccount, enqueueFounderInviteTask } from './founderAccount.ts'

/**
 * Shared Canonical Lifecycle Sync — Server-Side (CANONICAL TRUTH)
 *
 * SINGLE source of truth for contract lifecycle synchronization across ALL edge functions.
 * All webhook handlers and signing paths MUST use these helpers instead of inline sync logic.
 *
 * Synchronizes: startup_contracts → contract_intakes → funnel_items (CRM) → workspaces
 *
 * CRM stages used here MUST be valid values from public.funnel_items.stage
 * (fine-grained DB stages — see src/constants/funnelStages.ts FUNNEL_STAGES).
 * The 7 macro pipeline columns (lead/qualified/proposal_negotiation/...) are a
 * UI grouping and are NEVER written to the DB directly.
 *
 * Note: src/lib/contractLifecycleSync.ts is a CLIENT MIRROR for UI-initiated
 * manual transitions only — server is canonical.
 */

type SyncResult = {
  synced: boolean
  intakeId?: string
  errors?: string[]
}

/**
 * When a contract is sent for signature:
 * 1. Update linked intake to 'signature_sent'
 * 2. Log audit event
 * 3. Sync CRM funnel_item.stage to 'sent_for_signature' (valid fine-grained DB stage)
 *
 * Errors are captured and returned (not thrown) so callers can decide how to react.
 */
export async function syncIntakeOnSent(
  supabase: any,
  contractId: string,
  performedBy: string | null,
  source: string,
): Promise<SyncResult> {
  const errors: string[] = []

  const { data: intake, error: findErr } = await supabase
    .from('contract_intakes')
    .select('id, status, funnel_item_id')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findErr) {
    console.warn('[lifecycleSync] syncIntakeOnSent find error', { contractId, error: findErr.message })
    return { synced: false, errors: [`find_intake: ${findErr.message}`] }
  }

  if (!intake) return { synced: false }

  // Don't regress: skip if already at or past signature_sent
  const PAST_SENT = ['signature_sent', 'signed', 'activated']
  if (PAST_SENT.includes(intake.status)) {
    return { synced: false, intakeId: intake.id }
  }

  const { error: updateErr } = await supabase
    .from('contract_intakes')
    .update({ status: 'signature_sent' })
    .eq('id', intake.id)

  if (updateErr) {
    console.error('[lifecycleSync] intake update failed', { intakeId: intake.id, error: updateErr.message })
    errors.push(`update_intake: ${updateErr.message}`)
  }

  const { error: eventErr } = await supabase.from('intake_events').insert({
    intake_id: intake.id,
    event_type: 'lifecycle_sync_signature_sent',
    from_status: intake.status,
    to_status: 'signature_sent',
    performed_by: performedBy,
    metadata: { source, contract_id: contractId },
  })
  if (eventErr) {
    console.warn('[lifecycleSync] intake_event insert failed', { intakeId: intake.id, error: eventErr.message })
    errors.push(`intake_event: ${eventErr.message}`)
  }

  if (intake.funnel_item_id) {
    const { error: crmErr } = await supabase.from('funnel_items')
      .update({ stage: 'sent_for_signature' })
      .eq('id', intake.funnel_item_id)
    if (crmErr) {
      console.warn('[lifecycleSync] funnel_items stage update failed', {
        funnelItemId: intake.funnel_item_id, error: crmErr.message,
      })
      errors.push(`funnel_stage: ${crmErr.message}`)
    }
  }

  return { synced: errors.length === 0, intakeId: intake.id, errors: errors.length ? errors : undefined }
}

/**
 * When a contract is completed/signed:
 * 1. Contrato sem workspace: criar ou reutilizar startup + workspace (RPC ensure_contract_workspace)
 * 2. Workspace ainda por ativar: criar a conta + membro founder antes de ativar
 * 3. Update linked intake: current → signed → activated (+ audit events)
 * 4. Sync CRM funnel_item.stage to 'contracted' (valid fine-grained DB stage)
 * 5. Activate workspace (only from pre-active states); sem membros ativos fica pendente
 *    (awaitingFounder) com a triagem 'Convidar founder', em vez de falhar a assinatura
 *
 * Errors are captured and returned. Workspace activation is attempted even if intake
 * sync partially fails so a signed contract is not left without an active workspace.
 */
export async function syncIntakeOnCompleted(
  supabase: any,
  contractId: string,
  workspaceId: string | null,
  performedBy: string | null,
  source: string,
): Promise<SyncResult & { workspaceId?: string | null; awaitingFounder?: boolean }> {
  const errors: string[] = []
  let effectiveWorkspaceId = workspaceId
  let awaitingFounder = false
  let workspaceActivated = false

  // No completion side effects without a persisted complete signature.
  const { data: signedContract, error: contractErr } = await supabase.from('startup_contracts')
    .select('status, signed_at, signature_status, workspace_id')
    .eq('id', contractId).maybeSingle()
  if (contractErr || !signedContract?.signed_at || !['signed', 'completed'].includes(signedContract.signature_status)
      || !['draft', 'pending_signature', 'active'].includes(signedContract.status)) {
    return { synced: false, errors: ['contract_signature_not_verified'] }
  }
  // A caller-provided workspace is never authority over an unrelated workspace.
  effectiveWorkspaceId = signedContract.workspace_id
  if (signedContract.status !== 'active') {
    const { data: activated, error } = await supabase.from('startup_contracts')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', contractId).in('status', ['draft', 'pending_signature']).select('id')
    if (error || !activated?.length) return { synced: false, errors: ['contract_activation_failed'] }
  }

  const { data: intake, error: findErr } = await supabase
    .from('contract_intakes')
    .select('id, status, funnel_item_id')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findErr) {
    console.warn('[lifecycleSync] syncIntakeOnCompleted find error', { contractId, error: findErr.message })
    errors.push(`find_intake: ${findErr.message}`)
  }
  if (intake && ['cancelled', 'rejected'].includes(intake.status)) {
    return { synced: false, errors: ['intake_closed'] }
  }

  // ── Contratos sem intake (CRM direto): a lead resolve-se pelo contrato
  let fallbackFunnelItemId: string | null = null
  if (!intake) {
    const { data: contractRow } = await supabase
      .from('startup_contracts')
      .select('funnel_item_id')
      .eq('id', contractId)
      .maybeSingle()
    fallbackFunnelItemId = contractRow?.funnel_item_id ?? null
  }

  // ── Contrato sem workspace (lead do CRM, com ou sem intake): criar ou reutilizar startup + workspace.
  //    A RPC é idempotente: lê o workspace do contrato, reutiliza o da lead já convertida ou cria um 'pending'.
  if (!effectiveWorkspaceId) {
    const { data: mintedWs, error: mintErr } = await supabase.rpc('ensure_contract_workspace', { p_contract_id: contractId })
    if (mintErr) {
      console.error('[lifecycleSync] ensure_contract_workspace failed', { contractId, error: mintErr.message })
      errors.push(`auto_mint_workspace: ${mintErr.message}`)
    } else {
      effectiveWorkspaceId = (mintedWs as string | null) ?? null
    }
  }
  if (!effectiveWorkspaceId) errors.push('workspace_not_linked')

  // ── A ativação exige um membro ativo (trigger validate_workspace_status_transition): com o workspace
  //    ainda por ativar, criar já a conta + membro founder (idempotente) ANTES de ativar
  if (effectiveWorkspaceId) {
    const { data: wsNow } = await supabase
      .from('workspaces')
      .select('status')
      .eq('id', effectiveWorkspaceId)
      .maybeSingle()
    if (wsNow && ['pending', 'claimed', 'imported_unclaimed', 'draft'].includes(wsNow.status)) {
      const { data: signer } = await supabase
        .from('startup_contracts')
        .select('legal_representative_email, legal_representative_name')
        .eq('id', contractId)
        .maybeSingle()
      const founderInput = {
        id: contractId,
        workspace_id: effectiveWorkspaceId,
        legal_representative_email: signer?.legal_representative_email ?? null,
        legal_representative_name: signer?.legal_representative_name ?? null,
      }
      const acct = await autoCreateFounderAccount(supabase, founderInput)
      if (!acct.ok) await enqueueFounderInviteTask(supabase, founderInput, acct.reason || 'unknown')
    }
  }

  if (intake) {
    // Transition: current → signed (skip if already past)
    const PAST_SIGNED = ['signed', 'activated']
    if (!PAST_SIGNED.includes(intake.status)) {
      const { error: signErr } = await supabase
        .from('contract_intakes')
        .update({ status: 'signed' })
        .eq('id', intake.id)
      if (signErr) {
        console.error('[lifecycleSync] intake → signed failed', { intakeId: intake.id, error: signErr.message })
        errors.push(`intake_signed: ${signErr.message}`)
      } else {
        await supabase.from('intake_events').insert({
          intake_id: intake.id,
          event_type: 'lifecycle_sync_signed',
          from_status: intake.status,
          to_status: 'signed',
          performed_by: performedBy,
          metadata: { source, contract_id: contractId },
        })
      }
    }

    if (intake.funnel_item_id) {
      const { error: crmErr } = await supabase.from('funnel_items')
        .update({ stage: 'contracted' })
        .eq('id', intake.funnel_item_id)
      if (crmErr) {
        console.warn('[lifecycleSync] funnel_items contracted update failed', {
          funnelItemId: intake.funnel_item_id, error: crmErr.message,
        })
        errors.push(`funnel_stage: ${crmErr.message}`)
      }
    }
  } else if (fallbackFunnelItemId) {
    // CRM-direct fallback: still advance the funnel stage
    const { error: crmErr } = await supabase.from('funnel_items')
      .update({ stage: 'contracted' })
      .eq('id', fallbackFunnelItemId)
    if (crmErr) errors.push(`funnel_stage_fallback: ${crmErr.message}`)
  }

  if (effectiveWorkspaceId) {
    // Sem membros ativos (sem email do representante, conta suspensa) o trigger recusaria a ativação:
    // o workspace fica pendente com a triagem 'Convidar founder' em vez de falhar a assinatura.
    const { count: activeMembers, error: membersErr } = await supabase
      .from('workspace_users')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', effectiveWorkspaceId)
      .eq('active', true)
    if (membersErr) {
      errors.push(`workspace_members: ${membersErr.message}`)
    } else if ((activeMembers ?? 0) === 0) {
      console.warn('[lifecycleSync] workspace without active members, activation deferred', { workspaceId: effectiveWorkspaceId })
      awaitingFounder = true
    } else {
      const { error: wsErr } = await supabase.from('workspaces')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', effectiveWorkspaceId)
        .is('blocked_at', null)
        .in('status', ['pending', 'claimed', 'imported_unclaimed'])
      if (wsErr) {
        console.error('[lifecycleSync] workspace activation failed', { workspaceId: effectiveWorkspaceId, error: wsErr.message })
        errors.push(`workspace_activate: ${wsErr.message}`)
      }
      const { data: verified, error: verifyErr } = await supabase.from('workspaces')
        .select('status, blocked_at').eq('id', effectiveWorkspaceId).maybeSingle()
      workspaceActivated = !verifyErr && verified?.status === 'active' && !verified.blocked_at
      if (!workspaceActivated) errors.push('workspace_activate: not_active')
    }
  }

  if (workspaceActivated && errors.length === 0 && intake && intake.status !== 'activated') {
    const { error: actErr } = await supabase.from('contract_intakes')
      .update({ status: 'activated' }).eq('id', intake.id).in('status', ['signed'])
    if (actErr) errors.push(`intake_activated: ${actErr.message}`)
    else {
      const { error: eventErr } = await supabase.from('intake_events').insert({
        intake_id: intake.id, event_type: 'lifecycle_sync_activated', from_status: 'signed',
        to_status: 'activated', performed_by: performedBy, metadata: { source, contract_id: contractId },
      })
      if (eventErr) errors.push(`intake_event: ${eventErr.message}`)
    }
  }
  // Persisted at signature time by a trigger, cleared only after verified completion.
  if (workspaceActivated && errors.length === 0) {
    const { error: clearErr } = await supabase.from('startup_contracts')
      .update({ activation_sync_pending: false }).eq('id', contractId)
    if (clearErr) errors.push(`activation_recovery: ${clearErr.message}`)
  }

  return {
    synced: errors.length === 0,
    intakeId: intake?.id,
    workspaceId: effectiveWorkspaceId,
    awaitingFounder,
    errors: errors.length ? errors : undefined,
  }
}

/**
 * When a contract is declined / voided / terminated:
 * 1. Close the linked intake as 'cancelled' (the intake_status enum has no declined/voided/terminated;
 *    the outcome goes in the event). An intake already signed/activated is left as is.
 * 2. Log audit event
 */
export async function syncIntakeOnClosed(
  supabase: any,
  contractId: string,
  outcome: 'declined' | 'voided' | 'terminated',
  performedBy: string | null,
  source: string,
): Promise<SyncResult> {
  const errors: string[] = []

  const { data: intake, error: findErr } = await supabase
    .from('contract_intakes')
    .select('id, status, funnel_item_id')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findErr) {
    console.warn('[lifecycleSync] syncIntakeOnClosed find error', { contractId, error: findErr.message })
    errors.push(`find_intake: ${findErr.message}`)
  }

  const funnelStage = outcome === 'terminated' ? 'archived' : 'rejected'
  let funnelItemId: string | null = intake?.funnel_item_id ?? null

  if (intake) {
    // O enum intake_status não tem declined/voided/terminated: o intake fecha como 'cancelled' e o motivo
    // fica no evento. Um intake já ativado (contrato assinado e depois terminado) mantém 'activated'.
    if (!['cancelled', 'rejected', 'signed', 'activated'].includes(intake.status)) {
      const { error: updErr } = await supabase
        .from('contract_intakes')
        .update({ status: 'cancelled' })
        .eq('id', intake.id)
      if (updErr) {
        console.error('[lifecycleSync] intake close update failed', { intakeId: intake.id, outcome, error: updErr.message })
        errors.push(`intake_${outcome}: ${updErr.message}`)
      } else {
        const { error: evtErr } = await supabase.from('intake_events').insert({
          intake_id: intake.id,
          event_type: `lifecycle_sync_${outcome}`,
          from_status: intake.status,
          to_status: 'cancelled',
          performed_by: performedBy,
          metadata: { source, contract_id: contractId, outcome },
        })
        if (evtErr) errors.push(`intake_event: ${evtErr.message}`)
      }
    }
  } else {
    // CRM-direct fallback: resolve funnel via contract row
    const { data: contractRow } = await supabase
      .from('startup_contracts')
      .select('funnel_item_id')
      .eq('id', contractId)
      .maybeSingle()
    funnelItemId = contractRow?.funnel_item_id ?? null
  }

  if (funnelItemId) {
    const { error: crmErr } = await supabase.from('funnel_items')
      .update({ stage: funnelStage })
      .eq('id', funnelItemId)
    if (crmErr) {
      console.warn('[lifecycleSync] funnel_items close stage failed', {
        funnelItemId, funnelStage, error: crmErr.message,
      })
      errors.push(`funnel_stage: ${crmErr.message}`)
    }
  }

  return { synced: errors.length === 0, intakeId: intake?.id, errors: errors.length ? errors : undefined }
}
