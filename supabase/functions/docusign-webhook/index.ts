/**
 * DocuSign Webhook (Connect) Handler — V2 (Canonical Sync)
 * Receives envelope status updates from DocuSign and updates contract status.
 * 
 * Security:
 * 1. Verifies webhook authenticity via HMAC or shared secret (WEBHOOK_SECRET)
 * 2. Idempotency protection via provider_webhook_event_id
 * 3. Stores provider event payloads in contract_lifecycle_events for auditability
 * 
 * Uses shared lifecycleSync for intake/CRM/workspace orchestration.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncIntakeOnSent, syncIntakeOnCompleted } from '../_shared/lifecycleSync.ts'
import { handleLifecycleSyncResult } from '../_shared/lifecycleSyncResultHandler.ts'
import { autoCreateFounderAccount as sharedCreateFounder, enqueueFounderInviteTask } from '../_shared/founderAccount.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ═══ WEBHOOK AUTHENTICITY VERIFICATION (FAIL-CLOSED + HMAC) ═══
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('DocuSign webhook: WEBHOOK_SECRET not configured — REJECTING (fail-closed)')
      return new Response(JSON.stringify({ error: 'Server misconfigured: webhook secret missing' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Read raw body so we can both verify HMAC and parse it
    const rawBody = await req.text()

    const signatureHeader = req.headers.get('x-docusign-signature-1')
    const sharedSecretHeader = req.headers.get('x-webhook-secret')

    let authenticated = false

    // Path 1: Shared secret header — must match exactly
    if (sharedSecretHeader && timingSafeEqual(sharedSecretHeader, webhookSecret)) {
      authenticated = true
    }

    // Path 2: HMAC-SHA256 signature verification (DocuSign Connect)
    if (!authenticated && signatureHeader) {
      try {
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(webhookSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        )
        const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
        const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
        // Constant-time-ish comparison
        if (expected.length === signatureHeader.length) {
          let diff = 0
          for (let i = 0; i < expected.length; i++) {
            diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i)
          }
          if (diff === 0) authenticated = true
        }
      } catch (hmacErr) {
        console.error('DocuSign HMAC verification error:', hmacErr)
      }
    }

    if (!authenticated) {
      console.warn('DocuSign webhook: authenticity verification failed')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse DocuSign payload (JSON or XML)
    const contentType = req.headers.get('content-type') || ''
    let envelopeId: string | null = null
    let status: string | null = null
    let rawPayload: Record<string, unknown> = {}
    let eventId: string | null = null

    if (contentType.includes('application/json')) {
      const body = JSON.parse(rawBody)
      rawPayload = body
      envelopeId = body.data?.envelopeId || body.envelopeId
      status = body.data?.envelopeSummary?.status || body.event
      eventId = body.data?.eventId || `ds-${envelopeId}-${body.event || status}-${body.generatedDateTime || Date.now()}`

      // Envelope-level events drive canonical contract status.
      // Recipient-level events are per-signer only and must NOT activate the
      // contract on their own (bilateral: founder completing recipient-1 must
      // not fire full activation before the counter-signer). We map recipient
      // events to a distinct per-signer bucket handled below.
      const statusMap: Record<string, string> = {
        'envelope-sent': 'sent_for_signature',
        'envelope-delivered': 'viewed',
        'envelope-completed': 'completed',
        'envelope-declined': 'declined',
        'envelope-voided': 'voided',
      }
      const recipientEventMap: Record<string, string> = {
        'recipient-sent': 'sent',
        'recipient-delivered': 'viewed',
        'recipient-completed': 'signed',
        'recipient-declined': 'declined',
      }

      if (body.event && statusMap[body.event]) {
        status = statusMap[body.event]
      } else if (body.event && recipientEventMap[body.event]) {
        // Tag with a distinguishable prefix so downstream logic branches correctly
        status = `recipient:${recipientEventMap[body.event]}`
        ;(body as any)._recipientId = body.data?.recipientId || body.data?.envelopeSummary?.recipients?.signers?.[0]?.recipientId || null
        ;(body as any)._recipientEmail = body.data?.email || body.data?.envelopeSummary?.recipients?.signers?.[0]?.email || null
      }
    } else {
      const xmlText = rawBody
      rawPayload = { xml: xmlText }
      const envelopeIdMatch = xmlText.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i)
      const statusMatch = xmlText.match(/<Status>([^<]+)<\/Status>/i)
      envelopeId = envelopeIdMatch?.[1] || null
      status = statusMatch?.[1]?.toLowerCase() || null
      eventId = `ds-xml-${envelopeId}-${status}-${Date.now()}`
    }

    if (!envelopeId) {
      return new Response(JSON.stringify({ error: 'No envelope ID found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`DocuSign webhook: envelope=${envelopeId}, status=${status}, eventId=${eventId}`)

    // Find the contract — use PostgREST alias syntax (SQL "as" is invalid here).
    const { data: contract, error: findError } = await supabase
      .from('startup_contracts')
      .select('id, workspace_id, contract_status:status, legal_representative_email, legal_representative_name, signature_status, provider_webhook_event_id, pricing_snapshot_json, counter_signer_email, founder_signer_status, counter_signer_status')
      .eq('docusign_envelope_id', envelopeId)
      .maybeSingle()

    if (findError) {
      // Query error is different from "no match": log to lifecycle_events,
      // notify staff, and return 5xx so DocuSign retries.
      console.error('[docusign-webhook] contract lookup failed:', findError)
      try {
        await supabase.from('contract_lifecycle_events').insert({
          contract_id: null,
          event_type: 'docusign_webhook_lookup_error',
          event_date: new Date().toISOString().split('T')[0],
          details: { envelope_id: envelopeId, error: findError.message, event_id: eventId },
        })
        const { data: staffUsers } = await supabase
          .from('user_roles').select('user_id').in('role', ['admin', 'consultor', 'backoffice'])
        if (staffUsers?.length) {
          await supabase.from('notifications').insert(staffUsers.map((s: any) => ({
            user_id: s.user_id,
            type: 'system',
            title: 'Erro no webhook DocuSign',
            message: `Falha ao localizar contrato (envelope ${envelopeId}): ${findError.message}`,
            entity_type: 'contract',
            link: '/admin?tab=backoffice&subtab=contracts',
          })))
        }
      } catch (_) { /* best-effort */ }
      return new Response(JSON.stringify({ error: 'lookup_failed', envelope_id: envelopeId }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!contract) {
      console.warn('Contract not found for envelope:', envelopeId)
      return new Response(JSON.stringify({ ok: true, message: 'No matching contract' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ═══ IDEMPOTENCY: Skip duplicate events ═══
    if (eventId && contract.provider_webhook_event_id === eventId) {
      console.log(`Duplicate event skipped: ${eventId}`)
      return new Response(JSON.stringify({ ok: true, message: 'Duplicate event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ═══ AUDIT: Log event to contract_lifecycle_events ═══
    await supabase.from('contract_lifecycle_events').insert({
      contract_id: contract.id,
      event_type: `docusign_webhook_${status}`,
      event_date: new Date().toISOString().split('T')[0],
      details: {
        provider: 'docusign',
        envelope_id: envelopeId,
        event_id: eventId,
        canonical_status: status,
        raw_event: typeof rawPayload === 'object' ? { event: (rawPayload as any).event, generatedDateTime: (rawPayload as any).generatedDateTime } : null,
      },
    })

    // === RECIPIENT-LEVEL EVENTS: per-signer only, never activate ===
    if (typeof status === 'string' && status.startsWith('recipient:')) {
      const recStatus = status.slice('recipient:'.length)
      const recipientEmail = ((rawPayload as any)?._recipientEmail || null) as string | null
      const recipientId = ((rawPayload as any)?._recipientId || null) as string | null
      // Attribution priority: (1) recipientId — deterministic from docusign-send-envelope
      // (recipientId '1' = founder, '2' = counter-signer). (2) case-insensitive email as
      // fallback for cases where recipientId is missing. Never mis-attribute on shared/re-cased emails.
      const founderEmail = (contract.legal_representative_email || '').toLowerCase()
      const counterEmail = (contract.counter_signer_email || '').toLowerCase()
      const recIdStr = recipientId != null ? String(recipientId) : ''
      let isFounder = recIdStr === '1'
      let isCounter = recIdStr === '2'
      if (!isFounder && !isCounter && recipientEmail) {
        const lower = recipientEmail.toLowerCase()
        isFounder = lower === founderEmail
        isCounter = !isFounder && !!counterEmail && lower === counterEmail
      }
      const patch: Record<string, unknown> = {
        provider_last_event: `recipient-${recStatus}`,
        provider_last_sync_at: new Date().toISOString(),
        provider_last_error: null,
        provider_webhook_event_id: eventId,
      }
      if (isFounder) patch.founder_signer_status = recStatus
      else if (isCounter) patch.counter_signer_status = recStatus
      // If unattributable (missing id + missing email), fall back to first-signer = founder heuristic
      else if (!recipientEmail && !recIdStr && !contract.founder_signer_status) patch.founder_signer_status = recStatus
      await supabase.from('startup_contracts').update(patch).eq('id', contract.id)
      return new Response(JSON.stringify({ ok: true, message: 'recipient event recorded', recipient: { id: recipientId, email: recipientEmail, status: recStatus } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update contract
    const updatePayload: Record<string, unknown> = {
      signature_status: status,
      provider_last_event: status,
      provider_last_sync_at: new Date().toISOString(),
      provider_last_error: null,
      provider_webhook_event_id: eventId,
    }

    if (status === 'completed') {
      updatePayload.signed_at = new Date().toISOString()
      updatePayload.status = 'active'
      updatePayload.onboarding_completed_at = new Date().toISOString()
      updatePayload.provider_completed_at = new Date().toISOString()
      updatePayload.canonical_signature_status = 'completed'
      updatePayload.onboarding_token_hash = null
      updatePayload.onboarding_token_expires_at = null
      updatePayload.founder_signer_status = 'signed'
      if (contract.counter_signer_email) updatePayload.counter_signer_status = 'signed'
    } else if (status === 'declined') {
      updatePayload.canonical_signature_status = 'declined'
    } else if (status === 'voided') {
      updatePayload.canonical_signature_status = 'voided'
    } else if (status === 'sent_for_signature') {
      updatePayload.canonical_signature_status = 'sent'
    } else if (status === 'viewed') {
      updatePayload.canonical_signature_status = 'viewed'
    }

    await supabase
      .from('startup_contracts')
      .update(updatePayload)
      .eq('id', contract.id)

    // === CANONICAL LIFECYCLE SYNC (shared helper) ===
    if (status === 'sent_for_signature') {
      const r = await syncIntakeOnSent(supabase, contract.id, null, `docusign_webhook`)
      await handleLifecycleSyncResult(supabase, r, {
        contractId: contract.id, workspaceId: contract.workspace_id,
        source: 'docusign_webhook_sent', operation: 'sent',
      })
    } else if (status === 'completed') {
      const r = await syncIntakeOnCompleted(supabase, contract.id, contract.workspace_id, null, `docusign_webhook`)
      await handleLifecycleSyncResult(supabase, r, {
        contractId: contract.id, workspaceId: contract.workspace_id,
        source: 'docusign_webhook_completed', operation: 'completed',
      })
    }

    // === STAFF NOTIFICATION on decline/void (parity with pandadoc-webhook) ===
    if (status === 'declined' || status === 'voided') {
      try {
        const { data: staffUsers } = await supabase
          .from('user_roles').select('user_id').in('role', ['admin', 'consultor', 'backoffice'])
        if (staffUsers?.length) {
          await supabase.from('notifications').insert(staffUsers.map((s: any) => ({
            user_id: s.user_id,
            type: status === 'declined' ? 'contract_declined' : 'contract_voided',
            title: status === 'declined' ? 'Contrato recusado (DocuSign)' : 'Contrato anulado (DocuSign)',
            message: `Contrato ${contract.id.slice(0, 8)} — ${contract.legal_representative_name || 'founder'} (${status}).`,
            entity_type: 'contract',
            entity_id: contract.id,
            link: '/admin?tab=backoffice&subtab=contracts',
          })))
        }
      } catch (notifyErr) {
        console.warn('decline/void staff notification failed (non-fatal):', notifyErr)
      }
    }

    // === AUTO-REGISTRATION on completion ===
    if (status === 'completed' && contract.legal_representative_email) {
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




    // Notify staff
    if (status === 'completed') {
      const { data: staffUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor', 'backoffice'])

      if (staffUsers?.length) {
        await supabase.from('notifications').insert(
          staffUsers.map(s => ({
            user_id: s.user_id,
            type: 'contract_signed',
            title: 'Contrato assinado digitalmente',
            message: `O contrato ${contract.id.slice(0, 8)} foi assinado por ${contract.legal_representative_name || 'founder'} via DocuSign.`,
            entity_type: 'contract',
            entity_id: contract.id,
            link: '/admin?tab=contracts',
          }))
        )
      }

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        entity_type: 'contract',
        entity_id: contract.id,
        action: 'digitally_signed',
        workspace_id: contract.workspace_id,
        metadata: { envelope_id: envelopeId, provider: 'docusign', event_id: eventId },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('DocuSign webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// Founder account creation is now shared: see supabase/functions/_shared/founderAccount.ts