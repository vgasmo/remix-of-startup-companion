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
            else { console.warn('DocuSign failed:', await dsRes.text()); signingResult = { status: 'pending_manual', provider: 'docusign', message: 'DocuSign indisponível' } }

          } else if (provider === 'pandadoc') {
            const pdRes = await fetch(`${supabaseUrl}/functions/v1/pandadoc-send-document`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ contractId, signerEmail, signerName, companyNif: (contract as any).company_nif, documentBase64 }),
            })
            if (pdRes.ok) { signingResult = await pdRes.json(); signingResult.provider = 'pandadoc' }
            else { console.warn('PandaDoc failed:', await pdRes.text()); signingResult = { status: 'pending_manual', provider: 'pandadoc', message: 'PandaDoc indisponível' } }

          } else if (provider === 'manual') {
            await supabase.from('startup_contracts').update({ signature_status: 'pending_manual' }).eq('id', contractId)
            signingResult = { status: 'pending_manual', provider: 'manual', message: 'Assinatura manual. O staff coordenará o processo.' }
          }

          // Notify staff if manual fallback
          if (signingResult.status === 'pending_manual') {
            const { data: staffUsers } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'consultor'])
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
      const onboardingToken = generateToken()
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

      const { error: updateErr } = await supabase
        .from('startup_contracts')
        .update({
          onboarding_token: onboardingToken,
          onboarding_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', contractId)

      if (updateErr) throw updateErr

      const publicUrl = `${req.headers.get('origin') || Deno.env.get("PUBLIC_APP_URL") || 'https://fb.startupleiria.com'}/contract-signing/${onboardingToken}`

      return new Response(JSON.stringify({ 
        token: onboardingToken, 
        url: publicUrl,
        expiresAt: expiresAt.toISOString(),
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
        .select('id, status, organization_name, company_nif, company_address, company_city, company_postal_code, iban, legal_representative_name, legal_representative_email, legal_representative_phone, billing_email, startup_description, website, documents_json, missing_documents, changes_requested_notes, intake_token_expires_at, submitted_at')
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

      return new Response(JSON.stringify({ intake }), {
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

      // Update intake with form data
      const { error: updateErr } = await supabase
        .from('contract_intakes')
        .update({
          organization_name: fd.organization_name,
          company_nif: fd.company_nif ? String(fd.company_nif).replace(/\s|-/g, '') : null,
          company_address: fd.company_address,
          company_city: fd.company_city,
          company_postal_code: fd.company_postal_code,
          iban: fd.iban ? String(fd.iban).replace(/\s/g, '').toUpperCase() : null,
          legal_representative_name: fd.legal_representative_name,
          legal_representative_email: fd.legal_representative_email,
          legal_representative_phone: fd.legal_representative_phone,
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

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Public actions: require valid onboarding token ===
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch contract by token
    const { data: contract, error: fetchErr } = await supabase
      .from('startup_contracts')
      .select(`
        id, contract_number, status, monthly_fee, currency, start_date, end_date,
        square_meters, signature_status, signature_provider, legal_representative_name,
        legal_representative_email, company_nif, company_address,
        company_city, company_postal_code, onboarding_token_expires_at,
        regulation_accepted_at, regulation_version,
        workspace:workspaces(id, startup:startups(id, name, nif, main_contact_name, main_contact_email, address)),
        incubation_type:incubation_types(name),
        building:buildings(name, code, address)
      `)
      .eq('onboarding_token', token)
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

      return new Response(JSON.stringify({ success: true, path }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Save company data ===
    if (action === 'save_data') {
      const { formData } = body
      if (!formData) {
        return new Response(JSON.stringify({ error: 'formData required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: saveErr } = await supabase
        .from('startup_contracts')
        .update({
          legal_representative_name: formData.legal_representative_name,
          legal_representative_email: formData.legal_representative_email,
          company_nif: formData.company_nif,
          company_address: formData.company_address,
          company_city: formData.company_city,
          company_postal_code: formData.company_postal_code,
        })
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

      // Mark regulation as accepted + update canonical status (status + signature_status)
      await supabase
        .from('startup_contracts')
        .update({
          status: 'pending_signature',
          regulation_accepted_at: new Date().toISOString(),
          regulation_version: 'V11_2026',
          signature_status: 'sent_for_signature',
          signature_requested_at: new Date().toISOString(),
          legal_representative_name: signerName,
          legal_representative_email: signerEmail,
          company_nif: formData?.company_nif || contract.company_nif,
        })
        .eq('id', contract.id)

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
            console.warn('DocuSign send failed:', await dsRes.text())
            signingResult = { status: 'pending_manual', provider: 'docusign', message: 'DocuSign unavailable — staff notified' }
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
            console.warn('PandaDoc send failed:', await pdRes.text())
            signingResult = { status: 'pending_manual', provider: 'pandadoc', message: 'PandaDoc unavailable — staff notified' }
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
            .in('role', ['admin', 'consultor'])

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

    // === Digital Sign (simple electronic signature, eIDAS compliant) ===
    if (action === 'digital_sign') {
      const { signatureData } = body
      
      if (!signatureData?.typed_name || signatureData.typed_name.length < 3) {
        return new Response(JSON.stringify({ error: 'Invalid signature name' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      // Get client IP and hash for privacy
      const clientIp = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
                       req.headers.get('CF-Connecting-IP') || 'unknown'
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(clientIp + 'eidas-salt'))
      const ipHash = Array.from(new Uint8Array(hashBuffer)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
      
      // Build legal proof record
      const signatureProof = {
        method: 'simple_electronic_signature',
        regulation: 'eIDAS EU 910/2014',
        typed_name: signatureData.typed_name,
        signer_email: signatureData.signer_email,
        signer_nif: signatureData.signer_nif,
        accepted_terms: true,
        accepted_eidas_disclaimer: true,
        signed_at: new Date().toISOString(),
        ip_hash: ipHash,
        user_agent: signatureData.user_agent || req.headers.get('User-Agent'),
        token_used: token,
      }
      
      // Update contract: mark as signed
      const { error: updateError } = await supabase
        .from('startup_contracts')
        .update({
          signature_status: 'signed',
          signed_at: new Date().toISOString(),
          founder_signer_status: 'signed',
          signature_proof_json: signatureProof,
        })
        .eq('id', contract.id)
      
      if (updateError) {
        console.error('Signature update error:', updateError)
        return new Response(JSON.stringify({ error: 'Failed to record signature' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      // === CANONICAL LIFECYCLE SYNC (shared helper): contract + workspace + intake + CRM ===
      // Public digital signing has no provider to retry — surface failure to the
      // founder so they can contact staff instead of silently appearing successful.
      await supabase
        .from('startup_contracts')
        .update({ status: 'active' })
        .eq('id', contract.id)

      const completedSync = await syncIntakeOnCompleted(supabase, contract.id, (contract as any).workspace_id, null, 'digital_sign_onboarding')
      const syncOk = await handleLifecycleSyncResult(supabase, completedSync, {
        contractId: contract.id, workspaceId: (contract as any).workspace_id ?? null,
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
      
      // Notify staff
      const { data: staffUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor'])
      
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
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      
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
      return new Response(JSON.stringify({ documentBase64: pdfData.documentBase64, fileName: pdfData.fileName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Public contract onboarding error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
