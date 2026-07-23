/**
 * Edge Function: send-intake-email
 * Sends contract intake emails via Resend:
 * - type=intake_request: initial email to lead with intake link
 * - type=changes_requested: email with correction notes + return link
 * - type=signature_reminder: reminder for pending signature
 * - type=intake_reminder: reminder for pending intake submission
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4.0.0'
import { requireCronOrStaff } from '../_shared/security.ts'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function escapeHtml(text: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return text.replace(/[&<>"']/g, c => entities[c] || c)
}

interface EmailRequest {
  type: 'intake_request' | 'changes_requested' | 'intake_reminder' | 'signature_reminder'
  intakeId?: string
  recipientEmail: string
  recipientName?: string
  organizationName?: string
  intakeToken?: string
  changesNotes?: string
  senderName?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // SECURITY: Fail-closed — timing-safe x-cron-secret OR staff JWT.
    const supabaseUserClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const authCheck = await requireCronOrStaff(req, supabaseUserClient, supabase)
    if ('error' in authCheck) {
      console.error('[send-intake-email] Unauthorized invocation')
      return authCheck.error
    }


    const body: EmailRequest = await req.json()
    const { type, recipientEmail, recipientName, organizationName, intakeToken, changesNotes, senderName } = body

    if (!recipientEmail || !type) {
      return new Response(JSON.stringify({ error: 'recipientEmail and type required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const appUrl = Deno.env.get("PUBLIC_APP_URL") || 'https://fb.startupleiria.com'
    const intakeUrl = intakeToken ? `${appUrl}/contract-intake/${intakeToken}` : ''
    const safeName = escapeHtml(recipientName || '')
    const safeOrg = escapeHtml(organizationName || '')
    const safeSender = escapeHtml(senderName || 'Startup Leiria')
    const safeNotes = escapeHtml(changesNotes || '')

    let subject = ''
    let html = ''

    // Enrich intake_request with commercial proposal from funnel_items.metadata_json
    let proposalHtml = ''
    if (type === 'intake_request' && body.intakeId) {
      try {
        const { data: ik } = await supabase
          .from('contract_intakes')
          .select('funnel_item_id')
          .eq('id', body.intakeId)
          .maybeSingle()
        if (ik?.funnel_item_id) {
          const { data: fi } = await supabase
            .from('funnel_items')
            .select('metadata_json, deal_value, deal_currency')
            .eq('id', ik.funnel_item_id)
            .maybeSingle()
          const md = (fi?.metadata_json && typeof fi.metadata_json === 'object' && !Array.isArray(fi.metadata_json))
            ? fi.metadata_json as Record<string, any> : {}
          let typeName: string | null = null
          if (typeof md.proposed_incubation_type_id === 'string' && md.proposed_incubation_type_id) {
            const { data: itype } = await supabase.from('incubation_types').select('name').eq('id', md.proposed_incubation_type_id).maybeSingle()
            typeName = itype?.name ?? null
          }
          const currency = fi?.deal_currency || 'EUR'
          const fmt = (v: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(v)
          const rows: string[] = []
          if (typeName) rows.push(`<tr><td style="padding:6px 10px;color:#666">Tipo de incubação</td><td style="padding:6px 10px;font-weight:600">${escapeHtml(typeName)}</td></tr>`)
          if (md.proposed_fee != null) rows.push(`<tr><td style="padding:6px 10px;color:#666">Mensalidade proposta</td><td style="padding:6px 10px;font-weight:600">${escapeHtml(fmt(Number(md.proposed_fee)))}</td></tr>`)
          if (md.proposed_discount != null) rows.push(`<tr><td style="padding:6px 10px;color:#666">Desconto potencial</td><td style="padding:6px 10px;font-weight:600">${Number(md.proposed_discount)}%</td></tr>`)
          if (md.proposed_fee == null && fi?.deal_value != null) rows.push(`<tr><td style="padding:6px 10px;color:#666">Valor estimado</td><td style="padding:6px 10px;font-weight:600">${escapeHtml(fmt(Number(fi.deal_value)))}</td></tr>`)
          if (typeof md.commercial_notes === 'string' && md.commercial_notes.trim()) rows.push(`<tr><td colspan="2" style="padding:8px 10px;color:#444;background:#fafafa;font-size:13px">${escapeHtml(md.commercial_notes).replace(/\n/g, '<br/>')}</td></tr>`)
          if (rows.length > 0) {
            proposalHtml = `
              <div style="margin:18px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
                <div style="background:#1a1a2e;color:#fff;padding:10px 14px;font-weight:600;font-size:14px">Proposta Comercial</div>
                <table style="width:100%;border-collapse:collapse;font-size:14px">${rows.join('')}</table>
                <div style="padding:10px 14px;background:#f9fafb;font-size:12px;color:#555">
                  Documentos padrão para análise:
                  <a href="${appUrl}/templates/V11_Anexo_I_Regulamento_SUP_LRA_2026_2.pdf" style="color:#1a1a2e;margin-left:6px">Regulamento (PDF)</a> ·
                  <a href="${appUrl}/templates/V9_Minuta_Contrato_IF_e_IV_2026.docx" style="color:#1a1a2e">Minuta de Contrato</a>
                </div>
              </div>`
          }
        }
      } catch (e) {
        console.warn('[send-intake-email] proposal enrichment failed', e)
      }
    }

    if (type === 'intake_request') {
      subject = `${safeOrg ? safeOrg + ' — ' : ''}Pedido de Contratação — Startup Leiria`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1a1a2e">Pedido de Contratação</h2>
          <p>Olá${safeName ? ' ' + safeName : ''},</p>
          <p>A equipa <strong>Startup Leiria</strong> iniciou o processo de contratação${safeOrg ? ' para <strong>' + safeOrg + '</strong>' : ''}.</p>
          ${proposalHtml}
          <p>Para avançar, pedimos que preencha o formulário com os dados da empresa. No próprio formulário poderá consultar o regulamento e a minuta de contrato standard antes de submeter:</p>
          <p style="text-align:center;margin:25px 0">
            <a href="${intakeUrl}" style="background:#1a1a2e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
              Preencher Dados e Rever Proposta
            </a>
          </p>
          <p style="font-size:13px;color:#666">Este link é válido por 30 dias. Após o preenchimento, a nossa equipa irá validar os dados antes de enviar o contrato para assinatura.</p>
          <p style="font-size:13px;color:#666">Se não reconhece este pedido, pode ignorar este email.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:25px 0"/>
          <p style="font-size:12px;color:#999">Startup Leiria — Ecossistema de Inovação</p>
        </div>
      `
    } else if (type === 'changes_requested') {
      subject = `Correções Necessárias — Processo de Contratação — Startup Leiria`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1a1a2e">Correções Necessárias</h2>
          <p>Olá${safeName ? ' ' + safeName : ''},</p>
          <p>Após a revisão dos dados submetidos${safeOrg ? ' para <strong>' + safeOrg + '</strong>' : ''}, a nossa equipa identificou alguns pontos que necessitam de correção:</p>
          ${safeNotes ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:15px 0;border-radius:4px"><p style="margin:0;font-size:14px;color:#92400e">${safeNotes.replace(/\n/g, '<br/>')}</p></div>` : ''}
          <p>Por favor, aceda ao formulário para efetuar as correções:</p>
          <p style="text-align:center;margin:25px 0">
            <a href="${intakeUrl}" style="background:#1a1a2e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
              Corrigir Dados
            </a>
          </p>
          <p style="font-size:13px;color:#666">Após submeter as correções, a equipa irá rever novamente os dados.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:25px 0"/>
          <p style="font-size:12px;color:#999">Startup Leiria — Ecossistema de Inovação</p>
        </div>
      `
    } else if (type === 'intake_reminder') {
      subject = `Lembrete — Dados de Contratação Pendentes — Startup Leiria`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1a1a2e">Lembrete de Preenchimento</h2>
          <p>Olá${safeName ? ' ' + safeName : ''},</p>
          <p>Relembramos que os dados de contratação${safeOrg ? ' para <strong>' + safeOrg + '</strong>' : ''} ainda estão pendentes de preenchimento.</p>
          <p>Para avançar com o processo, preencha o formulário:</p>
          <p style="text-align:center;margin:25px 0">
            <a href="${intakeUrl}" style="background:#1a1a2e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
              Preencher Dados
            </a>
          </p>
          <p style="font-size:13px;color:#666">Se já submeteu os dados, pode ignorar esta mensagem.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:25px 0"/>
          <p style="font-size:12px;color:#999">Startup Leiria — Ecossistema de Inovação</p>
        </div>
      `
    } else if (type === 'signature_reminder') {
      subject = `Lembrete — Assinatura de Contrato Pendente — Startup Leiria`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1a1a2e">Assinatura Pendente</h2>
          <p>Olá${safeName ? ' ' + safeName : ''},</p>
          <p>O contrato${safeOrg ? ' para <strong>' + safeOrg + '</strong>' : ''} foi enviado para assinatura e aguarda a sua ação.</p>
          <p>Por favor, verifique o seu email para o link de assinatura do fornecedor (DocuSign / PandaDoc) ou contacte a nossa equipa se necessitar de ajuda.</p>
          <p style="font-size:13px;color:#666">Se já assinou, pode ignorar esta mensagem.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:25px 0"/>
          <p style="font-size:12px;color:#999">Startup Leiria — Ecossistema de Inovação</p>
        </div>
      `
    } else {
      return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: emailResult, error: emailErr } = await resend.emails.send({
      from: 'Startup Leiria <noreply@startupleiria.com>',
      to: recipientEmail,
      subject,
      html,
    })

    if (emailErr) {
      console.error('Resend error:', emailErr)
      return new Response(JSON.stringify({ error: 'Failed to send email', details: emailErr }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log to email_log if intake context available (non-blocking)
    if (body.intakeId) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey)
        await supabase.from('email_log').insert({
          email_type: `intake_${type}`,
          subject,
          recipients: JSON.stringify([recipientEmail]),
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_by: null,
        })
      } catch (logErr) {
        console.warn('email_log insert failed (non-blocking):', logErr)
      }
    }

    return new Response(JSON.stringify({ success: true, messageId: emailResult?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-intake-email error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
