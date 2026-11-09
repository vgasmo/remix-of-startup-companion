/**
 * Shared post-sync handler. When a contract lifecycle sync returns errors,
 * persist a contract_lifecycle_events 'lifecycle_sync_failed' entry and notify
 * admin/consultor staff so a human can remediate. Never throws — best-effort
 * observability layer that augments (does not replace) lifecycleSync's own logs.
 *
 * Returns true when sync was clean, false when failures were recorded.
 */
type SyncResult = {
  synced: boolean
  intakeId?: string
  errors?: string[]
}

export async function handleLifecycleSyncResult(
  supabase: any,
  result: SyncResult,
  ctx: {
    contractId: string
    workspaceId: string | null
    source: string            // e.g. 'docusign_webhook_completed'
    operation: 'sent' | 'completed' | 'declined' | 'voided'
  },
): Promise<boolean> {
  // Empty errors OR no intake found at all = nothing to surface.
  if (!result.errors || result.errors.length === 0) return true

  const errors = result.errors
  const eventType = `lifecycle_sync_failed_${ctx.operation}`

  // Mesmo erro no mesmo contrato = um único aviso por dia (a recuperação repete a sincronização): a chave é única por utilizador
  const errorKey = errors.join('|').replace(/[^a-zA-Z0-9_:|.-]+/g, '_').slice(0, 120)
  const eventKey = `lifecycle_sync_failed:${ctx.contractId}:${ctx.operation}:${errorKey}:${new Date().toISOString().slice(0, 10)}`
  let alreadyReported = false
  try {
    const { data: staffForKey } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'consultor', 'backoffice'])
    const staffIds = [...new Set((staffForKey ?? []).map((s: { user_id: string }) => s.user_id))]
    if (staffIds.length) {
      const { error: dupErr } = await supabase.from('notifications').insert(
        staffIds.map((user_id) => ({
          user_id,
          type: 'lifecycle_sync_failed',
          title: `Sincronização contratual falhou (${ctx.operation})`,
          message: `Contrato ${ctx.contractId.slice(0, 8)} (${ctx.source}): ${errors.slice(0, 2).join(' | ')}`,
          entity_type: 'contract',
          entity_id: ctx.contractId,
          link: '/admin?tab=backoffice&subtab=contracts',
          event_key: eventKey,
        })),
      )
      // 23505 = já avisámos estes utilizadores deste erro: não repetir notificação nem registo de auditoria
      if (dupErr && (dupErr as { code?: string }).code === '23505') alreadyReported = true
      else if (dupErr) console.error('[lifecycleSyncResultHandler] failed to notify staff', dupErr.message)
    }
  } catch (err) {
    console.error('[lifecycleSyncResultHandler] failed to notify staff', err)
  }
  if (alreadyReported) return false

  // Persist a permanent audit row on the contract.
  try {
    await supabase.from('contract_lifecycle_events').insert({
      contract_id: ctx.contractId,
      event_type: eventType,
      event_date: new Date().toISOString().split('T')[0],
      details: {
        source: ctx.source,
        operation: ctx.operation,
        intake_id: result.intakeId ?? null,
        workspace_id: ctx.workspaceId,
        errors,
      },
    })
  } catch (err) {
    console.error('[lifecycleSyncResultHandler] failed to persist audit event', err)
  }

  return false
}
