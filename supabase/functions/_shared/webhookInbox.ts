/**
 * Webhook Inbox — deterministic idempotency for signature-provider webhooks.
 *
 * Uses `public.webhook_inbox` (unique on (provider,event_id) when event_id is
 * present, and on (provider,payload_hash) otherwise) to make PandaDoc /
 * DocuSign duplicate, concurrent and out-of-order deliveries safe.
 *
 * NEVER accepts a synthesized Date.now-based event id — event_id must come
 * from the provider payload or be null (in which case dedupe falls back to
 * the SHA-256 payload hash).
 */
// deno-lint-ignore-file no-explicit-any

/** Compute SHA-256(hex) of a string. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Terminal states — once a contract reaches these, providers must not regress it. */
export const TERMINAL_SIGNATURE_STATUSES = new Set(['completed', 'voided', 'declined'])

export interface InboxClaimInput {
  provider: 'docusign' | 'pandadoc'
  eventId: string | null
  payloadHash: string
  eventName: string | null
  contractId: string | null
  rawBodyPreview: string
}

export interface InboxClaimResult {
  ok: boolean
  /** Row id if newly claimed; null when duplicate. */
  inboxId: string | null
  /** True if this exact delivery has already been recorded. */
  duplicate: boolean
  /** Non-null on DB errors that should surface as retriable 5xx. */
  error?: string
}

/**
 * Attempt to claim a webhook delivery. Returns duplicate=true on unique
 * constraint violation. Any other DB error is surfaced so the caller can
 * return 5xx and let the provider retry.
 */
export async function claimWebhookDelivery(
  supabase: any,
  input: InboxClaimInput,
): Promise<InboxClaimResult> {
  const preview = (input.rawBodyPreview || '').slice(0, 2000)
  const { data, error } = await supabase
    .from('webhook_inbox')
    .insert({
      provider: input.provider,
      event_id: input.eventId, // NULL falls back to payload_hash uniqueness
      payload_hash: input.payloadHash,
      event_name: input.eventName,
      contract_id: input.contractId,
      status: 'received',
      raw_body_preview: preview,
    })
    .select('id')
    .single()

  if (error) {
    // Postgres unique_violation
    if ((error as any).code === '23505') {
      return { ok: true, inboxId: null, duplicate: true }
    }
    return { ok: false, inboxId: null, duplicate: false, error: error.message }
  }
  return { ok: true, inboxId: data.id, duplicate: false }
}

export async function markInboxProcessed(
  supabase: any,
  inboxId: string | null,
  patch: { status: 'processed' | 'failed' | 'duplicate'; httpStatus?: number; errorMessage?: string; contractId?: string | null },
): Promise<void> {
  if (!inboxId) return
  try {
    await supabase
      .from('webhook_inbox')
      .update({
        status: patch.status,
        http_status: patch.httpStatus ?? null,
        error_message: patch.errorMessage ?? null,
        contract_id: patch.contractId ?? undefined,
        processed_at: new Date().toISOString(),
      })
      .eq('id', inboxId)
  } catch (_) {
    // Best-effort: the primary write already succeeded; a failed status update
    // must not cause the provider to retry.
  }
}
