/**
 * PandaDoc Webhook Handler — Hardened V3 (HMAC-SHA256 verification)
 *
 * Security:
 * 1. REJECTS requests when PANDADOC_WEBHOOK_KEY is missing (fail-closed)
 * 2. Verifies PandaDoc HMAC-SHA256 signature over the RAW request body
 *    (query param `signature`, computed with the shared key). This is
 *    PandaDoc's documented mechanism — see:
 *    https://developers.pandadoc.com/reference/on-premises-webhooks
 * 3. Timing-safe comparison of computed vs provided signature
 * 4. Idempotency protection via provider_webhook_event_id
 * 5. Stores provider event payloads for auditability
 *
 * Maps PandaDoc events → canonical internal signature states.
 * Uses shared lifecycleSync for intake/CRM/workspace orchestration.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncIntakeOnSent, syncIntakeOnCompleted, syncIntakeOnClosed } from '../_shared/lifecycleSync.ts'
import { handleLifecycleSyncResult } from '../_shared/lifecycleSyncResultHandler.ts'
import { autoCreateFounderAccount as sharedCreateFounder, enqueueFounderInviteTask } from '../_shared/founderAccount.ts'
import { sha256Hex, claimWebhookDelivery, markInboxProcessed, TERMINAL_SIGNATURE_STATUSES, scrubWebhookPreview } from '../_shared/webhookInbox.ts'


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * PandaDoc status → canonical signature status mapping
 */
const PANDADOC_STATUS_MAP: Record<string, string> = {
  'document.uploaded': 'draft',
  'document.draft': 'draft',
  'document.sent': 'sent_for_signature',
  'document.viewed': 'viewed',
  'document.waiting_approval': 'sent_for_signature',
  'document.approved': 'sent_for_signature',
  'document.waiting_pay': 'sent_for_signature',
  'document.paid': 'completed',
  'document.completed': 'completed',
  'document.voided': 'voided',
  'document.declined': 'declined',
  'document.external_review': 'viewed',
  'document.deleted': 'voided',
}

/**
 * Constant-time byte comparison — prevents timing attacks that progressively
 * reveal the secret by measuring early-exit comparison time.
 */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase()
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) return null
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return out
}

/**
 * Compute HMAC-SHA256(rawBody) using the shared PandaDoc key.
 */
async function computeHmacSha256Hex(key: string, rawBody: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(rawBody))
  return new Uint8Array(sig)
}

/**
 * Verify PandaDoc webhook authenticity via HMAC-SHA256 — FAIL-CLOSED.
 *
 * PandaDoc sends `?signature=<hex>` where hex = HMAC_SHA256(shared_key, raw_body).
 */
