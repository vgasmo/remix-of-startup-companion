/**
 * Open Monthly Founder Pulse Cycles — cron
 *
 * Idempotently opens one `founder_pulse_cycles` row per active workspace for
 * the current calendar month (Europe/Lisbon month bucket via DB now()).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCronOrStaff } from '../_shared/security.ts'
import { withCronRunLogging } from '../_shared/cronRun.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

Deno.serve(withCronRunLogging('open-monthly-founder-pulse', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const userClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const authCheck = await requireCronOrStaff(req, userClient, admin)
  if ('error' in authCheck) return authCheck.error

  // Batch D: kill switch is enforced server-side. Fail-closed if the flag is
  // absent or disabled — no cycle rows, no notifications, no emails.
  const { data: flagRow, error: flagErr } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'founder_monthly_pulse')
    .eq('scope', 'global')
    .maybeSingle()
  if (flagErr) {
    console.error('[open-monthly-founder-pulse] flag lookup failed', flagErr)
    return new Response(JSON.stringify({ ok: false, error: 'flag_lookup_failed' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!flagRow?.enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'flag_off' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data, error } = await admin.rpc('open_and_notify_monthly_founder_pulse_cycles')
  if (error) {
    console.error('[open-monthly-founder-pulse] rpc error', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const payload = (data ?? {}) as { opened?: number; enqueued?: number; period_month?: string }
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}))
