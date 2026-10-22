// Notifica admin + backoffice com uma notificação 'system'. Nunca lança.
export async function notifyStaff(
  supabase: any,
  n: { title: string; message: string; entityId?: string | null; entityType?: string; link?: string; eventKey?: string },
): Promise<void> {
  try {
    const { data: staff } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'backoffice'])
    const ids = [...new Set((staff ?? []).map((s: any) => s.user_id))]
    if (!ids.length) return
    const { error } = await supabase.from('notifications').insert(ids.map((user_id) => ({
      user_id, type: 'system', title: n.title, message: n.message,
      entity_type: n.entityType ?? 'contract', entity_id: n.entityId ?? null,
      link: n.link ?? '/admin?tab=backoffice&subtab=contracts',
      event_key: n.eventKey ?? null,
    })))
    if (error) console.error('[notifyStaff] insert failed:', error.message)
  } catch (err) {
    console.error('[notifyStaff] failed:', err)
  }
}
