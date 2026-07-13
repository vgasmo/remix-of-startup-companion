/**
 * Edge Function: run-intake-reminders
 * Called by pg_cron to send automated reminders:
 * 1. Intake reminders — intakes still pending submission (D+2, D+5, D+10, then weekly)
 * 2. Signature reminders — contracts sent for signature but not yet signed (D+3, D+7, then weekly)
 *
 * Truthful-result rule (Batch A #6):
 *   reminder_count / last_reminder_sent_at / intake_events row are only written
 *   AFTER `send-intake-email` returns a confirmed 2xx `{success:true}`. Any
 *   provider, RPC, or network failure leaves the intake retry-eligible on the
 *   next cron run.
 *
 * Stops automatically when submission/signature happens.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCronSecret } from '../_shared/security.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface SendResult {
  ok: boolean
  status: number
  reason?: string
}

/**
 * Truthful email send: awaits the response, checks HTTP status AND
 * `{success:true}` in the body. Any non-2xx, malformed body, or thrown
 * network error returns `ok:false` so the caller must NOT commit counter
 * state.
 */
async function callSendIntakeEmail(
  supabaseUrl: string,
  cronSecret: string,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-intake-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify(payload),
    })

    const text = await res.text().catch(() => '')
    if (!res.ok) {
      return { ok: false, status: res.status, reason: text.slice(0, 500) || `http_${res.status}` }
    }

    // send-intake-email returns { success: true } on real delivery.
    try {
      const parsed = text ? JSON.parse(text) : {}
      if (parsed && parsed.success === true) {
        return { ok: true, status: res.status }
      }
      return { ok: false, status: res.status, reason: `unexpected_body: ${text.slice(0, 200)}` }
    } catch {
      // Body wasn't JSON — treat as failure to preserve truthful semantics.
      return { ok: false, status: res.status, reason: `non_json_body: ${text.slice(0, 200)}` }
    }
  } catch (err) {
    return { ok: false, status: 0, reason: err instanceof Error ? err.message : String(err) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // SECURITY: Fail-closed timing-safe x-cron-secret check (cron-only).
  const authCheck = requireCronSecret(req)
  if ('error' in authCheck) {
    console.error('[run-intake-reminders] Unauthorized invocation')
    return authCheck.error
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const cronSecret = Deno.env.get('CRON_SECRET')!
    const supabase = createClient(supabaseUrl, serviceKey)

    let intakesSent = 0
    let intakesFailed = 0
    let signatureSent = 0
    let signatureFailed = 0

    // ── 1. INTAKE REMINDERS ──
    const { data: pendingIntakes, error: intakesErr } = await supabase
      .from('contract_intakes')
      .select('id, organization_name, legal_representative_email, legal_representative_name, created_at, last_reminder_sent_at, reminder_count, status')
      .in('status', ['intake_requested', 'intake_in_progress', 'changes_requested'])
      .not('legal_representative_email', 'is', null)

    if (intakesErr) {
      console.error('[run-intake-reminders] intake fetch failed:', intakesErr)
      return new Response(JSON.stringify({ error: 'intake_fetch_failed', details: intakesErr.message }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (pendingIntakes?.length) {
      const now = new Date()

      for (const intake of pendingIntakes) {
        const createdAt = new Date(intake.created_at)
        const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
        const lastReminder = intake.last_reminder_sent_at ? new Date(intake.last_reminder_sent_at) : null
        const daysSinceLastReminder = lastReminder
          ? Math.floor((now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24))
          : Infinity
        const count = intake.reminder_count || 0

        // Cadence: D+2, D+5, D+10, then weekly
        let shouldSend = false
        if (count === 0 && daysSinceCreated >= 2) shouldSend = true
        else if (count === 1 && daysSinceCreated >= 5) shouldSend = true
        else if (count === 2 && daysSinceCreated >= 10) shouldSend = true
        else if (count >= 3 && daysSinceLastReminder >= 7) shouldSend = true

        if (!shouldSend) continue

        // Rotate token so the reminder link is fresh and DB only stores hash.
        // If rotation fails, do not mutate counters — intake stays retry-eligible.
        const { data: freshToken, error: rotateErr } = await supabase.rpc('staff_rotate_intake_token', { p_intake_id: intake.id })
        if (rotateErr || !freshToken) {
          intakesFailed++
          console.error(`[run-intake-reminders] token rotation failed for ${intake.id}:`, rotateErr?.message || 'no_token')
          continue
        }

        const send = await callSendIntakeEmail(supabaseUrl, cronSecret, {
          type: intake.status === 'changes_requested' ? 'changes_requested' : 'intake_reminder',
          intakeId: intake.id,
          recipientEmail: intake.legal_representative_email,
          recipientName: intake.legal_representative_name,
          organizationName: intake.organization_name,
          intakeToken: freshToken,
        })

        if (!send.ok) {
          intakesFailed++
          console.error(`[run-intake-reminders] send failed for intake ${intake.id}: ${send.reason} (status ${send.status})`)
          // DO NOT update counters — intake remains retry-eligible.
          continue
        }

        // ✅ Confirmed success: commit counter + audit atomically-ish.
        const { error: updErr } = await supabase
          .from('contract_intakes')
          .update({
            last_reminder_sent_at: now.toISOString(),
            reminder_count: count + 1,
          })
          .eq('id', intake.id)

        if (updErr) {
          intakesFailed++
          console.error(`[run-intake-reminders] counter update failed for ${intake.id}:`, updErr.message)
          continue
        }

        await supabase.from('intake_events').insert({
          intake_id: intake.id,
          event_type: 'reminder_sent',
          metadata: { reminder_number: count + 1, type: 'intake' },
        })

        intakesSent++
      }
    }

    // ── 2. SIGNATURE REMINDERS ──
    const { data: pendingSignatures, error: sigErr } = await supabase
      .from('contract_intakes')
      .select('id, organization_name, legal_representative_email, legal_representative_name, updated_at, last_reminder_sent_at, reminder_count, status, contract_id')
      .eq('status', 'signature_sent')
      .not('legal_representative_email', 'is', null)

    if (sigErr) {
      console.error('[run-intake-reminders] signature fetch failed:', sigErr)
      return new Response(JSON.stringify({ error: 'signature_fetch_failed', details: sigErr.message }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (pendingSignatures?.length) {
      const now = new Date()

      for (const intake of pendingSignatures) {
        const sentAt = new Date(intake.updated_at)
        const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24))
        const lastReminder = intake.last_reminder_sent_at ? new Date(intake.last_reminder_sent_at) : null
        const daysSinceLastReminder = lastReminder
          ? Math.floor((now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24))
          : Infinity

        // Signature cadence: D+3, D+7, then weekly
        let shouldSend = false
        if (!lastReminder && daysSinceSent >= 3) shouldSend = true
        else if (lastReminder && daysSinceLastReminder >= 7) shouldSend = true

        if (!shouldSend) continue

        const send = await callSendIntakeEmail(supabaseUrl, cronSecret, {
          type: 'signature_reminder',
          intakeId: intake.id,
          recipientEmail: intake.legal_representative_email,
          recipientName: intake.legal_representative_name,
          organizationName: intake.organization_name,
        })

        if (!send.ok) {
          signatureFailed++
          console.error(`[run-intake-reminders] signature send failed for ${intake.id}: ${send.reason} (status ${send.status})`)
          // DO NOT update counters — retry next cron run.
          continue
        }

        const sigReminderCount = (intake.reminder_count || 0) + 1
        const { error: updErr } = await supabase
          .from('contract_intakes')
          .update({
            last_reminder_sent_at: now.toISOString(),
            reminder_count: sigReminderCount,
          })
          .eq('id', intake.id)

        if (updErr) {
          signatureFailed++
          console.error(`[run-intake-reminders] signature counter update failed for ${intake.id}:`, updErr.message)
          continue
        }

        await supabase.from('intake_events').insert({
          intake_id: intake.id,
          event_type: 'reminder_sent',
          metadata: { reminder_number: sigReminderCount, type: 'signature' },
        })

        signatureSent++
      }
    }

    return new Response(JSON.stringify({
      success: true,
      intakeRemindersSent: intakesSent,
      intakeRemindersFailed: intakesFailed,
      signatureRemindersSent: signatureSent,
      signatureRemindersFailed: signatureFailed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('run-intake-reminders error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
