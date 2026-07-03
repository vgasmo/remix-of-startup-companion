/**
 * PandaDoc Webhook Handler — Hardened V2 (Canonical Sync)
 * 
 * Security:
 * 1. REJECTS requests when PANDADOC_WEBHOOK_KEY is missing (fail-closed)
 * 2. REJECTS requests with invalid signature
 * 3. Idempotency protection via provider_webhook_event_id
 * 4. Stores provider event payloads for auditability
 * 
 * Maps PandaDoc events → canonical internal signature states.
 * Uses shared lifecycleSync for intake/CRM/workspace orchestration.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncIntakeOnSent, syncIntakeOnCompleted } from '../_shared/lifecycleSync.ts'
import { handleLifecycleSyncResult } from '../_shared/lifecycleSyncResultHandler.ts'

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
 * Constant-time string equality — prevents timing attacks that progressively
 * reveal the secret by measuring early-exit comparison time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  const len = Math.max(aBytes.length, bBytes.length)
  let diff = aBytes.length ^ bBytes.length
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)
  }
  return diff === 0
}

/**
 * Verify PandaDoc webhook authenticity — FAIL-CLOSED.
 */
function verifyWebhookAuthenticity(body: any, req: Request): { ok: boolean; reason?: string } {
  const webhookKey = Deno.env.get('PANDADOC_WEBHOOK_KEY')
  
  if (!webhookKey) {
    console.error('PANDADOC_WEBHOOK_KEY not configured — REJECTING request (fail-closed policy)')
    return { ok: false, reason: 'Webhook secret not configured — cannot verify authenticity' }
  }

  const payloadKey = body?.shared_key || null
  const headerKey = req.headers.get('x-pandadoc-signature') || req.headers.get('authorization')?.replace('Bearer ', '') || null

  if (
    (payloadKey && timingSafeEqual(payloadKey, webhookKey)) ||
    (headerKey && timingSafeEqual(headerKey, webhookKey))
  ) {
    return { ok: true }
  }

  console.error('PandaDoc webhook authentication FAILED — invalid signature, rejecting event')
  return { ok: false, reason: 'Invalid webhook signature' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // ═══ SECURITY: Verify webhook authenticity (FAIL-CLOSED) ═══
    const authResult = verifyWebhookAuthenticity(body, req)
    if (!authResult.ok) {
      return new Response(JSON.stringify({ error: `Unauthorized — ${authResult.reason}` }), {
        status: 401,
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
      const eventId = event.event_id || event.id || `${pandadocDocId}_${eventName}_${Date.now()}`

      if (!pandadocDocId) {
        console.warn('PandaDoc webhook: no document ID found in payload', JSON.stringify(event).slice(0, 300))
        continue
      }

      console.log(`PandaDoc webhook: doc=${pandadocDocId}, event=${eventName}, eventId=${eventId}`)

      // Find contract by provider_document_id
      const { data: contract, error: findError } = await supabase
        .from('startup_contracts')
        .select('id, workspace_id, status as contract_status, legal_representative_email, legal_representative_name, signature_status, provider_webhook_event_id')
        .eq('provider_document_id', pandadocDocId)
        .eq('signature_provider', 'pandadoc')
        .single()

      if (findError || !contract) {
        console.warn('Contract not found for PandaDoc document:', pandadocDocId)
        continue
      }

      // ═══ IDEMPOTENCY: Skip duplicate events ═══
      if (contract.provider_webhook_event_id === eventId) {
        console.log(`Duplicate event skipped: ${eventId}`)
        continue
      }

      // Map to canonical status
      const canonicalStatus = PANDADOC_STATUS_MAP[eventName] || contract.signature_status || 'draft'

      const updatePayload: Record<string, unknown> = {
        signature_status: canonicalStatus,
        provider_last_event: eventName,
        provider_last_sync_at: new Date().toISOString(),
        provider_last_error: null,
        provider_webhook_event_id: eventId,
      }

      if (canonicalStatus === 'completed') {
        updatePayload.signed_at = new Date().toISOString()
        updatePayload.status = 'active'
        updatePayload.provider_completed_at = new Date().toISOString()
        updatePayload.onboarding_completed_at = new Date().toISOString()
        updatePayload.onboarding_token_hash = null
        updatePayload.onboarding_token_expires_at = null
      }

      await supabase
        .from('startup_contracts')
        .update(updatePayload)
        .eq('id', contract.id)

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
          raw_payload_preview: JSON.stringify(event).slice(0, 1000),
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

        // ═══ AUTO-GENERATE FIRST INVOICE on completion ═══
        // Disabled per product decision (invoicing surface hidden, no payment tracking).
        // Re-enable by setting INVOICING_ENABLED=true and re-mounting BackofficeInvoicesTab.
        const invoicingEnabled = Deno.env.get('INVOICING_ENABLED') === 'true'
        if (invoicingEnabled) {
          try {
            const targetMonth = new Date().toISOString().slice(0, 7)
            console.log(`Triggering invoice generation for contract ${contract.id}, month ${targetMonth}`)

            const functionUrl = `${supabaseUrl}/functions/v1/generate-invoices`
            await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                targetMonth,
                contractId: contract.id,
              }),
            })
          } catch (invoiceErr) {
            console.error('Auto-invoice generation error (non-fatal):', invoiceErr)
          }
        }

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
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('PandaDoc webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})