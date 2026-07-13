/**
 * Edge Function: run-intake-reminders
 * Called by pg_cron to send automated reminders:
 * 1. Intake reminders — intakes still pending submission (D+2, D+5, D+10, then weekly)
 * 2. Signature reminders — contracts sent for signature but not yet signed (D+3, D+7, then weekly)
 * 
 * Stops automatically when submission/signature happens.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Auth: only x-cron-secret is accepted. The previous Bearer <anon key> path
  // was removed — anon-key acceptance is not a valid cron authorization.
  const cronSecret = req.headers.get('x-cron-secret')
  const cronSecretEnv = Deno.env.get('CRON_SECRET')

  const isAuthedByCron = !!cronSecret && !!cronSecretEnv && cronSecret === cronSecretEnv

  if (!isAuthedByCron) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    let intakesSent = 0
    let signatureSent = 0

    // ── 1. INTAKE REMINDERS ──
    // Fetch intakes in editable states that haven't been submitted
    const { data: pendingIntakes } = await supabase
      .from('contract_intakes')
      .select('id, organization_name, legal_representative_email, legal_representative_name, created_at, last_reminder_sent_at, reminder_count, status')
      .in('status', ['intake_requested', 'intake_in_progress', 'changes_requested'])
      .not('legal_representative_email', 'is', null)

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

        if (shouldSend) {
          try {
            // Rotate token so the reminder link is fresh and DB only stores hash
            const { data: freshToken } = await supabase.rpc('staff_rotate_intake_token', { p_intake_id: intake.id })
            await fetch(`${supabaseUrl}/functions/v1/send-intake-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': Deno.env.get('CRON_SECRET')!,
              },
              body: JSON.stringify({
                type: intake.status === 'changes_requested' ? 'changes_requested' : 'intake_reminder',
                intakeId: intake.id,
                recipientEmail: intake.legal_representative_email,
                recipientName: intake.legal_representative_name,
                organizationName: intake.organization_name,
                intakeToken: freshToken,
              }),
            })

            // Update reminder tracking
            await supabase
              .from('contract_intakes')
              .update({
                last_reminder_sent_at: now.toISOString(),
                reminder_count: count + 1,
              })
              .eq('id', intake.id)

            // Audit
            await supabase.from('intake_events').insert({
              intake_id: intake.id,
              event_type: 'reminder_sent',
              metadata: { reminder_number: count + 1, type: 'intake' },
            })

            intakesSent++
          } catch (err) {
            console.error(`Failed to send intake reminder for ${intake.id}:`, err)
          }
        }
      }
    }

    // ── 2. SIGNATURE REMINDERS ──
    // Fetch intakes in signature_sent state
    const { data: pendingSignatures } = await supabase
      .from('contract_intakes')
      .select('id, organization_name, legal_representative_email, legal_representative_name, updated_at, last_reminder_sent_at, reminder_count, status, contract_id')
      .eq('status', 'signature_sent')
      .not('legal_representative_email', 'is', null)

    if (pendingSignatures?.length) {
      const now = new Date()

      for (const intake of pendingSignatures) {
        const sentAt = new Date(intake.updated_at) // approximation of when signature was sent
        const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24))
        const lastReminder = intake.last_reminder_sent_at ? new Date(intake.last_reminder_sent_at) : null
        const daysSinceLastReminder = lastReminder
          ? Math.floor((now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24))
          : Infinity

        // Signature cadence: D+3, D+7, then weekly
        let shouldSend = false
        if (!lastReminder && daysSinceSent >= 3) shouldSend = true
        else if (lastReminder && daysSinceLastReminder >= 7) shouldSend = true

        if (shouldSend) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-intake-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': Deno.env.get('CRON_SECRET')!,
              },
              body: JSON.stringify({
                type: 'signature_reminder',
                intakeId: intake.id,
                recipientEmail: intake.legal_representative_email,
                recipientName: intake.legal_representative_name,
                organizationName: intake.organization_name,
              }),
            })

            // Update reminder tracking (reuse same fields, separate from intake reminders since state changed)
            const sigReminderCount = (intake.reminder_count || 0) + 1
            await supabase
              .from('contract_intakes')
              .update({
                last_reminder_sent_at: now.toISOString(),
                reminder_count: sigReminderCount,
              })
              .eq('id', intake.id)

            await supabase.from('intake_events').insert({
              intake_id: intake.id,
              event_type: 'reminder_sent',
              metadata: { reminder_number: sigReminderCount, type: 'signature' },
            })

            signatureSent++
          } catch (err) {
            console.error(`Failed to send signature reminder for ${intake.id}:`, err)
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      intakeRemindersSent: intakesSent,
      signatureRemindersSent: signatureSent,
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
