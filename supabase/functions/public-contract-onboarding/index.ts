/**
 * Public Contract Onboarding Edge Function
 * Handles all operations for the public contract signing flow:
 * - GET: Fetch contract by onboarding token
 * - POST action=save_data: Save company data
 * - POST action=submit_signing: Generate PDF + dispatch to the contract's signature provider
 * - POST action=generate_token: (staff only) Generate onboarding token
 *
 * Provider-agnostic: dispatches to docusign, pandadoc, or manual based on
 * the contract's `signature_provider` field. Never assumes a default provider.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncIntakeOnSent, syncIntakeOnCompleted } from '../_shared/lifecycleSync.ts'
import { handleLifecycleSyncResult } from '../_shared/lifecycleSyncResultHandler.ts'
import { autoCreateFounderAccount, enqueueFounderInviteTask } from '../_shared/founderAccount.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

// Basic server-side validators for the public intake form
const PT_NIF_REGEX = /^\d{9}$/
const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const POSTAL_PT_REGEX = /^\d{4}-\d{3}$/

function validateIntakeForm(fd: any): { ok: true } | { ok: false; error: string } {
  const optStr = (v: unknown, max: number) =>
    v === undefined || v === null || (typeof v === 'string' && v.length <= max)
  const reqStr = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= max

  if (fd.organization_name !== undefined && !optStr(fd.organization_name, 255))
    return { ok: false, error: 'organization_name invalid' }
  if (fd.company_nif !== undefined && fd.company_nif !== null && fd.company_nif !== '') {
    if (typeof fd.company_nif !== 'string' || !PT_NIF_REGEX.test(fd.company_nif.replace(/\s|-/g, '')))
      return { ok: false, error: 'NIF must be 9 digits' }
  }
  if (fd.iban !== undefined && fd.iban !== null && fd.iban !== '') {
    const cleaned = String(fd.iban).replace(/\s/g, '').toUpperCase()
    if (!IBAN_REGEX.test(cleaned)) return { ok: false, error: 'IBAN format invalid' }
  }
  if (fd.company_postal_code !== undefined && fd.company_postal_code !== null && fd.company_postal_code !== '') {
    if (!POSTAL_PT_REGEX.test(String(fd.company_postal_code)))
      return { ok: false, error: 'postal_code must be NNNN-NNN' }
  }
  for (const f of ['legal_representative_email', 'billing_email']) {
    const v = fd[f]
    if (v !== undefined && v !== null && v !== '' && (typeof v !== 'string' || !EMAIL_REGEX.test(v) || v.length > 255))
      return { ok: false, error: `${f} invalid` }
  }
  if (!optStr(fd.company_address, 500)) return { ok: false, error: 'company_address too long' }
  if (!optStr(fd.company_city, 120)) return { ok: false, error: 'company_city too long' }
  if (!optStr(fd.legal_representative_name, 200)) return { ok: false, error: 'legal_representative_name too long' }
  if (fd.legal_representative_phone !== undefined && fd.legal_representative_phone !== null && fd.legal_representative_phone !== '') {
    const p = String(fd.legal_representative_phone)
    if (p.length > 32 || !/^[+\d\s().-]{6,32}$/.test(p)) return { ok: false, error: 'phone invalid' }
  }
  if (!optStr(fd.startup_description, 5000)) return { ok: false, error: 'description too long' }
  if (!optStr(fd.website, 500)) return { ok: false, error: 'website too long' }
  if (!optStr(fd.project_name, 200)) return { ok: false, error: 'project_name too long (max 200)' }
  return { ok: true }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await req.json()
    const { action, token, contractId } = body

    // === Staff-authenticated actions ===
    if (action === 'generate_token' || action === 'staff_submit_signing') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const jwt = authHeader.replace('Bearer ', '')
      const { data: claims, error: claimsErr } = await supabase.auth.getUser(jwt)
      if (claimsErr || !claims.user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check staff role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', claims.user.id)
        .in('role', ['admin', 'consultor', 'backoffice'])
      
      if (!roles?.length) {
        return new Response(JSON.stringify({ error: 'Staff only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // === Staff: Send to Signature (from approved_for_signature) ===
      if (action === 'staff_submit_signing') {
        if (!contractId) {
          return new Response(JSON.stringify({ error: 'contractId required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Fetch contract
        const { data: contract, error: cErr } = await supabase
          .from('startup_contracts')
          .select(`
            id, contract_number, status, monthly_fee, currency, start_date, end_date,
            square_meters, signature_status, signature_provider, legal_representative_name,
            legal_representative_email, company_nif, company_address,
            company_city, company_postal_code,
            workspace:workspaces(id, startup:startups(id, name))
          `)
          .eq('id', contractId)
          .single()

        if (cErr || !contract) {
          return new Response(JSON.stringify({ error: 'Contract not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Use provider from body or from contract record
        const provider: string | null = body.signatureProvider || (contract as any).signature_provider || null

        if (!provider || !['docusign', 'pandadoc', 'manual', 'assinatura_digital', 'pandadoc_manual'].includes(provider)) {
          return new Response(JSON.stringify({
            error: 'signature_provider_not_configured',
            message: 'Selecione um provider de assinatura antes de enviar.',
          }), {
            status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const signerEmail = body.signerEmail || (contract as any).legal_representative_email
        const signerName = body.signerName || (contract as any).legal_representative_name

        if (!signerEmail || !signerName) {
          return new Response(JSON.stringify({ error: 'Dados do signatário em falta (nome e email)' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Update contract with provider and sent status (canonical: status + signature_status)
        await supabase
          .from('startup_contracts')
          .update({
            status: 'pending_signature',
            signature_provider: provider,
            signature_status: 'sent_for_signature',
            signature_requested_at: new Date().toISOString(),
          })
          .eq('id', contractId)

        // === CANONICAL SYNC (shared helper) ===
        const sentSyncStaff = await syncIntakeOnSent(supabase, contractId, claims.user.id, `staff_submit_signing_${provider}`)
        await handleLifecycleSyncResult(supabase, sentSyncStaff, {
          contractId, workspaceId: (contract as any).workspace?.id ?? null,
          source: `staff_submit_signing_${provider}`, operation: 'sent',
        })

        let signingResult: any = { status: 'pending_manual', provider }

        try {
          // Generate PDF
          let documentBase64 = ''
          const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-contract-pdf`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contractId }),
          })
          if (pdfRes.ok) {
            const pdfData = await pdfRes.json()
            documentBase64 = pdfData.documentBase64 || ''
          }

          // Provider dispatch
          if (provider === 'docusign') {
            const dsRes = await fetch(`${supabaseUrl}/functions/v1/docusign-send-envelope`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ contractId, signerEmail, signerName, companyNif: (contract as any).company_nif, documentBase64 }),
            })
            if (dsRes.ok) { signingResult = await dsRes.json(); signingResult.provider = 'docusign' }
            else {
              const errText = await dsRes.text(); console.warn('DocuSign failed:', errText)
              await supabase.from('startup_contracts').update({
                signature_status: 'failed',
                provider_last_error: `docusign_send: ${errText.slice(0, 500)}`,
                provider_last_sync_at: new Date().toISOString(),
              }).eq('id', contractId)
              signingResult = { status: 'failed', provider: 'docusign', message: 'DocuSign indisponível — staff notificado.' }
            }

          } else if (provider === 'pandadoc') {
            const pdRes = await fetch(`${supabaseUrl}/functions/v1/pandadoc-send-document`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ contractId, signerEmail, signerName, companyNif: (contract as any).company_nif, documentBase64 }),
            })
            if (pdRes.ok) { signingResult = await pdRes.json(); signingResult.provider = 'pandadoc' }
            else {
              const errText = await pdRes.text(); console.warn('PandaDoc failed:', errText)
              await supabase.from('startup_contracts').update({
                signature_status: 'failed',
                provider_last_error: `pandadoc_send: ${errText.slice(0, 500)}`,
                provider_last_sync_at: new Date().toISOString(),
              }).eq('id', contractId)
              signingResult = { status: 'failed', provider: 'pandadoc', message: 'PandaDoc indisponível — staff notificado.' }
            }

          } else if (provider === 'manual') {
            await supabase.from('startup_contracts').update({ signature_status: 'pending_manual' }).eq('id', contractId)
            signingResult = { status: 'pending_manual', provider: 'manual', message: 'Assinatura manual. O staff coordenará o processo.' }
          }

          // Notify staff if manual fallback
          if (signingResult.status === 'pending_manual') {
            const { data: staffUsers } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'consultor', 'backoffice'])
            if (staffUsers?.length) {
              const startupName = (contract as any).workspace?.startup?.name || 'Startup'
              await supabase.from('notifications').insert(
                staffUsers.map((s: any) => ({
                  user_id: s.user_id, type: 'contract_signing',
                  title: `Contrato pendente: ${startupName}`,
                  message: `Assinatura pendente via ${provider}. Ação manual necessária.`,
                  entity_type: 'contract', entity_id: contractId,
                  link: '/admin?tab=backoffice&subtab=contracts',
                }))
              )
            }
          }
        } catch (err) {
          console.error('Signing flow error:', err)
          signingResult = { status: 'pending_manual', provider, message: String(err) }
        }

        return new Response(JSON.stringify(signingResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // === Generate onboarding token ===
      if (!contractId) {
        return new Response(JSON.stringify({ error: 'contractId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify the contract exists before generating a token; otherwise the
      // update returns no rows and we hand out a link that will 404.
      const { data: existing, error: existingErr } = await supabase
        .from('startup_contracts')
        .select('id, status, contract_number, organization_name, legal_representative_email, legal_representative_name, workspace:workspaces(startup:startups(name))')
        .eq('id', contractId)
        .maybeSingle()

      if (existingErr) throw existingErr
      if (!existing) {
        return new Response(JSON.stringify({
          error: 'contract_not_found',
          message: 'Contrato não encontrado. Foi arquivado ou eliminado — crie um novo contrato antes de enviar.',
        }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const onboardingToken = generateToken()
      const onboardingTokenHashStore = await sha256Hex(onboardingToken)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

      const { error: updateErr } = await supabase
        .from('startup_contracts')
        .update({
          onboarding_token_hash: onboardingTokenHashStore,
          onboarding_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', contractId)

      if (updateErr) throw updateErr

      const publicUrl = `${req.headers.get('origin') || Deno.env.get("PUBLIC_APP_URL") || 'https://fb.startupleiria.com'}/contract-signing/${onboardingToken}`

      // === Email the public signing link to the founder (best-effort) ===
      let emailSent = false
      let emailError: string | null = null
      const recipientEmail = (existing as any).legal_representative_email as string | null
      const recipientName = (existing as any).legal_representative_name as string | null
      const orgName = (existing as any).organization_name
        || (existing as any).workspace?.startup?.name
        || ''
      const contractNumber = (existing as any).contract_number || ''

      if (recipientEmail) {
        try {
          const resendKey = Deno.env.get('RESEND_API_KEY')
          if (!resendKey) throw new Error('RESEND_API_KEY not configured')

          const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c] || c)
          const safeName = esc(recipientName || '')
          const safeOrg = esc(orgName)
          const safeContract = esc(contractNumber)
          const subject = `${safeOrg ? safeOrg + ' — ' : ''}Contrato pronto para assinatura — Startup Leiria`
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
              <h2 style="color:#111;margin-bottom:8px">Contrato pronto para assinatura</h2>
              ${safeName ? `<p>Olá ${safeName},</p>` : '<p>Olá,</p>'}
              <p>${safeOrg ? `A ${safeOrg} tem` : 'Tem'} um contrato de incubação${safeContract ? ` (<strong>${safeContract}</strong>)` : ''} pronto para revisão e assinatura digital.</p>
              <p style="margin:24px 0">
                <a href="${publicUrl}" style="background:#84cc16;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
                  Abrir contrato
                </a>
              </p>
              <p style="font-size:12px;color:#666">Se o botão não funcionar, copie e cole este link no seu browser:<br/>
              <a href="${publicUrl}" style="color:#0369a1;word-break:break-all">${publicUrl}</a></p>
              <p style="font-size:12px;color:#666">O link é pessoal e expira em 30 dias.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="font-size:12px;color:#888">Startup Leiria</p>
            </div>
          `

          const emailResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Startup Leiria <no-reply@startupleiria.com>',
              to: [recipientEmail],
              subject,
              html,
            }),
          })
          if (!emailResp.ok) {
            const errBody = await emailResp.text()
            throw new Error(`Resend ${emailResp.status}: ${errBody}`)
          }
          emailSent = true
        } catch (err) {
          console.warn('[generate_token] Failed to send signing-link email:', err)
          emailError = String((err as any)?.message || err)
        }
      }

      return new Response(JSON.stringify({
        token: onboardingToken,
        url: publicUrl,
        expiresAt: expiresAt.toISOString(),
        emailSent,
        emailRecipient: recipientEmail || null,
        emailError,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }


    // === INTAKE: Load by token (public, no auth) ===
    if (action === 'intake_load_by_token') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const tokenHashLoad = await sha256Hex(token)
      const { data: intake, error: iErr } = await supabase
        .from('contract_intakes')
        .select('id, funnel_item_id, status, organization_name, company_nif, company_address, company_city, company_postal_code, iban, legal_representative_name, legal_representative_email, legal_representative_phone, billing_email, startup_description, website, documents_json, missing_documents, changes_requested_notes, intake_token_expires_at, submitted_at, project_name, certidao_permanente_code, additional_representatives')
        .eq('intake_token_hash', tokenHashLoad)
        .maybeSingle()

      if (iErr || !intake) {
        return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (intake.intake_token_expires_at && new Date(intake.intake_token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This link has expired' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Build a lightweight commercial proposal snapshot from the linked funnel
      // item metadata so the founder can review price / incubation type /
      // discount + standard regulation & contract before submitting data.
      let commercial_proposal: Record<string, unknown> | null = null
      if (intake.funnel_item_id) {
        try {
          const { data: funnelItem } = await supabase
            .from('funnel_items')
            .select('metadata_json, deal_value, deal_currency')
            .eq('id', intake.funnel_item_id)
            .maybeSingle()
          const md = (funnelItem?.metadata_json && typeof funnelItem.metadata_json === 'object' && !Array.isArray(funnelItem.metadata_json))
            ? funnelItem.metadata_json as Record<string, any>
            : {}
          let incubationTypeName: string | null = null
          if (typeof md.proposed_incubation_type_id === 'string' && md.proposed_incubation_type_id) {
            const { data: itype } = await supabase
              .from('incubation_types')
              .select('name')
              .eq('id', md.proposed_incubation_type_id)
              .maybeSingle()
            incubationTypeName = itype?.name ?? null
          }
          const hasAny = md.proposed_fee != null || md.proposed_discount != null || incubationTypeName || md.commercial_notes || funnelItem?.deal_value != null
          if (hasAny) {
            commercial_proposal = {
              proposed_fee: md.proposed_fee ?? null,
              proposed_discount: md.proposed_discount ?? null,
              proposed_incubation_type_id: md.proposed_incubation_type_id ?? null,
              proposed_incubation_type_name: incubationTypeName,
              commercial_notes: typeof md.commercial_notes === 'string' ? md.commercial_notes : null,
              deal_value: funnelItem?.deal_value ?? null,
              deal_currency: funnelItem?.deal_currency ?? 'EUR',
            }
          }
        } catch (e) {
          console.warn('[intake_load_by_token] proposal enrichment failed', e)
        }
      }

      return new Response(JSON.stringify({ intake: { ...intake, commercial_proposal } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === INTAKE: Save draft by token (public, no auth) ===
    // Debounced autosave endpoint. Persists partial form data server-side so
    // draft work survives device switches / cache clears (localStorage alone
    // can't). Does NOT change status or submitted_at. Editable states only.
    if (action === 'intake_save_draft') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { formData: fd } = body
      if (!fd || typeof fd !== 'object') {
        return new Response(JSON.stringify({ error: 'formData required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const tokenHashDraft = await sha256Hex(token)
      const { data: intakeDraft, error: dErr } = await supabase
        .from('contract_intakes')
        .select('id, status, intake_token_expires_at')
        .eq('intake_token_hash', tokenHashDraft)
        .maybeSingle()

      if (dErr || !intakeDraft) {
        return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (intakeDraft.intake_token_expires_at && new Date(intakeDraft.intake_token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This link has expired' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const editableForDraft = ['intake_requested', 'intake_in_progress', 'changes_requested']
      if (!editableForDraft.includes(intakeDraft.status)) {
        // Not an error — client keeps localStorage. Silently ack so autosave
        // status doesn't oscillate for already-submitted intakes.
        return new Response(JSON.stringify({ success: true, ignored: 'not_editable' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Lenient validation: draft may be partial. Only reject clearly-bad
      // sensitive fields (NIF, IBAN, postal, emails, phone). Non-provided
      // fields pass through to the whitelist filter below.
      const draftValidation = validateIntakeForm(fd)
      if (!draftValidation.ok) {
        return new Response(JSON.stringify({ error: draftValidation.error }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Whitelist — never let the client push arbitrary columns (status,
      // submitted_at, intake_token_hash, contract_id, etc.).
      const patch: Record<string, unknown> = {}
      const put = (col: string, val: unknown) => { if (val !== undefined) patch[col] = val }
      put('organization_name', fd.organization_name)
      put('project_name', typeof fd.project_name === 'string' ? fd.project_name.trim().slice(0, 200) : fd.project_name)
      put('company_nif', typeof fd.company_nif === 'string' && fd.company_nif ? fd.company_nif.replace(/\s|-/g, '') : fd.company_nif)
      put('company_address', fd.company_address)
      put('company_city', fd.company_city)
      put('company_postal_code', fd.company_postal_code)
      put('iban', typeof fd.iban === 'string' && fd.iban ? fd.iban.replace(/\s/g, '').toUpperCase() : fd.iban)
      put('certidao_permanente_code', fd.certidao_permanente_code)
      put('legal_representative_name', fd.legal_representative_name)
      put('legal_representative_email', fd.legal_representative_email)
      put('legal_representative_phone', fd.legal_representative_phone)
      if (Array.isArray(fd.additional_representatives)) patch.additional_representatives = fd.additional_representatives
      put('billing_email', fd.billing_email)
      put('startup_description', fd.startup_description)
      put('website', fd.website)

      // First save transitions requested → in_progress so staff sees activity.
      if (intakeDraft.status === 'intake_requested') {
        patch.status = 'intake_in_progress'
      }

      if (Object.keys(patch).length === 0) {
        return new Response(JSON.stringify({ success: true, ignored: 'empty_patch' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: dUpdErr } = await supabase
        .from('contract_intakes')
        .update(patch)
        .eq('id', intakeDraft.id)

      if (dUpdErr) {
        return new Response(JSON.stringify({ error: 'Save failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === INTAKE: Submit by token (public, no auth) ===
    if (action === 'intake_submit_by_token') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { formData: fd } = body
      if (!fd) {
        return new Response(JSON.stringify({ error: 'formData required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify token
      const tokenHash = await sha256Hex(token)
      const { data: intake, error: iErr } = await supabase
        .from('contract_intakes')
        .select('id, status, intake_token_expires_at')
        .eq('intake_token_hash', tokenHash)
        .maybeSingle()

      if (iErr || !intake) {
        return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (intake.intake_token_expires_at && new Date(intake.intake_token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This link has expired' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Only allow submission from editable states
      const editableStates = ['intake_requested', 'intake_in_progress', 'changes_requested']
      if (!editableStates.includes(intake.status)) {
        return new Response(JSON.stringify({ error: 'Form already submitted' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Server-side validation for sensitive financial fields
      const validation = validateIntakeForm(fd)
      if (!validation.ok) {
        return new Response(JSON.stringify({ error: validation.error }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Update intake with form data (explicit visible→persisted field map).
      const { error: updateErr } = await supabase
        .from('contract_intakes')
        .update({
          organization_name: fd.organization_name,
          project_name: fd.project_name ? String(fd.project_name).trim().slice(0, 200) : null,
          company_nif: fd.company_nif ? String(fd.company_nif).replace(/\s|-/g, '') : null,
          company_address: fd.company_address,
          company_city: fd.company_city,
          company_postal_code: fd.company_postal_code,
          iban: fd.iban ? String(fd.iban).replace(/\s/g, '').toUpperCase() : null,
          certidao_permanente_code: fd.certidao_permanente_code ?? null,
          legal_representative_name: fd.legal_representative_name,
          legal_representative_email: fd.legal_representative_email,
          legal_representative_phone: fd.legal_representative_phone,
          additional_representatives: Array.isArray(fd.additional_representatives) ? fd.additional_representatives : [],
          billing_email: fd.billing_email,
          startup_description: fd.startup_description,
          website: fd.website,
          missing_documents: fd.missing_documents || [],
          status: 'intake_submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', intake.id)

      if (updateErr) throw updateErr

      // Audit event
      await supabase.from('intake_events').insert({
        intake_id: intake.id,
        event_type: 'customer_submitted',
        from_status: intake.status,
        to_status: 'intake_submitted',
        metadata: { missing_documents: fd.missing_documents || [], channel: 'public_form' },
      })

      // Notify staff — especially when this is a resubmission after "Correções Pedidas".
      try {
        const isResubmission = intake.status === 'changes_requested'
        const { data: intakeMeta } = await supabase
          .from('contract_intakes')
          .select('reviewed_by, assigned_to, created_by, funnel_item_id, organization_name')
          .eq('id', intake.id)
          .maybeSingle()

        const recipientIds = new Set<string>()
        if (intakeMeta?.reviewed_by) recipientIds.add(intakeMeta.reviewed_by)
        if (intakeMeta?.assigned_to) recipientIds.add(intakeMeta.assigned_to)
        if (intakeMeta?.created_by) recipientIds.add(intakeMeta.created_by)

        // Fallback: notify all admin/backoffice staff when we have no specific recipient.
        if (recipientIds.size === 0) {
          const { data: staffUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('role', ['admin', 'backoffice'])
          staffUsers?.forEach((s: any) => recipientIds.add(s.user_id))
        }

        if (recipientIds.size > 0) {
          const orgName = intakeMeta?.organization_name || intake.organization_name || 'Lead'
          const title = isResubmission
            ? `Correções submetidas: ${orgName}`
            : `Novo intake submetido: ${orgName}`
          const message = isResubmission
            ? `O founder respondeu ao pedido de correções. Revê o intake atualizado.`
            : `O founder submeteu o intake para revisão.`
          const link = intakeMeta?.funnel_item_id
            ? `/crm?open=${intakeMeta.funnel_item_id}`
            : '/admin?tab=backoffice&subtab=contracts'

          await supabase.from('notifications').insert(
            Array.from(recipientIds).map((uid) => ({
              user_id: uid,
              type: 'intake_resubmitted',
              title,
              message,
              entity_type: 'contract_intake',
              entity_id: intake.id,
              link,
            })),
          )
        }
      } catch (notifyErr) {
        console.error('Intake resubmission notification failed (non-fatal):', notifyErr)
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === INTAKE: Upload document by intake token (public, no auth) ===
    if (action === 'intake_upload_document') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { docKey, fileName, fileBase64, fileExt } = body
      if (!docKey || !fileBase64) {
        return new Response(JSON.stringify({ error: 'docKey and fileBase64 required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const SAFE_KEY_REGEX = /^[a-zA-Z0-9_-]{1,100}$/
      if (!SAFE_KEY_REGEX.test(docKey)) {
        return new Response(JSON.stringify({ error: 'Invalid document key' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const ALLOWED_EXTS: Record<string, string> = {
        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      }
      const ext = (fileExt || 'pdf').toString().toLowerCase()
      if (!ALLOWED_EXTS[ext]) {
        return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const safeContentType = ALLOWED_EXTS[ext]
      const MAX_BYTES = 10 * 1024 * 1024
      if (typeof fileBase64 !== 'string' || fileBase64.length > MAX_BYTES * 1.4) {
        return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), {
          status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const intakeTokenHash = await sha256Hex(token)
      const { data: intakeRow, error: intakeErr } = await supabase
        .from('contract_intakes')
        .select('id, status, intake_token_expires_at, documents_json')
        .eq('intake_token_hash', intakeTokenHash)
        .maybeSingle()
      if (intakeErr || !intakeRow) {
        return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (intakeRow.intake_token_expires_at && new Date(intakeRow.intake_token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This link has expired' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const binaryStr = atob(fileBase64)
      if (binaryStr.length > MAX_BYTES) {
        return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), {
          status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

      const path = `intake/${intakeRow.id}/${docKey}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('contract-documents')
        .upload(path, bytes, { upsert: true, contentType: safeContentType })
      if (uploadErr) {
        console.error('intake_upload_document storage error:', uploadErr)
        return new Response(JSON.stringify({ error: uploadErr.message || 'Upload failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // B2: refetch fresh documents_json immediately before merging to defeat
      // read-modify-write races between concurrent uploads for distinct keys.
      const { data: freshIntake } = await supabase
        .from('contract_intakes')
        .select('documents_json')
        .eq('id', intakeRow.id)
        .single()
      const currentDocs = freshIntake?.documents_json && typeof freshIntake.documents_json === 'object'
        ? freshIntake.documents_json as Record<string, any>
        : {}
      const nextDocs = {
        ...currentDocs,
        [docKey]: {
          path,
          file_name: fileName || `${docKey}.${ext}`,
          mime_type: safeContentType,
          uploaded_at: new Date().toISOString(),
        },
      }
      const { error: persistErr } = await supabase
        .from('contract_intakes')
        .update({ documents_json: nextDocs })
        .eq('id', intakeRow.id)
      if (persistErr) {
        console.error('intake documents_json update failed:', persistErr)
        return new Response(JSON.stringify({
          success: true, path, warning: 'metadata_persist_failed',
        }), {
          status: 207,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }


      return new Response(JSON.stringify({ success: true, path }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Public actions: require valid onboarding token ===
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch contract by token (lookup by hash)
    const onboardingTokenHash = await sha256Hex(token)
    const { data: contract, error: fetchErr } = await supabase
      .from('startup_contracts')
      .select(`
        id, contract_number, status, monthly_fee, currency, start_date, end_date,
        square_meters, signature_status, signature_provider, legal_representative_name,
        legal_representative_email, legal_representative_phone, company_nif, company_address,
        company_city, company_postal_code, project_name,
        document_url, documents_json,
        certidao_permanente_code, additional_representatives,
        counter_signer_email, counter_signer_name, counter_signer_status,
        onboarding_token_expires_at, updated_at,
        regulation_accepted_at, regulation_version,
        workspace:workspaces(id, startup:startups(id, name, nif, main_contact_name, main_contact_email, address)),
        incubation_type:incubation_types(name),
        building:buildings(name, code, address)
      `)
      .eq('onboarding_token_hash', onboardingTokenHash)
      .single()


    if (fetchErr || !contract) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check expiry
    if (contract.onboarding_token_expires_at && new Date(contract.onboarding_token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === GET contract data ===
    if (action === 'get_contract') {
      const { onboarding_token_expires_at, ...safeContract } = contract as any
      return new Response(JSON.stringify({ contract: safeContract }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Upload document (public, token-validated) ===
    if (action === 'upload_document') {
      const { docKey, fileName, fileBase64, fileExt, mimeType } = body
      if (!docKey || !fileBase64) {
        return new Response(JSON.stringify({ error: 'docKey and fileBase64 required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Validate docKey: alphanumeric + underscore/hyphen, max 100 chars
      const SAFE_KEY_REGEX = /^[a-zA-Z0-9_-]{1,100}$/
      if (!SAFE_KEY_REGEX.test(docKey)) {
        return new Response(JSON.stringify({ error: 'Invalid document key' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Whitelist allowed file extensions and derive mime type server-side
      const ALLOWED_EXTS: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
      }
      const requestedExt = (fileExt || 'pdf').toString().toLowerCase()
      if (!ALLOWED_EXTS[requestedExt]) {
        return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const ext = requestedExt
      const safeContentType = ALLOWED_EXTS[ext]

      // Enforce server-side size limit (~10MB)
      const MAX_BYTES = 10 * 1024 * 1024
      // base64 is ~4/3 of decoded size — approximate check before decode
      if (typeof fileBase64 !== 'string' || fileBase64.length > MAX_BYTES * 1.4) {
        return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), {
          status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const path = `onboarding/${contract.id}/${docKey}.${ext}`

      // Decode base64 to bytes
      const binaryStr = atob(fileBase64)
      if (binaryStr.length > MAX_BYTES) {
        return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), {
          status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }

      const { error: uploadErr } = await supabase.storage
        .from('contract-documents')
        .upload(path, bytes, { 
          upsert: true,
          contentType: safeContentType,
        })

      if (uploadErr) throw uploadErr

      // Persist into documents_json so UI can show "uploaded" badge across reloads.
      // B2: refetch `documents_json` immediately before merging to defeat the
      // classic read-modify-write race where two concurrent uploads for
      // distinct docKeys would each wipe the other. The initial `contract`
      // snapshot fetched at request start is NOT authoritative here.
      try {
        const { data: fresh } = await supabase
          .from('startup_contracts')
          .select('documents_json')
          .eq('id', contract.id)
          .single()
        const currentDocs = fresh?.documents_json && typeof fresh.documents_json === 'object'
          ? fresh.documents_json as Record<string, any>
          : {}
        const nextDocs = {
          ...currentDocs,
          [docKey]: {
            path,
            file_name: fileName || `${docKey}.${ext}`,
            mime_type: safeContentType,
            uploaded_at: new Date().toISOString(),
          },
        }
        const { error: persistErr } = await supabase
          .from('startup_contracts')
          .update({ documents_json: nextDocs })
          .eq('id', contract.id)
        if (persistErr) {
          // Storage upload already succeeded — surface metadata failure so the
          // caller knows the badge won't render and can retry, rather than
          // silently swallowing.
          console.error('documents_json update failed:', persistErr)
          return new Response(JSON.stringify({
            success: true, path, warning: 'metadata_persist_failed',
          }), {
            status: 207,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } catch (persistErr) {
        console.error('documents_json update failed:', persistErr)
        return new Response(JSON.stringify({
          success: true, path, warning: 'metadata_persist_failed',
        }), {
          status: 207,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }


      return new Response(JSON.stringify({ success: true, path }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Save company data ===
    if (action === 'save_data') {
      const { formData } = body
      if (!formData || typeof formData !== 'object') {
        return new Response(JSON.stringify({ error: 'formData required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // SAFETY: only persist keys actually present in the payload so this flow
      // (which doesn't render certidao_permanente_code or additional_representatives)
      // NEVER overwrites existing DB values with null / []. Absent keys are
      // preserved verbatim from the server record.
      const ALLOWED_KEYS = [
        'legal_representative_name',
        'legal_representative_email',
        'legal_representative_phone',
        'project_name',
        'certidao_permanente_code',
        'additional_representatives',
        'company_nif',
        'company_address',
        'company_city',
        'company_postal_code',
      ] as const
      const patch: Record<string, unknown> = {}
      for (const k of ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(formData, k)) {
          // additional_representatives must be an array if present
          if (k === 'additional_representatives' && !Array.isArray((formData as any)[k])) continue
          patch[k] = (formData as any)[k]
        }
      }
      if (Object.keys(patch).length === 0) {
        return new Response(JSON.stringify({ success: true, skipped: 'no_fields' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: saveErr } = await supabase
        .from('startup_contracts')
        .update(patch)
        .eq('id', contract.id)

      if (saveErr) throw saveErr

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Submit for signing — provider-agnostic dispatch ===
    if (action === 'submit_signing') {
      const { formData } = body
      const signerEmail = formData?.legal_representative_email || contract.legal_representative_email
      const signerName = formData?.legal_representative_name || contract.legal_representative_name

      if (!signerEmail || !signerName) {
        return new Response(JSON.stringify({ error: 'Signer data required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Determine the signature provider from the contract record
      const provider: string | null = (contract as any).signature_provider || null

      if (!provider || !['docusign', 'pandadoc', 'manual', 'assinatura_digital', 'pandadoc_manual'].includes(provider)) {
        // Fail safely — operator must configure a provider before sending
        return new Response(JSON.stringify({
          error: 'signature_provider_not_configured',
          message: 'No valid signature provider configured for this contract.',
        }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Persist any latest visible-only fields the client sent BEFORE we flip
      // signature_status. We restrict to the same ALLOWED_KEYS set used by
      // save_data so hidden DB fields are never clobbered, and we check the
      // error so we never enter signing with stale data.
      const PRE_SUBMIT_KEYS = [
        'legal_representative_name',
        'legal_representative_email',
        'legal_representative_phone',
        'project_name',
        'company_nif',
        'company_address',
        'company_city',
        'company_postal_code',
      ] as const
      const finalPatch: Record<string, unknown> = {
        status: 'pending_signature',
        regulation_accepted_at: new Date().toISOString(),
        regulation_version: 'V11_2026',
        signature_status: 'sent_for_signature',
        signature_requested_at: new Date().toISOString(),
      }
      if (formData && typeof formData === 'object') {
        for (const k of PRE_SUBMIT_KEYS) {
          if (Object.prototype.hasOwnProperty.call(formData, k)) {
            finalPatch[k] = (formData as any)[k]
          }
        }
      }
      // Always ensure signer identity is locked in (fallbacks to existing record).
      finalPatch.legal_representative_name = finalPatch.legal_representative_name ?? signerName
      finalPatch.legal_representative_email = finalPatch.legal_representative_email ?? signerEmail
      finalPatch.company_nif = finalPatch.company_nif ?? contract.company_nif

      const { error: preSubmitErr } = await supabase
        .from('startup_contracts')
        .update(finalPatch)
        .eq('id', contract.id)
      if (preSubmitErr) {
        console.error('[public-contract-onboarding] pre-submit persist failed:', preSubmitErr)
        return new Response(JSON.stringify({
          error: 'pre_submit_persist_failed',
          message: preSubmitErr.message,
        }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // === CANONICAL SYNC (shared helper) ===
      const sentSyncPublic = await syncIntakeOnSent(supabase, contract.id, null, 'public_submit_signing')
      await handleLifecycleSyncResult(supabase, sentSyncPublic, {
        contractId: contract.id, workspaceId: (contract as any).workspace?.id ?? null,
        source: 'public_submit_signing', operation: 'sent',
      })

      let signingResult: any = { status: 'pending_manual', provider }

      try {
        // Generate PDF via internal call (provider-neutral step)
        const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-contract-pdf`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ contractId: contract.id }),
        })

        let documentBase64 = ''
        if (pdfRes.ok) {
          const pdfData = await pdfRes.json()
          documentBase64 = pdfData.documentBase64 || ''
        }

        // === Provider dispatch ===
        if (provider === 'docusign') {
          const dsRes = await fetch(`${supabaseUrl}/functions/v1/docusign-send-envelope`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contractId: contract.id,
              signerEmail,
              signerName,
              companyNif: formData?.company_nif || contract.company_nif,
              documentBase64,
            }),
          })

          if (dsRes.ok) {
            signingResult = await dsRes.json()
            signingResult.provider = 'docusign'
          } else {
            const errText = await dsRes.text()
            console.warn('DocuSign send failed:', errText)
            await supabase.from('startup_contracts').update({
              signature_status: 'failed',
              provider_last_error: `docusign_send: ${errText.slice(0, 500)}`,
              provider_last_sync_at: new Date().toISOString(),
            }).eq('id', contract.id)
            signingResult = { status: 'failed', provider: 'docusign', message: 'DocuSign dispatch failed — staff notified.' }
          }

        } else if (provider === 'pandadoc') {
          const pdRes = await fetch(`${supabaseUrl}/functions/v1/pandadoc-send-document`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contractId: contract.id,
              signerEmail,
              signerName,
              companyNif: formData?.company_nif || contract.company_nif,
              documentBase64,
            }),
          })

          if (pdRes.ok) {
            signingResult = await pdRes.json()
            signingResult.provider = 'pandadoc'
          } else {
            const errText = await pdRes.text()
            console.warn('PandaDoc send failed:', errText)
            await supabase.from('startup_contracts').update({
              signature_status: 'failed',
              provider_last_error: `pandadoc_send: ${errText.slice(0, 500)}`,
              provider_last_sync_at: new Date().toISOString(),
            }).eq('id', contract.id)
            signingResult = { status: 'failed', provider: 'pandadoc', message: 'PandaDoc dispatch failed — staff notified.' }
          }

        } else if (provider === 'assinatura_digital') {
          // Assinatura Digital Simples (PT nationals, eIDAS compliant)
          // No external dispatch — the user signs directly in the browser (step 3).
          // signature_status is already 'sent_for_signature' (set above).
          signingResult = { status: 'ready_for_inline_signing', provider: 'assinatura_digital', message: 'Ready for digital signature in browser.' }

        } else if (provider === 'pandadoc_manual') {
          // PandaDoc Manual: staff sends via PandaDoc web interface
          // No API dispatch — just notify staff to send manually
          signingResult = { status: 'pending_manual', provider: 'pandadoc_manual', message: 'Contract ready for PandaDoc manual send. Staff notified.' }

        } else if (provider === 'manual') {
          // Manual signing: mark as pending manual, notify staff
          await supabase
            .from('startup_contracts')
            .update({ signature_status: 'pending_manual' })
            .eq('id', contract.id)

          signingResult = { status: 'pending_manual', provider: 'manual', message: 'Contract submitted for manual signing. Staff will coordinate.' }
        }

        // Notify staff if provider dispatch failed or is manual
        if (signingResult.status === 'pending_manual') {
          const { data: staffUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('role', ['admin', 'consultor', 'backoffice'])

          if (staffUsers?.length) {
            const startupName = (contract as any).workspace?.startup?.name || 'Startup'
            await supabase.from('notifications').insert(
              staffUsers.map((s: any) => ({
                user_id: s.user_id,
                type: 'contract_signing',
                title: `Contrato pendente: ${startupName}`,
                message: `${signerName} (${signerEmail}) completou o onboarding contratual. Fornecedor: ${provider}. Ação manual necessária.`,
                entity_type: 'contract',
                entity_id: contract.id,
                link: '/admin?tab=backoffice&subtab=contracts',
              }))
            )
          }
        }
      } catch (err) {
        console.error('Signing flow error:', err)
        signingResult = { status: 'pending_manual', provider, message: String(err) }
      }

      return new Response(JSON.stringify(signingResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Digital Sign (advanced electronic signature per eIDAS Art. 26) ===
    // NOTE: we do NOT claim "eIDAS compliant" — that requires a QTSP.
    if (action === 'digital_sign') {
      const { signatureData, consent } = body

      if (!signatureData?.typed_name || signatureData.typed_name.length < 3) {
        return new Response(JSON.stringify({ error: 'invalid_signature_name' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Batch B: require an explicit consent block from the client. Server
      // MUST NOT infill eidas_ack / timestamp / ip on behalf of the signer.
      if (!consent || consent.eidas_ack !== true
          || typeof consent.timestamp !== 'string'
          || typeof consent.ip !== 'string') {
        return new Response(JSON.stringify({
          error: 'consent_required',
          message: 'Explicit consent block required: { eidas_ack: true, timestamp, ip }',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Server observed IP (still hashed) for correlation with client-declared IP.
      const clientIp = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
                       req.headers.get('CF-Connecting-IP') || 'unknown'
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(clientIp + 'eidas-salt'))
      const ipHash = Array.from(new Uint8Array(hashBuffer)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')

      // Build legal proof record — labels the method honestly.
      const signatureProof = {
        method: 'advanced_electronic_signature',
        regulation_reference: 'eIDAS EU 910/2014, Article 26',
        qualified: false,
        typed_name: signatureData.typed_name,
        signer_email: signatureData.signer_email,
        signer_nif: signatureData.signer_nif,
        consent: {
          eidas_ack: consent.eidas_ack,
          client_timestamp: consent.timestamp,
          client_declared_ip: consent.ip,
        },
        signed_at: new Date().toISOString(),
        server_ip_hash: ipHash,
        user_agent: signatureData.user_agent || req.headers.get('User-Agent'),
      }
      
      // BATCH B — atomic signing via apply_contract_signature_atomic RPC.
      // The RPC:
      //   • is idempotent on (contract_id, command_id) — retries return the prior effect
      //   • locks the contract row FOR UPDATE — concurrent parties cannot clobber each other
      //   • enforces monotonic state transitions (signed cannot regress to sent)
      //   • writes an auditable row into contract_signature_events atomically
      //   • recomputes signature_status: 'completed' when both parties signed (or single-party),
      //     'partially_signed' when only one party signed, 'declined'/'voided' on kill paths.
      //
      // command_id is deterministic per (contract, party, target status, signer email) so
      // an accidental double-submit from the founder produces the same command → same event.
      const hasCounterSigner = !!(contract as any).counter_signer_email
      const commandSeed = `${contract.id}:founder:signed:${(signatureData.signer_email ?? '').toLowerCase().trim()}`
      const cmdBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(commandSeed))
      const cmdHex = Array.from(new Uint8Array(cmdBuf), b => b.toString(16).padStart(2, '0')).join('')
      // Format as RFC-4122 UUID (v4-shaped, deterministic).
      const commandId = `${cmdHex.slice(0,8)}-${cmdHex.slice(8,12)}-4${cmdHex.slice(13,16)}-8${cmdHex.slice(17,20)}-${cmdHex.slice(20,32)}`

      const { data: rpcResult, error: rpcErr } = await supabase.rpc('apply_contract_signature_atomic', {
        p_command_id: commandId,
        p_contract_id: contract.id,
        p_party: 'founder',
        p_to_status: 'signed',
        p_actor_user_id: null,
        p_evidence: signatureProof,
        p_ip_hash: ipHash,
        p_user_agent: signatureProof.user_agent ?? null,
      })

      if (rpcErr) {
        console.error('apply_contract_signature_atomic failed:', rpcErr)
        return new Response(JSON.stringify({ error: 'Failed to record signature', details: rpcErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Persist the eIDAS proof snapshot on the contract as well (auditable copy).
      await supabase
        .from('startup_contracts')
        .update({ signature_proof_json: signatureProof })
        .eq('id', contract.id)

      const overallStatus = (rpcResult as any)?.signature_status ?? null
      const isFullySigned = overallStatus === 'completed'

      if (!isFullySigned && hasCounterSigner) {
        // Enqueue counter-sign work item using the canonical schema. If we
        // have no workspace_id yet (pre-link CRM lead), skip and let the
        // reconciler pick it up — staff_work_queue_items.workspace_id is
        // NOT NULL.
        const wsForQueue = (contract as any).workspace?.id ?? null
        if (wsForQueue) {
          try {
            await supabase.from('staff_work_queue_items').insert({
              workspace_id: wsForQueue,
              type: 'counter_sign_contract',
              title: `Contra-assinar contrato — ${(contract as any).workspace?.startup?.name || contract.id.slice(0, 8)}`,
              description: 'Founder assinou digitalmente. Contra-assinatura por Startup Leiria pendente.',
              priority: 'high',
              status: 'open',
              evidence_json: { contract_id: contract.id, purpose: 'counter_sign_contract' },
            })
          } catch (qErr) {
            console.warn('counter-sign work-queue insert failed (non-fatal):', qErr)
          }
        }
        return new Response(JSON.stringify({
          status: 'partially_signed',
          idempotent: (rpcResult as any)?.idempotent === true,
          message: 'Assinatura registada. Aguardando contra-assinatura.',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      
      // === CANONICAL LIFECYCLE SYNC (shared helper): contract + workspace + intake + CRM ===
      // Public digital signing has no provider to retry — surface failure to the
      // founder so they can contact staff instead of silently appearing successful.
      await supabase
        .from('startup_contracts')
        .update({ status: 'active' })
        .eq('id', contract.id)

      const wsId = (contract as any).workspace?.id ?? null
      const completedSync = await syncIntakeOnCompleted(supabase, contract.id, wsId, null, 'digital_sign_onboarding')
      const syncOk = await handleLifecycleSyncResult(supabase, completedSync, {
        contractId: contract.id, workspaceId: wsId,
        source: 'digital_sign_onboarding', operation: 'completed',
      })
      if (!syncOk) {
        return new Response(JSON.stringify({
          error: 'lifecycle_sync_failed',
          message: 'A assinatura foi registada, mas a ativação do workspace falhou. Contacte o staff.',
          details: completedSync.errors,
        }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      // Auto-create founder account (parity with docusign path)
      try {
        const acctRes = await autoCreateFounderAccount(supabase, {
          id: contract.id,
          workspace_id: wsId,
          legal_representative_email: (contract as any).legal_representative_email ?? signatureData.signer_email ?? null,
          legal_representative_name: (contract as any).legal_representative_name ?? signatureData.typed_name ?? null,
        })
        if (!acctRes.ok) {
          await enqueueFounderInviteTask(supabase, {
            id: contract.id,
            workspace_id: wsId,
            legal_representative_email: (contract as any).legal_representative_email ?? null,
            legal_representative_name: (contract as any).legal_representative_name ?? null,
          }, acctRes.reason || 'unknown')
        }
      } catch (acctErr) {
        console.warn('digital_sign founder account creation failed (non-fatal):', acctErr)
      }

      // Notify staff
      const { data: staffUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor', 'backoffice'])

      if (staffUsers?.length) {
        const startupName = (contract as any).workspace?.startup?.name || 'Startup'
        try {
          await supabase.from('notifications').insert(
            staffUsers.map((s: any) => ({
              user_id: s.user_id,
              type: 'contract_signed',
              title: `Contrato assinado: ${startupName}`,
              message: `${signatureData.typed_name} assinou digitalmente o contrato.`,
              entity_type: 'contract',
              entity_id: contract.id,
              link: '/admin?tab=backoffice&subtab=contracts',
            }))
          )
        } catch (_) { /* non-fatal */ }
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Contrato assinado digitalmente',
        signedAt: signatureProof.signed_at,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Download PDF (public, token-validated) ===
    if (action === 'download_pdf') {
      const existingDocumentPath = typeof (contract as any).document_url === 'string'
        ? (contract as any).document_url.trim()
        : ''

      if (existingDocumentPath) {
        const { data: signedData, error: signedErr } = await supabase.storage
          .from('contract-documents')
          .createSignedUrl(existingDocumentPath, 60 * 60)

        if (!signedErr && signedData?.signedUrl) {
          return new Response(JSON.stringify({
            signedUrl: signedData.signedUrl,
            fileName: existingDocumentPath.split('/').pop() || 'contrato.pdf',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.warn('Failed to create signed URL for existing contract PDF:', signedErr)
      }

      const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-contract-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ contractId: contract.id }),
      })
      
      if (!pdfRes.ok) {
        return new Response(JSON.stringify({ error: 'Failed to generate PDF' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      const pdfData = await pdfRes.json()

      if (pdfData?.documentPath) {
        const { data: signedData, error: signedErr } = await supabase.storage
          .from('contract-documents')
          .createSignedUrl(pdfData.documentPath, 60 * 60)

        if (!signedErr && signedData?.signedUrl) {
          return new Response(JSON.stringify({
            signedUrl: signedData.signedUrl,
            fileName: pdfData.fileName || pdfData.documentPath.split('/').pop() || 'contrato.pdf',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.warn('Failed to create signed URL for freshly generated contract PDF:', signedErr)
      }

      return new Response(JSON.stringify({ documentBase64: pdfData.documentBase64, fileName: pdfData.fileName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Public contract onboarding error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
