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
    operation: 'sent' | 'completed'
  },
): Promise<boolean> {
  // Empty errors OR no intake found at all = nothing to surface.
  if (!result.errors || result.errors.length === 0) return true

  const errors = result.errors
  const eventType = `lifecycle_sync_failed_${ctx.operation}`

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

  // Notify admins + consultors so this does not silently rot.
  try {
    const { data: staffUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'consultor'])

    if (staffUsers?.length) {
      const shortId = ctx.contractId.slice(0, 8)
      const summary = errors.slice(0, 2).join(' | ')
      await supabase.from('notifications').insert(
        staffUsers.map((s: { user_id: string }) => ({
          user_id: s.user_id,
          type: 'lifecycle_sync_failed',
          title: `Sincronização contratual falhou (${ctx.operation})`,
          message: `Contrato ${shortId} (${ctx.source}): ${summary}`,
          entity_type: 'contract',
          entity_id: ctx.contractId,
          link: '/admin?tab=backoffice&subtab=contracts',
        })),
      )
    }
  } catch (err) {
    console.error('[lifecycleSyncResultHandler] failed to notify staff', err)
  }

  return false
}