async function verifyWebhookAuthenticity(
  rawBody: string,
  req: Request,
): Promise<{ ok: boolean; reason?: string }> {
  const webhookKey = Deno.env.get('PANDADOC_WEBHOOK_KEY')

  if (!webhookKey) {
    console.error('PANDADOC_WEBHOOK_KEY not configured — REJECTING request (fail-closed policy)')
    return { ok: false, reason: 'Webhook secret not configured — cannot verify authenticity' }
  }

  const url = new URL(req.url)
  const providedHex =
    url.searchParams.get('signature') ||
    req.headers.get('x-pandadoc-signature') ||
    ''

  if (!providedHex) {
    console.error('PandaDoc webhook: missing signature (query param or x-pandadoc-signature header)')
    return { ok: false, reason: 'Missing signature' }
  }

  const providedBytes = hexToBytes(providedHex)
  if (!providedBytes) {
    console.error('PandaDoc webhook: signature is not valid hex')
    return { ok: false, reason: 'Malformed signature' }
  }

  const computedBytes = await computeHmacSha256Hex(webhookKey, rawBody)

  if (!timingSafeEqualBytes(computedBytes, providedBytes)) {
    console.error('PandaDoc webhook: HMAC mismatch — rejecting event')
    return { ok: false, reason: 'Invalid webhook signature' }
  }

  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Read RAW body first — HMAC must be computed over the exact bytes
    // PandaDoc signed, before any JSON parse/re-serialization.
    const rawBody = await req.text()

    // ═══ SECURITY: Verify HMAC-SHA256 signature (FAIL-CLOSED) ═══
    const authResult = await verifyWebhookAuthenticity(rawBody, req)
    if (!authResult.ok) {
      return new Response(JSON.stringify({ error: `Unauthorized — ${authResult.reason}` }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }



    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const events = Array.isArray(body) ? body : [body]

    for (const event of events) {
      const pandadocDocId = event.data?.id || event.uuid || null
      const eventName = event.event || event.data?.status || 'unknown'
      // Provider-issued id ONLY — no Date.now() fallback. When absent, the
      // webhook inbox dedupes on the payload SHA-256 hash instead.
      const eventId: string | null = event.event_id || event.id || null
      const perEventPayloadHash = await sha256Hex(JSON.stringify(event))

      if (!pandadocDocId) {
        console.warn('PandaDoc webhook: no document ID found in payload', JSON.stringify(event).slice(0, 300))
        continue
      }

      console.log(`PandaDoc webhook: doc=${pandadocDocId}, event=${eventName}, eventId=${eventId ?? '(null)'}`)

      // ═══ IDEMPOTENCY: Claim inbox row FIRST (unique (provider,event_id) or (provider,payload_hash)) ═══
      const claim = await claimWebhookDelivery(supabase, {
        provider: 'pandadoc',
        eventId,
        payloadHash: perEventPayloadHash,
        eventName,
        contractId: null,
        rawBodyPreview: scrubWebhookPreview(event, 2000),
      })
      if (!claim.ok) {
        // Transient DB error → 5xx so PandaDoc retries.
        console.error('[pandadoc-webhook] inbox claim failed:', claim.error)
        return new Response(JSON.stringify({ error: 'inbox_claim_failed', details: claim.error }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (claim.duplicate) {
        console.log(`PandaDoc webhook: duplicate delivery skipped (eventId=${eventId ?? '(null)'}, hash=${perEventPayloadHash.slice(0, 12)}…)`)
        continue
      }

      // Find contract by provider_document_id — PostgREST alias syntax.
      const { data: contract, error: findError } = await supabase
        .from('startup_contracts')
        .select('id, workspace_id, contract_status:status, legal_representative_email, legal_representative_name, signature_status, provider_webhook_event_id')
        .eq('provider_document_id', pandadocDocId)
        .eq('signature_provider', 'pandadoc')
        .maybeSingle()

      if (findError) {
        console.error('[pandadoc-webhook] contract lookup failed:', findError)
        await markInboxProcessed(supabase, claim.inboxId, {
          status: 'failed', httpStatus: 500, errorMessage: `lookup_failed: ${findError.message}`,
        })
        try {
          await supabase.from('contract_lifecycle_events').insert({
            contract_id: null,
            event_type: 'pandadoc_webhook_lookup_error',
            event_date: new Date().toISOString().split('T')[0],
            details: { pandadoc_document_id: pandadocDocId, error: findError.message, event_id: eventId, payload_hash: perEventPayloadHash },
          })
          const { data: staffUsers } = await supabase
            .from('user_roles').select('user_id').in('role', ['admin', 'consultor', 'backoffice'])
          if (staffUsers?.length) {
            await supabase.from('notifications').insert(staffUsers.map((s: any) => ({
              user_id: s.user_id,
              type: 'system',
              title: 'Erro no webhook PandaDoc',
              message: `Falha ao localizar contrato (doc ${pandadocDocId}): ${findError.message}`,
              entity_type: 'contract',
              link: '/admin?tab=backoffice&subtab=contracts',
            })))
          }
        } catch (_) { /* best-effort */ }
        // Return 5xx for the whole batch so PandaDoc retries.
        return new Response(JSON.stringify({ error: 'lookup_failed', document_id: pandadocDocId }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!contract) {
        console.warn('Contract not found for PandaDoc document:', pandadocDocId)
        await markInboxProcessed(supabase, claim.inboxId, { status: 'processed', httpStatus: 200, errorMessage: 'no_matching_contract' })
        continue
      }

      // Backfill contract_id on the inbox row for auditability (status stays 'received' until final processed).
      {
        const { error: inboxBackfillErr } = await supabase
          .from('webhook_inbox')
          .update({ contract_id: contract.id })
          .eq('id', claim.inboxId)
        if (inboxBackfillErr) console.warn('pandadoc-webhook: inbox backfill failed', inboxBackfillErr.message)
      }

      // Map to canonical status
      const canonicalStatus = PANDADOC_STATUS_MAP[eventName] || contract.signature_status || 'draft'

      // ═══ TERMINAL-STATE GUARD ═══
      // Once a contract is completed / voided / declined, provider events must
      // not regress it (protects against out-of-order deliveries).
      if (
        TERMINAL_SIGNATURE_STATUSES.has(String(contract.signature_status)) &&
        contract.signature_status !== canonicalStatus
      ) {
        console.log(`PandaDoc webhook: ignoring ${canonicalStatus} — contract already in terminal state ${contract.signature_status}`)
        await markInboxProcessed(supabase, claim.inboxId, {
          status: 'processed', httpStatus: 200, errorMessage: `terminal_state_${contract.signature_status}`, contractId: contract.id,
        })
        continue
      }


      const updatePayload: Record<string, unknown> = {
        signature_status: canonicalStatus,
        provider_last_event: eventName,
        provider_last_sync_at: new Date().toISOString(),
        provider_last_error: null,
        provider_webhook_event_id: eventId ?? `hash:${perEventPayloadHash.slice(0, 32)}`,
      }

      if (canonicalStatus === 'completed') {
        updatePayload.signed_at = new Date().toISOString()
        updatePayload.status = 'active'
        updatePayload.provider_completed_at = new Date().toISOString()
        updatePayload.onboarding_completed_at = new Date().toISOString()
        updatePayload.onboarding_token_hash = null
        updatePayload.onboarding_token_expires_at = null
      }

      const { error: contractUpdateErr } = await supabase
        .from('startup_contracts')
        .update(updatePayload)
        .eq('id', contract.id)
      if (contractUpdateErr) {
        console.error('pandadoc-webhook: contract update failed', contractUpdateErr.message)
        await markInboxProcessed(supabase, claim.inboxId, {
          status: 'failed', httpStatus: 500, errorMessage: `contract_update_failed:${contractUpdateErr.message}`, contractId: contract.id,
        })
        continue
      }

      // === CANONICAL LIFECYCLE SYNC (shared helper) ===
      // Webhook always returns 200 to avoid PandaDoc retry storms, but failures
      // are persisted to contract_lifecycle_events + staff are notified.
      if (canonicalStatus === 'sent_for_signature') {
        const r = await syncIntakeOnSent(supabase, contract.id, null, `pandadoc_webhook_${eventName}`)
        await handleLifecycleSyncResult(supabase, r, {
          contractId: contract.id, workspaceId: contract.workspace_id,
          source: `pandadoc_webhook_${eventName}_sent`, operation: 'sent',
        })
      } else if (canonicalStatus === 'completed') {
        const r = await syncIntakeOnCompleted(supabase, contract.id, contract.workspace_id, null, `pandadoc_webhook_${eventName}`)
        await handleLifecycleSyncResult(supabase, r, {
          contractId: contract.id, workspaceId: contract.workspace_id,
          source: `pandadoc_webhook_${eventName}_completed`, operation: 'completed',
        })
        // Notify founders + assigned consultant that the contract is signed & activated.
        if (contract.workspace_id) {
          try {
            const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
            const invokeOpts = { headers: { 'x-cron-secret': cronSecret } }
            await supabase.functions.invoke('send-notification-email', {
              body: { type: 'contract_signed', workspace_id: contract.workspace_id, contract_id: contract.id },
              ...invokeOpts,
            })
            await supabase.functions.invoke('send-notification-email', {
              body: { type: 'contract_activated', workspace_id: contract.workspace_id, contract_id: contract.id },
              ...invokeOpts,
            })
          } catch (e) {
            console.warn('pandadoc-webhook: contract_signed/activated notification failed', String(e))
          }
        }
      } else if (canonicalStatus === 'declined' || canonicalStatus === 'voided') {
        const r = await syncIntakeOnClosed(
          supabase, contract.id, canonicalStatus as 'declined' | 'voided', null, `pandadoc_webhook_${eventName}`,
        )
        await handleLifecycleSyncResult(supabase, r, {
          contractId: contract.id, workspaceId: contract.workspace_id,
          source: `pandadoc_webhook_${eventName}_${canonicalStatus}`, operation: canonicalStatus,
        })
      }

      // ═══ AUDIT: Log lifecycle event with full payload ═══
      await supabase.from('contract_lifecycle_events').insert({
        contract_id: contract.id,
        event_type: `pandadoc_${eventName}`,
        event_date: new Date().toISOString().split('T')[0],
        details: {
          provider: 'pandadoc',
          event_name: eventName,
          event_id: eventId,
          canonical_status: canonicalStatus,
          pandadoc_document_id: pandadocDocId,
          raw_payload_preview: scrubWebhookPreview(event, 1000),
        },
      })

      // Notify staff on completion
      if (canonicalStatus === 'completed') {
        const { data: staffUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['admin', 'consultor', 'backoffice'])

        if (staffUsers?.length) {
          await supabase.from('notifications').insert(
            staffUsers.map((s: { user_id: string }) => ({
              user_id: s.user_id,
              type: 'contract_signed',
              title: 'Contrato assinado digitalmente (PandaDoc)',
              message: `O contrato ${contract.id.slice(0, 8)} foi assinado por ${contract.legal_representative_name || 'founder'} via PandaDoc.`,
              entity_type: 'contract',
              entity_id: contract.id,
              link: '/admin?tab=backoffice&subtab=contracts',
            }))
          )
        }

        // Log activity
        await supabase.from('activity_log').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          entity_type: 'contract',
          entity_id: contract.id,
          action: 'digitally_signed_pandadoc',
          workspace_id: contract.workspace_id,
          metadata: { pandadoc_document_id: pandadocDocId, event: eventName, event_id: eventId },
        })

        // Auto-create founder account (parity with docusign)
        if (contract.legal_representative_email) {
          const acctRes = await sharedCreateFounder(supabase, {
            id: contract.id,
            workspace_id: contract.workspace_id,
            legal_representative_email: contract.legal_representative_email,
            legal_representative_name: contract.legal_representative_name,
          })
          if (!acctRes.ok) {
            await enqueueFounderInviteTask(supabase, {
              id: contract.id,
              workspace_id: contract.workspace_id,
              legal_representative_email: contract.legal_representative_email,
              legal_representative_name: contract.legal_representative_name,
            }, acctRes.reason || 'unknown')
          }
        }

        // Invoicing has been retired; no auto-invoice trigger runs on completion.


      }

      // On decline, notify staff
      if (canonicalStatus === 'declined') {
        const { data: staffUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['admin', 'consultor', 'backoffice'])

        if (staffUsers?.length) {
          await supabase.from('notifications').insert(
            staffUsers.map((s: { user_id: string }) => ({
              user_id: s.user_id,
              type: 'contract_declined',
              title: 'Contrato recusado (PandaDoc)',
              message: `O contrato ${contract.id.slice(0, 8)} foi recusado via PandaDoc.`,
              entity_type: 'contract',
              entity_id: contract.id,
              link: '/admin?tab=backoffice&subtab=contracts',
            }))
          )
        }
      }

      // Mark inbox row processed on success.
      await markInboxProcessed(supabase, claim.inboxId, {
        status: 'processed', httpStatus: 200, contractId: contract.id,
      })
    }


    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('PandaDoc webhook error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})