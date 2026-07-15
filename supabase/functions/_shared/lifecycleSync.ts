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
 * 1. Update linked intake: current → signed → activated
 * 2. Log audit events for each transition
 * 3. Sync CRM funnel_item.stage to 'contracted' (valid fine-grained DB stage)
 * 4. Activate workspace (only from pre-active states)
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
): Promise<SyncResult & { workspaceId?: string | null }> {
  const errors: string[] = []
  let effectiveWorkspaceId = workspaceId

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

  // ── Fallback: CRM-direct contracts have no intake → resolve funnel via contract row
  let fallbackFunnelItemId: string | null = null
  if (!intake) {
    const { data: contractRow } = await supabase
      .from('startup_contracts')
      .select('funnel_item_id, workspace_id, organization_name, legal_representative_email, legal_representative_name')
      .eq('id', contractId)
      .maybeSingle()
    fallbackFunnelItemId = contractRow?.funnel_item_id ?? null

    // If no workspace on the contract either, mint startup + workspace from CRM/organization data
    if (!effectiveWorkspaceId && !contractRow?.workspace_id) {
      const orgName = contractRow?.organization_name
        || (fallbackFunnelItemId ? (await supabase.from('funnel_items').select('organization_name').eq('id', fallbackFunnelItemId).maybeSingle()).data?.organization_name : null)
        || 'Startup'
      const contactEmail = contractRow?.legal_representative_email || null
      const contactName = contractRow?.legal_representative_name || null
      try {
        const { data: newStartup, error: startupErr } = await supabase
          .from('startups')
          .insert({ name: orgName, main_contact_email: contactEmail, main_contact_name: contactName, stage: 'ideation' })
          .select('id')
          .single()
        if (startupErr) throw startupErr
        const { data: newWs, error: wsErr } = await supabase
          .from('workspaces')
          .insert({ startup_id: newStartup.id, status: 'pending', needs_onboarding: true })
          .select('id')
          .single()
        if (wsErr) throw wsErr
        effectiveWorkspaceId = newWs.id
        const { error: contractLinkErr } = await supabase.from('startup_contracts')
          .update({ workspace_id: effectiveWorkspaceId })
          .eq('id', contractId)
        if (contractLinkErr) {
          console.error('[lifecycleSync] contract workspace link failed', { contractId, error: contractLinkErr.message })
          errors.push(`contract_workspace_link: ${contractLinkErr.message}`)
        }
        if (fallbackFunnelItemId) {
          // FIX (N0): funnel_items uses `linked_workspace_id`, not `workspace_id`.
          const { error: funnelLinkErr } = await supabase.from('funnel_items')
            .update({ linked_workspace_id: effectiveWorkspaceId })
            .eq('id', fallbackFunnelItemId)
          if (funnelLinkErr) {
            console.error('[lifecycleSync] funnel workspace link failed', { fallbackFunnelItemId, error: funnelLinkErr.message })
            errors.push(`funnel_workspace_link: ${funnelLinkErr.message}`)
          }
        }
      } catch (mintErr: any) {
        console.error('[lifecycleSync] auto-mint workspace failed', { contractId, error: mintErr?.message })
        errors.push(`auto_mint_workspace: ${mintErr?.message || mintErr}`)
      }
    } else if (!effectiveWorkspaceId) {
      effectiveWorkspaceId = contractRow?.workspace_id ?? null
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

    if (intake.status !== 'activated') {
      const { error: actErr } = await supabase
        .from('contract_intakes')
        .update({ status: 'activated' })
        .eq('id', intake.id)
      if (actErr) {
        console.error('[lifecycleSync] intake → activated failed', { intakeId: intake.id, error: actErr.message })
        errors.push(`intake_activated: ${actErr.message}`)
      } else {
        await supabase.from('intake_events').insert({
          intake_id: intake.id,
          event_type: 'lifecycle_sync_activated',
          from_status: 'signed',
          to_status: 'activated',
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
    const { error: wsErr } = await supabase.from('workspaces')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', effectiveWorkspaceId)
      .in('status', ['pending', 'claimed', 'imported_unclaimed'])
    if (wsErr) {
      console.error('[lifecycleSync] workspace activation failed', { workspaceId: effectiveWorkspaceId, error: wsErr.message })
      errors.push(`workspace_activate: ${wsErr.message}`)
    }
  }

  return {
    synced: errors.length === 0,
    intakeId: intake?.id,
    workspaceId: effectiveWorkspaceId,
    errors: errors.length ? errors : undefined,
  }
}

/**
 * When a contract is declined / voided / terminated:
 * 1. Update linked intake to matching status (declined | voided | terminated)
 * 2. Log audit event
 * 3. Move CRM funnel_item.stage → 'rejected' (declined/voided) or 'archived' (terminated)
 *
 * Errors are captured (not thrown) so callers keep going.
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
    // Don't regress terminal statuses
    const TERMINAL = ['declined', 'voided', 'terminated']
    if (!TERMINAL.includes(intake.status)) {
      const { error: updErr } = await supabase
        .from('contract_intakes')
        .update({ status: outcome })
        .eq('id', intake.id)
      if (updErr) {
        console.error('[lifecycleSync] intake close update failed', { intakeId: intake.id, outcome, error: updErr.message })
        errors.push(`intake_${outcome}: ${updErr.message}`)
      } else {
        const { error: evtErr } = await supabase.from('intake_events').insert({
          intake_id: intake.id,
          event_type: `lifecycle_sync_${outcome}`,
          from_status: intake.status,
          to_status: outcome,
          performed_by: performedBy,
          metadata: { source, contract_id: contractId },
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
