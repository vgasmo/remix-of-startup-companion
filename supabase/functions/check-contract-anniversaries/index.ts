/**
 * Check Contract Anniversaries & Lifecycle Events — V1 Hardened
 * 
 * Creates REAL operational records (not just notifications):
 * - Annual anniversary reviews (1y, 2y, 3y)
 * - Biennial price review notices (every 2y, 60-day advance)
 * - Post-incubation transition detection (3y+)
 * - Contract renewal eligibility
 * - Lifecycle events stored in contract_lifecycle_events table
 * 
 * Source of truth: Minuta V9 Cláusula 6.ª/10.ª + Regulamento V11 Art. 9.º/10.º
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

  try {
    const authHeader = req.headers.get('Authorization')
    const cronSecret = Deno.env.get('CRON_SECRET')
    const cronHeader = req.headers.get('x-cron-secret')
    const isCron = (!!cronSecret) && (
      cronHeader === cronSecret || authHeader === `Bearer ${cronSecret}`
    )

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (!isCron) {
      const token = authHeader?.replace('Bearer ', '')
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: { user } } = await supabase.auth.getUser(token)
      if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'consultor', 'backoffice'])
      if (!roles?.length) {
        return new Response(JSON.stringify({ error: 'Staff only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const alerts: any[] = []
    const lifecycleEvents: any[] = []

    // Fetch all active/suspended contracts (include incubation_type to honor auto-renewal)
    const { data: contracts, error: fetchError } = await supabase
      .from('startup_contracts')
      .select(`
        id, workspace_id, start_date, end_date, monthly_fee, status,
        incubation_year, is_post_incubation, next_price_review_date, last_price_review_date,
        incubation_type_id,
        incubation_type:incubation_types(auto_renewal, renewal_months),
        workspace:workspaces(startup:startups(name))
      `)
      .in('status', ['active', 'suspended'])

    if (fetchError) throw fetchError

    for (const contract of contracts || []) {
      const startDate = new Date(contract.start_date)
      const startupName = (contract as any).workspace?.startup?.name || 'Unknown'
      const monthsActive = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      const currentYear = Math.max(1, Math.floor(monthsActive / 12) + 1)

      // ═══ 1. ANNUAL ANNIVERSARY CHECKS ═══
      for (const targetYear of [1, 2, 3]) {
        const anniversaryDate = new Date(startDate)
        anniversaryDate.setFullYear(startDate.getFullYear() + targetYear)
        const diffDays = Math.round((today.getTime() - anniversaryDate.getTime()) / (1000 * 60 * 60 * 24))

        // 7 days before anniversary
        if (diffDays >= -7 && diffDays <= 0) {
          const reminderType = `anniversary_${targetYear}y`
          const { data: existing } = await supabase
            .from('contract_reminders')
            .select('id')
            .eq('contract_id', contract.id)
            .eq('reminder_type', reminderType)
            .gte('scheduled_date', new Date(today.getFullYear(), today.getMonth(), 1).toISOString())

          if (!existing?.length) {
            alerts.push({
              contractId: contract.id,
              workspaceId: contract.workspace_id,
              startupName,
              type: reminderType,
              years: targetYear,
            })

            // Create operational reminder
            await supabase.from('contract_reminders').insert({
              contract_id: contract.id,
              reminder_type: reminderType,
              scheduled_date: todayStr,
            })

            // Create lifecycle event
            await supabase.from('contract_lifecycle_events').insert({
              contract_id: contract.id,
              event_type: 'anniversary_review',
              event_date: todayStr,
              details: {
                year: targetYear,
                startup_name: startupName,
                months_active: monthsActive,
                action_required: targetYear >= 3 ? 'post_incubation_review' : 'annual_review',
              },
            })
          }
        }
      }

      // ═══ 2. BIENNIAL PRICE REVIEW (Cláusula 6.ª §2 — every 2 years) ═══
      // Check if a price review is due — 60 days before the biennial date
      const biennialDates = [2, 4, 6, 8, 10] // years at which biennial review occurs
      for (const biennialYear of biennialDates) {
        const reviewDate = new Date(startDate)
        reviewDate.setFullYear(startDate.getFullYear() + biennialYear)
        const daysUntilReview = Math.round((reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        // 60-day advance notice window (Cláusula 6.ª §4)
        if (daysUntilReview > 0 && daysUntilReview <= 67 && daysUntilReview >= 53) {
          const reminderType = `biennial_review_${biennialYear}y`
          const { data: existing } = await supabase
            .from('contract_reminders')
            .select('id')
            .eq('contract_id', contract.id)
            .eq('reminder_type', reminderType)

          if (!existing?.length) {
            alerts.push({
              contractId: contract.id,
              workspaceId: contract.workspace_id,
              startupName,
              type: 'biennial_price_review',
              years: biennialYear,
              daysUntilReview,
            })

            await supabase.from('contract_reminders').insert({
              contract_id: contract.id,
              reminder_type: reminderType,
              scheduled_date: todayStr,
            })

            // Create actionable lifecycle event
            await supabase.from('contract_lifecycle_events').insert({
              contract_id: contract.id,
              event_type: 'biennial_price_review_notice',
              event_date: todayStr,
              details: {
                review_year: biennialYear,
                review_effective_date: reviewDate.toISOString().split('T')[0],
                days_until_review: daysUntilReview,
                notice_requirement_days: 60,
                tacit_acceptance_days: 30,
                current_monthly_fee: contract.monthly_fee,
                startup_name: startupName,
                action_required: 'send_price_review_notice',
                regulation_reference: 'Cláusula 6.ª §4-5 do Contrato / Art. 6.º §4 do Regulamento V11',
              },
            })

            // Update next_price_review_date on contract
            await supabase.from('startup_contracts')
              .update({ next_price_review_date: reviewDate.toISOString().split('T')[0] })
              .eq('id', contract.id)
          }
        }
      }

      // ═══ 3. POST-INCUBATION TRANSITION (Art. 9.º — 3 years) ═══
      if (monthsActive >= 36 && !contract.is_post_incubation) {
        const reminderType = `post_incubation_transition`
        const { data: existing } = await supabase
          .from('contract_reminders')
          .select('id')
          .eq('contract_id', contract.id)
          .eq('reminder_type', reminderType)

        if (!existing?.length) {
          alerts.push({
            contractId: contract.id,
            workspaceId: contract.workspace_id,
            startupName,
            type: 'post_incubation_eligible',
            monthsActive,
          })

          await supabase.from('contract_reminders').insert({
            contract_id: contract.id,
            reminder_type: reminderType,
            scheduled_date: todayStr,
          })

          await supabase.from('contract_lifecycle_events').insert({
            contract_id: contract.id,
            event_type: 'post_incubation_eligible',
            event_date: todayStr,
            details: {
              months_active: monthsActive,
              startup_name: startupName,
              action_required: 'ca_review_post_incubation',
              regulation_reference: 'Art. 9.º do Regulamento V11 — Permanência na Startup Leiria',
            },
          })
        }
      }

      // ═══ 4. UPDATE INCUBATION YEAR ON CONTRACT ═══
      if (contract.incubation_year !== currentYear) {
        await supabase.from('startup_contracts')
          .update({ incubation_year: currentYear })
          .eq('id', contract.id)
      }

      // ═══ 5. CONTRACT RENEWAL WINDOW (30d before end — Cláusula 10.ª) ═══
      if (contract.end_date) {
        const endDate = new Date(contract.end_date)
        const daysUntilEnd = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilEnd > 0 && daysUntilEnd <= 35 && daysUntilEnd >= 25) {
          // Dedupe by end_date (not year) so successive renewals still alert
          const reminderType = `renewal_notice_${contract.end_date}`
          const { data: existing } = await supabase
            .from('contract_reminders')
            .select('id')
            .eq('contract_id', contract.id)
            .eq('reminder_type', reminderType)

          if (!existing?.length) {
            alerts.push({
              contractId: contract.id,
              workspaceId: contract.workspace_id,
              startupName,
              type: 'renewal_approaching',
              daysUntilEnd,
            })

            await supabase.from('contract_reminders').insert({
              contract_id: contract.id,
              reminder_type: reminderType,
              scheduled_date: todayStr,
            })

            await supabase.from('contract_lifecycle_events').insert({
              contract_id: contract.id,
              event_type: 'renewal_window',
              event_date: todayStr,
              details: {
                end_date: contract.end_date,
                days_until_end: daysUntilEnd,
                startup_name: startupName,
                action_required: 'review_renewal_or_termination',
                regulation_reference: 'Cláusula 10.ª — Renovação automática',
              },
            })
          }
        }

        // ═══ 6. AUTO-EXPIRY SWEEP — contracts past end_date ═══
        // Respect auto-renewal (Cláusula 10.ª): auto-extend those instead of expiring.
        if (contract.status === 'active' && daysUntilEnd < 0) {
          const autoRenew = (contract as any).incubation_type?.auto_renewal === true
          const renewalMonths = (contract as any).incubation_type?.renewal_months ?? 12
          if (autoRenew) {
            const newEnd = new Date(endDate)
            newEnd.setMonth(newEnd.getMonth() + renewalMonths)
            await supabase.from('startup_contracts')
              .update({ end_date: newEnd.toISOString().split('T')[0] })
              .eq('id', contract.id)
            await supabase.from('contract_lifecycle_events').insert({
              contract_id: contract.id,
              event_type: 'auto_renewed',
              event_date: todayStr,
              details: {
                previous_end_date: contract.end_date,
                new_end_date: newEnd.toISOString().split('T')[0],
                startup_name: startupName,
                regulation_reference: 'Cláusula 10.ª — Renovação automática',
              },
            })
            alerts.push({
              contractId: contract.id,
              workspaceId: contract.workspace_id,
              startupName,
              type: 'auto_renewed',
              newEnd: newEnd.toISOString().split('T')[0],
            })
          } else {
            await supabase.from('startup_contracts')
              .update({ status: 'expired' })
              .eq('id', contract.id)
            await supabase.from('contract_lifecycle_events').insert({
              contract_id: contract.id,
              event_type: 'expired',
              event_date: todayStr,
              details: {
                end_date: contract.end_date,
                startup_name: startupName,
                action_required: 'staff_review_expired_contract',
              },
            })
            alerts.push({
              contractId: contract.id,
              workspaceId: contract.workspace_id,
              startupName,
              type: 'expired',
              endDate: contract.end_date,
            })
          }
        }
      }
    }

    // ═══ NOTIFY STAFF ═══
    if (alerts.length > 0) {
      const { data: staffUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor', 'backoffice'])

      if (staffUsers?.length) {
        const notifications = alerts.map(alert => {
          let title = ''
          let message = ''
          
          if (alert.type === 'biennial_price_review') {
            title = `📊 Revisão bienal — ${alert.startupName}`
            message = `A revisão de preços bienal de ${alert.startupName} é devida em ${alert.daysUntilReview} dias. Enviar comunicação escrita (Cláusula 6.ª §4).`
          } else if (alert.type === 'post_incubation_eligible') {
            title = `🎓 Pós-incubação — ${alert.startupName}`
            message = `${alert.startupName} atingiu ${Math.floor(alert.monthsActive / 12)} anos de incubação. Revisão CA para deliberar pós-incubação (Art. 9.º).`
          } else if (alert.type === 'renewal_approaching') {
            title = `🔄 Renovação — ${alert.startupName}`
            message = `O contrato de ${alert.startupName} termina em ${alert.daysUntilEnd} dias. Verificar renovação automática ou denúncia.`
          } else if (alert.type === 'auto_renewed') {
            title = `♻️ Renovado automaticamente — ${alert.startupName}`
            message = `Contrato renovado até ${alert.newEnd} (Cláusula 10.ª). Confirme alocação e mensalidade se necessário.`
          } else if (alert.type === 'expired') {
            title = `⏰ Contrato expirado — ${alert.startupName}`
            message = `O contrato terminou a ${alert.endDate} sem renovação. Marcado como 'expired'. Verifique alocações e transição do workspace.`
          } else {
            title = `🎂 ${alert.startupName} — ${alert.years} ${alert.years === 1 ? 'ano' : 'anos'}`
            message = `Aniversário contratual de ${alert.startupName} (${alert.years} ${alert.years === 1 ? 'ano' : 'anos'}).`
          }

          return staffUsers.map(s => ({
            user_id: s.user_id,
            type: 'contract_lifecycle',
            title,
            message,
            entity_type: 'contract',
            entity_id: alert.contractId,
            link: `/admin?tab=backoffice&subtab=contracts&contract=${alert.contractId}`,
          }))
        }).flat()

        if (notifications.length) {
          await supabase.from('notifications').insert(notifications)
        }
      }
    }

    return new Response(JSON.stringify({
      checked: contracts?.length || 0,
      alerts: alerts.length,
      details: alerts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Lifecycle check error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
