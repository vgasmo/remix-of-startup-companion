/**
 * RC5 I2 — notification ledger helpers.
 *
 * Prevents duplicate sends across retries by claiming a deterministic
 * `business_key` before dispatch. Any dispatcher that emits an external
 * notification (email, WhatsApp, SMS) MUST call `claimLedgerKey` first and
 * only dispatch when it returns `{ claimed: true }`.
 */

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export interface ClaimOptions {
  businessKey: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'in_app';
  subjectKind: string;
  metadata?: Record<string, unknown>;
}

export interface ClaimResult {
  claimed: boolean;
  reason?: 'already_delivered' | 'db_error';
  error?: string;
}

/**
 * Attempt to claim a delivery slot. Returns `{ claimed: true }` on first
 * insert; `{ claimed: false, reason: 'already_delivered' }` when the key
 * already exists; `{ claimed: false, reason: 'db_error' }` on unexpected
 * failures (fail-closed — the caller MUST NOT dispatch).
 */
export async function claimLedgerKey(
  admin: SupabaseAdmin,
  opts: ClaimOptions,
): Promise<ClaimResult> {
  const { businessKey, channel, subjectKind, metadata } = opts;
  const { error } = await admin
    .from('notification_ledger')
    .insert({
      business_key: businessKey,
      channel,
      subject_kind: subjectKind,
      metadata: metadata ?? {},
    });

  if (!error) return { claimed: true };
  // 23505 = unique_violation → already delivered → skip dispatch.
  // deno-lint-ignore no-explicit-any
  const code = (error as any).code as string | undefined;
  if (code === '23505') return { claimed: false, reason: 'already_delivered' };
  return { claimed: false, reason: 'db_error', error: error.message };
}

/**
 * After a confirmed successful dispatch, stamp the provider message id.
 * Never blocks the caller — best-effort update.
 */
export async function stampLedgerDelivery(
  admin: SupabaseAdmin,
  businessKey: string,
  providerMessageId: string | null,
): Promise<void> {
  if (!providerMessageId) return;
  await admin
    .from('notification_ledger')
    .update({ provider_message_id: providerMessageId })
    .eq('business_key', businessKey);
}

/**
 * Roll back a claim when the dispatch failed AFTER the claim was inserted.
 * Only remove the row we just created — never touch older successful rows.
 */
export async function releaseLedgerKey(
  admin: SupabaseAdmin,
  businessKey: string,
): Promise<void> {
  await admin
    .from('notification_ledger')
    .delete()
    .eq('business_key', businessKey)
    .is('provider_message_id', null);
}
