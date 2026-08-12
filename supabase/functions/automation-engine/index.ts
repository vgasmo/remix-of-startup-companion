/**
 * Automation Engine — Central cron-driven edge function
 * Processes 12 automated checks and creates notifications + optional emails
 * Runs hourly via pg_cron
 * 
 * Deduplication: Uses automation_runs table to avoid sending the same notification twice per day
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCronOrStaff } from '../_shared/security.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SITE_URL = Deno.env.get('SITE_URL') || 'https://fb.startupleiria.com'

interface AutomationResult {
  type: string
  notifications: number
  emails: number
  errors: string[]
}

// Simple email sender via Resend
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Startup Leiria <noreply@startupleiria.com>',
        to: [to],
        subject,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Check if automation was already run today for this entity+user
async function wasAlreadyRun(
  supabase: any, type: string, entityId: string | null, userId: string, today: string
): Promise<boolean> {
  const query = supabase.from('automation_runs').select('id', { count: 'exact', head: true })
    .eq('automation_type', type)
    .eq('user_id', userId)
    .eq('run_date', today)
  if (entityId) query.eq('entity_id', entityId)
  const { count } = await query
  return (count ?? 0) > 0
}

// Record that automation was run. Throws on DB error so callers do not
// increment success counters for a write that never landed (F1).
async function recordRun(
  supabase: any, type: string, entityId: string | null, entityType: string, userId: string, today: string, channel: string
) {
  const { error } = await supabase.from('automation_runs').insert({
    automation_type: type,
    entity_id: entityId,
    entity_type: entityType,
    user_id: userId,
    run_date: today,
    channel,
  })
  if (error) throw new Error(`recordRun(${type}): ${error.message}`)
}

// Create in-app notification. Throws on DB error so callers do not increment
// success counters for a write that never landed (F1).
async function notify(
  supabase: any, userId: string, type: string, title: string, message: string, link?: string, entityType?: string, entityId?: string
) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    link: link || null,
    read: false,
    entity_type: entityType || null,
    entity_id: entityId || null,
  })
  if (error) throw new Error(`notify(${type}): ${error.message}`)
}

// Get staff user IDs (admin + consultor)
async function getStaffIds(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'consultor'])
  return [...new Set((data || []).map((r: any) => r.user_id as string))] as string[]

}

async function getAdminIds(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('user_roles').select('user_id').eq('role', 'admin')
  return [...new Set((data || []).map((r: any) => r.user_id as string))] as string[]
}

async function getUserEmail(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('email').eq('id', userId).single()
  return data?.email || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const runStartedAt = Date.now()
  let supabase: any = null
  const logRun = async (status: string, extra: Record<string, unknown> = {}, errorSummary?: string) => {
    if (!supabase) return
    try {
      await supabase.rpc('log_cron_job_run', {
        p_job_name: 'automation-engine',
        p_status: status,
        p_duration_ms: Date.now() - runStartedAt,
        p_error_code: null,
        p_error_summary: errorSummary ?? null,
        p_details: extra,
        p_triggered_by: 'cron',
      })
    } catch (e) {
      console.warn('[automation-engine] log_cron_job_run failed', e)
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    supabase = createClient(supabaseUrl, supabaseKey)

    // SECURITY: Fail-closed — accept valid CRON_SECRET (timing-safe, x-cron-secret header)
    // OR a staff JWT (admin/consultor/backoffice). Requires CRON_SECRET configured.
    const supabaseUserClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const authCheck = await requireCronOrStaff(req, supabaseUserClient, supabase)
    if ('error' in authCheck) {
      console.error('[automation-engine] Unauthorized invocation')
      return authCheck.error
    }


    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const results: AutomationResult[] = []

    // ═══════════════════════════════════════════════════════════
    // 1. DESCONTO A EXPIRAR (30/15/7 dias)
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'discount_expiring', notifications: 0, emails: 0, errors: [] }
      try {
        const { data: discounts } = await supabase
          .from('contract_discounts')
          .select('id, contract_id, discount_percentage, end_date, contract:startup_contracts(workspace_id, workspace:workspaces(startup:startups(name)))')
          .not('end_date', 'is', null)
          .gte('end_date', todayStr)

        const staffIds = await getStaffIds(supabase)
        for (const d of discounts || []) {
          const endDate = new Date(d.end_date)
          const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          if (![30, 15, 7].includes(daysLeft)) continue

          const startupName = (d as any).contract?.workspace?.startup?.name || 'Startup'
          for (const staffId of staffIds) {
            if (await wasAlreadyRun(supabase, 'discount_expiring', d.id, staffId, todayStr)) continue
            await notify(supabase, staffId, 'discount_expiring',
              `Desconto de ${d.discount_percentage}% expira em ${daysLeft} dias`,
              `O desconto da ${startupName} expira a ${d.end_date}.`,
              `/workspace/${(d as any).contract?.workspace_id}?tab=contract`,
              'contract_discount', d.id)
            await recordRun(supabase, 'discount_expiring', d.id, 'contract_discount', staffId, todayStr, 'both')
            result.notifications++

            const email = await getUserEmail(supabase, staffId)
            if (email) {
              if (await sendEmail(email,
                `[Startup Leiria] Desconto ${startupName} expira em ${daysLeft} dias`,
                `<p>O desconto de ${d.discount_percentage}% da <strong>${startupName}</strong> expira em <strong>${daysLeft} dias</strong> (${d.end_date}).</p><p><a href="${SITE_URL}/workspace/${(d as any).contract?.workspace_id}?tab=contract">Ver contrato</a></p>`)) {
                result.emails++
              }
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 2. ANIVERSÁRIO DE CONTRATO
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'contract_anniversary', notifications: 0, emails: 0, errors: [] }
      try {
        const { data: contracts } = await supabase
          .from('startup_contracts')
          .select('id, workspace_id, start_date, workspace:workspaces(startup:startups(name))')
          .in('status', ['active', 'suspended'])
          .not('start_date', 'is', null)

        const staffIds = await getStaffIds(supabase)
        for (const c of contracts || []) {
          const startDate = new Date(c.start_date)
          const todayMonth = today.getMonth()
          const todayDay = today.getDate()
          if (startDate.getMonth() !== todayMonth || startDate.getDate() !== todayDay) continue
          const years = today.getFullYear() - startDate.getFullYear()
          if (years < 1) continue

          const startupName = (c as any).workspace?.startup?.name || 'Startup'
          for (const staffId of staffIds) {
            if (await wasAlreadyRun(supabase, 'contract_anniversary', c.id, staffId, todayStr)) continue
            await notify(supabase, staffId, 'contract_anniversary',
              `🎂 ${startupName} — ${years} ano(s) de contrato`,
              `Hoje faz ${years} ano(s) desde o início do contrato.`,
              `/workspace/${c.workspace_id}?tab=contract`,
              'startup_contract', c.id)
            await recordRun(supabase, 'contract_anniversary', c.id, 'startup_contract', staffId, todayStr, 'both')
            result.notifications++

            const email = await getUserEmail(supabase, staffId)
            if (email) {
              if (await sendEmail(email,
                `[Startup Leiria] ${startupName} — ${years}º aniversário de contrato`,
                `<p>Hoje a <strong>${startupName}</strong> celebra <strong>${years} ano(s)</strong> de contrato no ecossistema.</p><p><a href="${SITE_URL}/workspace/${c.workspace_id}?tab=contract">Ver contrato</a></p>`)) {
                result.emails++
              }
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 3. FOUNDER INATIVO 1 MÊS
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'founder_inactive', notifications: 0, emails: 0, errors: [] }
      try {
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
        // Get active workspaces with founders
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id, startup:startups(name), workspace_users!inner(user_id, role)')
          .eq('status', 'active')
          .eq('workspace_users.role', 'founder')
          .eq('workspace_users.active', true)

        for (const ws of workspaces || []) {
          const founders = (ws as any).workspace_users || []
          for (const wu of founders) {
            // Check last activity
            const { count } = await supabase
              .from('activity_log')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', wu.user_id)
              .gte('created_at', thirtyDaysAgo)
            
            if ((count ?? 0) > 0) continue

            const startupName = (ws as any).startup?.name || 'Startup'
            
            // Notify founder
            if (!(await wasAlreadyRun(supabase, 'founder_inactive', ws.id, wu.user_id, todayStr))) {
              await notify(supabase, wu.user_id, 'founder_inactive',
                `Há mais de 30 dias sem atividade`,
                `Não registámos atividade na ${startupName} há mais de 30 dias. Precisas de ajuda?`,
                `/workspace/${ws.id}`, 'workspace', ws.id)
              await recordRun(supabase, 'founder_inactive', ws.id, 'workspace', wu.user_id, todayStr, 'both')
              result.notifications++

              const email = await getUserEmail(supabase, wu.user_id)
              if (email) {
                if (await sendEmail(email,
                  `[Startup Leiria] Sentimos a tua falta!`,
                  `<p>Olá! Não registámos atividade na <strong>${startupName}</strong> há mais de 30 dias.</p><p>Precisas de ajuda ou tens alguma questão? A equipa de consultores está disponível.</p><p><a href="${SITE_URL}/workspace/${ws.id}">Aceder ao workspace</a></p>`)) {
                  result.emails++
                }
              }
            }

            // Notify assigned consultant
            const { data: consultors } = await supabase
              .from('workspace_users')
              .select('user_id')
              .eq('workspace_id', ws.id)
              .eq('role', 'consultor')
              .eq('active', true)

            for (const c of consultors || []) {
              if (await wasAlreadyRun(supabase, 'founder_inactive_staff', ws.id, c.user_id, todayStr)) continue
              await notify(supabase, c.user_id, 'founder_inactive',
                `${startupName} — Founder inativo há 30+ dias`,
                `O founder não tem atividade registada há mais de 30 dias.`,
                `/workspace/${ws.id}`, 'workspace', ws.id)
              await recordRun(supabase, 'founder_inactive_staff', ws.id, 'workspace', c.user_id, todayStr, 'both')
              result.notifications++

              const email = await getUserEmail(supabase, c.user_id)
              if (email) {
                if (await sendEmail(email,
                  `[Startup Leiria] Founder inativo — ${startupName}`,
                  `<p>O founder da <strong>${startupName}</strong> não tem atividade registada há mais de 30 dias.</p><p><a href="${SITE_URL}/workspace/${ws.id}">Ver workspace</a></p>`)) {
                  result.emails++
                }
              }
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 4. CONTRATO A EXPIRAR (90/60/30 dias)
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'contract_expiring', notifications: 0, emails: 0, errors: [] }
      try {
        const { data: contracts } = await supabase
          .from('startup_contracts')
          .select('id, workspace_id, end_date, workspace:workspaces(startup:startups(name), workspace_users(user_id, role))')
          .in('status', ['active'])
          .not('end_date', 'is', null)
          .gte('end_date', todayStr)

        for (const c of contracts || []) {
          const endDate = new Date(c.end_date)
          const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          if (![90, 60, 30].includes(daysLeft)) continue

          const startupName = (c as any).workspace?.startup?.name || 'Startup'
          const members = (c as any).workspace?.workspace_users || []

          for (const m of members) {
            if (await wasAlreadyRun(supabase, 'contract_expiring', c.id, m.user_id, todayStr)) continue
            await notify(supabase, m.user_id, 'contract_expiring',
              `Contrato ${startupName} expira em ${daysLeft} dias`,
              `O contrato termina a ${c.end_date}.`,
              `/workspace/${c.workspace_id}?tab=contract`,
              'startup_contract', c.id)
            await recordRun(supabase, 'contract_expiring', c.id, 'startup_contract', m.user_id, todayStr, 'both')
            result.notifications++

            const email = await getUserEmail(supabase, m.user_id)
            if (email) {
              if (await sendEmail(email,
                `[Startup Leiria] Contrato ${startupName} expira em ${daysLeft} dias`,
                `<p>O contrato da <strong>${startupName}</strong> expira em <strong>${daysLeft} dias</strong> (${c.end_date}).</p><p><a href="${SITE_URL}/workspace/${c.workspace_id}?tab=contract">Ver contrato</a></p>`)) {
                result.emails++
              }
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 5. CHECK-IN EM FALTA
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'checkin_overdue', notifications: 0, emails: 0, errors: [] }
      try {
        const { data: overdue } = await supabase
          .from('checkin_instances')
          .select('id, workspace_id, due_date, workspace:workspaces(startup:startups(name), workspace_users(user_id, role))')
          .eq('status', 'pending')
          .lt('due_date', todayStr)

        for (const ci of overdue || []) {
          const consultors = ((ci as any).workspace?.workspace_users || []).filter((u: any) => u.role === 'consultor')
          const startupName = (ci as any).workspace?.startup?.name || 'Startup'

          for (const c of consultors) {
            if (await wasAlreadyRun(supabase, 'checkin_overdue', ci.id, c.user_id, todayStr)) continue
            await notify(supabase, c.user_id, 'checkin_overdue',
              `Check-in em falta — ${startupName}`,
              `Check-in com data limite ${ci.due_date} ainda não foi submetido.`,
              `/workspace/${ci.workspace_id}?tab=checkins`,
              'checkin_instance', ci.id)
            await recordRun(supabase, 'checkin_overdue', ci.id, 'checkin_instance', c.user_id, todayStr, 'app')
            result.notifications++
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 6. KPIs 2 MESES SEM DADOS
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'kpi_stale', notifications: 0, emails: 0, errors: [] }
      try {
        const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().split('T')[0]
        
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id, startup:startups(name), workspace_users(user_id, role)')
          .eq('status', 'active')

        for (const ws of workspaces || []) {
          const { count } = await supabase
            .from('kpi_values')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', ws.id)
            .gte('period_month', twoMonthsAgo)

          if ((count ?? 0) > 0) continue

          const startupName = (ws as any).startup?.name || 'Startup'
          const members = ((ws as any).workspace_users || []).filter((u: any) => ['founder', 'consultor'].includes(u.role))

          for (const m of members) {
            if (await wasAlreadyRun(supabase, 'kpi_stale', ws.id, m.user_id, todayStr)) continue
            await notify(supabase, m.user_id, 'kpi_stale',
              `KPIs desatualizados — ${startupName}`,
              `Não há dados de KPIs registados nos últimos 2 meses.`,
              `/workspace/${ws.id}?tab=kpis`,
              'workspace', ws.id)
            await recordRun(supabase, 'kpi_stale', ws.id, 'workspace', m.user_id, todayStr, 'both')
            result.notifications++

            const email = await getUserEmail(supabase, m.user_id)
            if (email) {
              if (await sendEmail(email,
                `[Startup Leiria] KPIs desatualizados — ${startupName}`,
                `<p>A <strong>${startupName}</strong> não tem dados de KPIs registados nos últimos 2 meses.</p><p><a href="${SITE_URL}/workspace/${ws.id}?tab=kpis">Atualizar KPIs</a></p>`)) {
                result.emails++
              }
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 7. LEAD CRM PARADA 14 DIAS
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'crm_lead_stale', notifications: 0, emails: 0, errors: [] }
      try {
        const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
        const { data: leads, error: leadsError } = await supabase
          .from('funnel_items')
          .select('id, organization_name, contact_name, owner_consultant_id, last_activity_at, updated_at')
          .not('stage', 'in', '("contratado","rejeitado","arquivado")')
          .not('owner_consultant_id', 'is', null)
        if (leadsError) throw leadsError

        for (const lead of leads || []) {
          const lastActivity = lead.last_activity_at || lead.updated_at
          if (!lastActivity || new Date(lastActivity) > new Date(fourteenDaysAgo)) continue

          if (await wasAlreadyRun(supabase, 'crm_lead_stale', lead.id, lead.owner_consultant_id, todayStr)) continue
          await notify(supabase, lead.owner_consultant_id, 'crm_lead_stale',
            `Lead parada há 14+ dias — ${lead.organization_name || lead.contact_name || 'Lead'}`,
            `Sem atividade na lead desde ${new Date(lastActivity).toLocaleDateString('pt-PT')}.`,
            `/admin?tab=crm`,
            'funnel_item', lead.id)
          await recordRun(supabase, 'crm_lead_stale', lead.id, 'funnel_item', lead.owner_consultant_id, todayStr, 'app')
          result.notifications++
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 8. MILESTONE ATRASADO
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'milestone_overdue', notifications: 0, emails: 0, errors: [] }
      try {
        const { data: milestones } = await supabase
          .from('milestones')
          .select('id, title, due_date, workspace_id, workspace:workspaces(startup:startups(name), workspace_users(user_id))')
          .not('status', 'eq', 'completed')
          .not('due_date', 'is', null)
          .lt('due_date', todayStr)

        for (const m of milestones || []) {
          const members = (m as any).workspace?.workspace_users || []
          const startupName = (m as any).workspace?.startup?.name || 'Startup'

          for (const member of members) {
            if (await wasAlreadyRun(supabase, 'milestone_overdue', m.id, member.user_id, todayStr)) continue
            await notify(supabase, member.user_id, 'milestone_overdue',
              `Milestone atrasado — ${m.title}`,
              `O milestone "${m.title}" da ${startupName} está atrasado (limite: ${m.due_date}).`,
              `/workspace/${m.workspace_id}?tab=milestones-actions`,
              'milestone', m.id)
            await recordRun(supabase, 'milestone_overdue', m.id, 'milestone', member.user_id, todayStr, 'app')
            result.notifications++
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 9. FOUNDER POR APROVAR 48H
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'pending_approval', notifications: 0, emails: 0, errors: [] }
      try {
        const fortyEightHoursAgo = new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString()
        const { data: pending } = await supabase
          .from('profiles')
          .select('id, full_name, email, created_at')
          .eq('account_status', 'pending')
          .lt('created_at', fortyEightHoursAgo)

        const adminIds = await getAdminIds(supabase)
        for (const p of pending || []) {
          for (const adminId of adminIds) {
            if (await wasAlreadyRun(supabase, 'pending_approval', p.id, adminId, todayStr)) continue
            await notify(supabase, adminId, 'pending_approval',
              `Conta por aprovar há 48h+ — ${p.full_name || p.email}`,
              `O utilizador ${p.full_name || p.email} aguarda aprovação há mais de 48 horas.`,
              `/admin?tab=users`,
              'profile', p.id)
            await recordRun(supabase, 'pending_approval', p.id, 'profile', adminId, todayStr, 'both')
            result.notifications++

            const email = await getUserEmail(supabase, adminId)
            if (email) {
              if (await sendEmail(email,
                `[Startup Leiria] Conta por aprovar — ${p.full_name || p.email}`,
                `<p>O utilizador <strong>${p.full_name || p.email}</strong> aguarda aprovação da conta há mais de 48 horas.</p><p><a href="${SITE_URL}/admin?tab=users">Gerir utilizadores</a></p>`)) {
                result.emails++
              }
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 10. INTAKE INCOMPLETO 7 DIAS
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'intake_stale', notifications: 0, emails: 0, errors: [] }
      try {
        const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: intakes } = await supabase
          .from('contract_intakes')
          .select('id, organization_name, status, created_at, assigned_to, legal_representative_email')
          .in('status', ['pending_documents', 'draft'])
          .lt('created_at', sevenDaysAgo)

        for (const intake of intakes || []) {
          // Notify assigned staff
          if (intake.assigned_to) {
            if (!(await wasAlreadyRun(supabase, 'intake_stale', intake.id, intake.assigned_to, todayStr))) {
              await notify(supabase, intake.assigned_to, 'intake_stale',
                `Intake incompleto há 7+ dias — ${intake.organization_name || 'Sem nome'}`,
                `O processo de intake está pendente há mais de 7 dias.`,
                `/admin?tab=contracts`,
                'contract_intake', intake.id)
              await recordRun(supabase, 'intake_stale', intake.id, 'contract_intake', intake.assigned_to, todayStr, 'both')
              result.notifications++

              const email = await getUserEmail(supabase, intake.assigned_to)
              if (email) {
                if (await sendEmail(email,
                  `[Startup Leiria] Intake incompleto — ${intake.organization_name || 'Processo'}`,
                  `<p>O intake de <strong>${intake.organization_name || 'um processo'}</strong> está pendente há mais de 7 dias.</p><p><a href="${SITE_URL}/admin?tab=contracts">Ver intakes</a></p>`)) {
                  result.emails++
                }
              }
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 11. SESSÃO SEM NOTAS 48H
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'session_no_notes', notifications: 0, emails: 0, errors: [] }
      try {
        const fortyEightHoursAgo = new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString()
        const { data: sessions } = await supabase
          .from('sessions')
          .select('id, title, workspace_id, scheduled_at, created_by, workspace:workspaces(startup:startups(name))')
          .eq('status', 'completed')
          .lt('scheduled_at', fortyEightHoursAgo)
          .is('notes', null)

        for (const s of sessions || []) {
          const consultorId = s.created_by
          if (!consultorId) continue
          if (await wasAlreadyRun(supabase, 'session_no_notes', s.id, consultorId, todayStr)) continue

          const startupName = (s as any).workspace?.startup?.name || 'Startup'
          await notify(supabase, consultorId, 'session_no_notes',
            `Sessão sem notas há 48h — ${startupName}`,
            `A sessão "${s.title}" ainda não tem notas registadas.`,
            `/workspace/${s.workspace_id}?tab=agenda`,
            'session', s.id)
          await recordRun(supabase, 'session_no_notes', s.id, 'session', consultorId, todayStr, 'app')
          result.notifications++
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 12. WORKSPACE SEM CONSULTOR
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'workspace_no_consultant', notifications: 0, emails: 0, errors: [] }
      try {
        const { data: activeWorkspaces } = await supabase
          .from('workspaces')
          .select('id, startup:startups(name), workspace_users(user_id, role)')
          .eq('status', 'active')

        const adminIds = await getAdminIds(supabase)
        for (const ws of activeWorkspaces || []) {
          const hasConsultor = ((ws as any).workspace_users || []).some((u: any) => u.role === 'consultor')
          if (hasConsultor) continue

          const startupName = (ws as any).startup?.name || 'Startup'
          for (const adminId of adminIds) {
            if (await wasAlreadyRun(supabase, 'workspace_no_consultant', ws.id, adminId, todayStr)) continue
            await notify(supabase, adminId, 'workspace_no_consultant',
              `Workspace sem consultor — ${startupName}`,
              `O workspace ativo da ${startupName} não tem consultor atribuído.`,
              `/workspace/${ws.id}`,
              'workspace', ws.id)
            await recordRun(supabase, 'workspace_no_consultant', ws.id, 'workspace', adminId, todayStr, 'app')
            result.notifications++
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // 13. MENTOR SEM DISPONIBILIDADE (semanal — segundas-feiras)
    // ═══════════════════════════════════════════════════════════
    {
      const result: AutomationResult = { type: 'mentor_no_availability', notifications: 0, emails: 0, errors: [] }
      try {
        // Só dispara à segunda-feira (1 = Mon em getDay)
        if (today.getDay() === 1) {
          // Mentores externos
          const { data: mentorRoles } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'mentor_externo')

          const mentorIds: string[] = Array.from(new Set(((mentorRoles as { user_id: string }[] | null) || []).map((r) => r.user_id)))

          for (const mentorId of mentorIds) {
            try {
              // Verificar se tem slots ativos
              const { count: slotCount } = await supabase
                .from('mentor_availability')
                .select('id', { count: 'exact', head: true })
                .eq('mentor_id', mentorId)
                .eq('is_active', true)

              if ((slotCount ?? 0) > 0) continue

              // Dedup semanal: usa run_date como esta segunda
              if (await wasAlreadyRun(supabase, 'mentor_no_availability', null, mentorId, todayStr)) continue

              const { data: profile } = await supabase
                .from('profiles')
                .select('email, full_name')
                .eq('id', mentorId)
                .single()

              if (!profile?.email) continue

              const name = profile.full_name?.split(' ')[0] || 'Mentor'

              // 1. Notificação in-app persistente
              await notify(
                supabase, mentorId, 'mentor_no_availability',
                'Configura a tua disponibilidade',
                'Os fundadores não te conseguem reservar uma sessão enquanto não definires horários disponíveis.',
                '/mentors?tab=availability',
                'mentor', mentorId,
              )
              result.notifications++

              // 2. Email semanal
              const emailHtml = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
                  <h2 style="color: #d97706; margin-bottom: 16px;">Olá ${name},</h2>
                  <p style="font-size: 15px; line-height: 1.6;">
                    Reparámos que ainda não tens <strong>disponibilidade configurada</strong> na plataforma da Startup Leiria.
                  </p>
                  <p style="font-size: 15px; line-height: 1.6;">
                    Sem horários definidos, os fundadores não te conseguem reservar sessões de mentoria — e estamos a perder oportunidades de impacto.
                  </p>
                  <div style="margin: 28px 0; text-align: center;">
                    <a href="${SITE_URL}/mentors?tab=availability"
                       style="background: #1e40af; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                      Configurar disponibilidade
                    </a>
                  </div>
                  <p style="font-size: 13px; color: #6b7280; line-height: 1.5;">
                    Demora menos de 2 minutos. Define os teus dias e horários típicos — podes alterar a qualquer momento.
                  </p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                  <p style="font-size: 12px; color: #9ca3af;">
                    Receberás este lembrete semanalmente até configurares pelo menos um horário.<br/>
                    Equipa Startup Leiria
                  </p>
                </div>
              `
              const sent = await sendEmail(
                profile.email,
                'Configura a tua disponibilidade — Startup Leiria',
                emailHtml,
              )
              if (sent) result.emails++

              await recordRun(supabase, 'mentor_no_availability', null, 'mentor', mentorId, todayStr, sent ? 'email+app' : 'app')
            } catch (e: any) {
              result.errors.push(`mentor ${mentorId}: ${e.message}`)
            }
          }
        }
      } catch (e: any) { result.errors.push(e.message) }
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════
    // Cleanup old automation_runs (> 90 days)
    // ═══════════════════════════════════════════════════════════
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await supabase.from('automation_runs').delete().lt('run_date', ninetyDaysAgo)

    const totalNotifications = results.reduce((s, r) => s + r.notifications, 0)
    const totalEmails = results.reduce((s, r) => s + r.emails, 0)
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0)

    console.log(`[automation-engine] Completed: ${totalNotifications} notifications, ${totalEmails} emails, ${totalErrors} errors`)

    await logRun(totalErrors > 0 ? 'partial' : 'ok', {
      notifications: totalNotifications,
      emails: totalEmails,
      errors: totalErrors,
      checks: results.length,
    }, totalErrors > 0 ? `${totalErrors} check errors` : undefined)

    return new Response(JSON.stringify({
      success: true,
      summary: { notifications: totalNotifications, emails: totalEmails, errors: totalErrors },
      details: results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('[automation-engine] Fatal error:', err)
    await logRun('failed', { stage: 'fatal' }, err?.message ?? 'unknown')
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
