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

  const { data, error } = await admin.rpc('open_monthly_founder_pulse_cycles')
  if (error) {
    console.error('[open-monthly-founder-pulse] rpc error', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, opened: data ?? 0 }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}))
