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

/**
 * Scrub PII out of a webhook payload preview before it is persisted to
 * `webhook_inbox.raw_body_preview` or `contract_lifecycle_events.details`.
 *
 * Both tables are readable by staff for audit, but neither should retain
 * raw signer emails / names / phones / addresses / tax ids. We keep enough
 * shape (event names, ids, status codes) to diagnose issues, and mask
 * anything that looks personal.
 *
 * Accepts a JSON string OR any value; always returns a length-capped string.
 */
const PII_KEY_PATTERN = /^(email|e_?mail|first_?name|last_?name|full_?name|name|phone|mobile|cell|address|street|city|zip|postal|nif|vat|tax_?id|birthdate|dob|ssn|iban|nib)$/i
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const PHONE_PATTERN = /(?:\+?\d[\s.-]?){8,}\d/g

function maskString(s: string): string {
  return s
    .replace(EMAIL_PATTERN, '[email]')
    .replace(PHONE_PATTERN, '[phone]')
}

function scrubValue(v: unknown): unknown {
  if (v == null) return v
  if (typeof v === 'string') return maskString(v)
  if (Array.isArray(v)) return v.map(scrubValue)
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PII_KEY_PATTERN.test(k)) {
        out[k] = val == null ? val : '[redacted]'
      } else {
        out[k] = scrubValue(val)
      }
    }
    return out
  }
  return v
}

export function scrubWebhookPreview(input: unknown, maxLen = 2000): string {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input) } catch { return maskString(input).slice(0, maxLen) }
  }
  try {
    return JSON.stringify(scrubValue(parsed)).slice(0, maxLen)
  } catch {
    return maskString(String(input)).slice(0, maxLen)
  }
}

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
