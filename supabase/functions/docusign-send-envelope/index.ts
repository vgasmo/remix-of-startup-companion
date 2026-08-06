/**
 * DocuSign Send Envelope Edge Function
 * Sends a contract for BILATERAL digital signature via DocuSign eSignature API.
 * Signer 1 (routing order 1): Founder / Legal Representative
 * Signer 2 (routing order 2): Startup Leiria Representative (counter-signer)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getDocuSignAccessToken(): Promise<{ accessToken: string; accountId: string }> {
  const integrationKey = Deno.env.get('DOCUSIGN_INTEGRATION_KEY')!
  const userId = Deno.env.get('DOCUSIGN_USER_ID')!
  const rsaPrivateKey = Deno.env.get('DOCUSIGN_RSA_PRIVATE_KEY')!
  const accountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID')!
  const baseUrl = Deno.env.get('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net'

  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    iss: integrationKey,
    sub: userId,
    aud: baseUrl.includes('demo') ? 'account-d.docusign.com' : 'account.docusign.com',
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  }))

  const keyData = rsaPrivateKey.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----|\n/g, '')
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const signatureData = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, signatureData)
  const jwt = `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`

  const tokenUrl = baseUrl.includes('demo')
    ? 'https://account-d.docusign.com/oauth/token'
    : 'https://account.docusign.com/oauth/token'

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`DocuSign token error: ${err}`)
  }

  const tokenData = await tokenRes.json()
  return { accessToken: tokenData.access_token, accountId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    // Internal service-role calls (from public-contract-onboarding, staff dispatch,
    // etc.) skip the user resolution because the service key has no `sub`. Staff
    // gate is enforced upstream in those callers.
    const isInternalServiceCall = token === supabaseKey
    // B1: hoist actor identity to top scope so activity logging and profile
    // lookups can reference it regardless of the auth branch taken.
    let actorUserId: string | null = null
    if (!isInternalServiceCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: staffRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
      const isStaff = (staffRoles ?? []).some((r: { role: string }) =>
        r.role === 'admin' || r.role === 'consultor' || r.role === 'backoffice'
      )
      if (!isStaff) {
        return new Response(JSON.stringify({ error: 'Staff access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      actorUserId = user.id
    }



    const { contractId, signerEmail, signerName, companyNif } = await req.json()

    if (!contractId || !signerEmail || !signerName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('startup_contracts')
      .select('*, workspace:workspaces(startup:startups(name))')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // B1/C: Deterministic envelope command id — sha256(contractId || template_version || 'send').
    // Two concurrent workers with the same digest will race on the atomic claim
    // RPC below; only one can leave with `claimed=true`, so at most one envelope
    // is ever dispatched per (contract, template_version).
    const templateVersion = String(contract.contract_template_version ?? 'v0')
    const commandSource = `${contractId}::${templateVersion}::send`
    const commandDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(commandSource),
    )
    const envelopeCommandId = Array.from(new Uint8Array(commandDigest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // Atomically claim the command id under a row lock BEFORE calling DocuSign.
    // Idempotent replay short-circuits here; concurrent calls collapse to one
    // claim; already-live contracts return a 409 without touching the provider.
    const { data: claimData, error: claimError } = await supabase.rpc(
      'claim_docusign_envelope',
      { p_contract_id: contractId, p_command_id: envelopeCommandId },
    )
    if (claimError) {
      console.error('claim_docusign_envelope failed', claimError)
      return new Response(JSON.stringify({ error: 'claim_failed', details: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const claim = (claimData ?? {}) as {
      claimed?: boolean
      idempotent?: boolean
      conflict?: string
      envelope_id?: string | null
      signature_status?: string | null
    }
    if (claim.idempotent && claim.envelope_id) {
      return new Response(JSON.stringify({
        status: 'already_sent',
        idempotent: true,
        envelopeId: claim.envelope_id,
        envelopeCommandId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!claim.claimed) {
      return new Response(JSON.stringify({
        error: 'Contract already dispatched or in a non-resendable state.',
        conflict: claim.conflict ?? 'unknown',
        currentEnvelope: claim.envelope_id ?? null,
        currentStatus: claim.signature_status ?? null,
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }


    // Generate the contract PDF first — B1 fail-closed policy: if the PDF
    // cannot be produced we refuse to dispatch to the provider rather than
    // sending a placeholder document that the signer would need to redo.
    let documentBase64 = ''
    try {
      const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-contract-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contractId }),
      })
      if (!pdfRes.ok) {
        const errText = await pdfRes.text().catch(() => '')
        throw new Error(`generate-contract-pdf ${pdfRes.status}: ${errText.slice(0, 200)}`)
      }
      const pdfData = await pdfRes.json()
      documentBase64 = pdfData.documentBase64 || ''
      if (!documentBase64) {
        throw new Error('generate-contract-pdf returned empty documentBase64')
      }
    } catch (pdfErr) {
      console.error('PDF generation failed — releasing envelope claim', pdfErr)
      await supabase.rpc('release_docusign_envelope_command', {
        p_contract_id: contractId,
        p_command_id: envelopeCommandId,
        p_error: `pdf_generation_failed: ${(pdfErr as Error).message ?? 'unknown'}`,
      })
      return new Response(JSON.stringify({
        error: 'Contract PDF generation failed; envelope not sent.',
        details: (pdfErr as Error).message ?? 'unknown',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }


    // Check if DocuSign keys are configured
    const integrationKey = Deno.env.get('DOCUSIGN_INTEGRATION_KEY')
    if (!integrationKey) {
      // Release the claim: manual-signature route is not a provider dispatch,
      // and the reconciler must be able to re-enter dispatch later if staff
      // configures DocuSign.
      await supabase.rpc('release_docusign_envelope_command', {
        p_contract_id: contractId,
        p_command_id: envelopeCommandId,
        p_error: 'docusign_not_configured',
      })
      await supabase
        .from('startup_contracts')
        .update({
          signature_status: 'pending_manual',
          signature_requested_at: new Date().toISOString(),
        })
        .eq('id', contractId)


      const { data: staffUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor'])

      if (staffUsers) {
        const notifications = staffUsers.map(s => ({
          user_id: s.user_id,
          type: 'contract_signing',
          title: `Contrato pendente de assinatura: ${contract.workspace?.startup?.name || contractId}`,
          message: `O representante ${signerName} (${signerEmail}) completou o onboarding contratual. DocuSign não configurado — assinatura manual necessária.`,
          entity_type: 'contract',
          entity_id: contractId,
          link: `/admin?tab=contracts`,
        }))
        await supabase.from('notifications').insert(notifications)
      }

      return new Response(JSON.stringify({
        status: 'pending_manual',
        message: 'DocuSign not configured. Staff notified for manual processing.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve the counter-signer (Startup Leiria representative)
    // Priority: contract fields > global integration settings > fallback
    let counterSignerName = contract.counter_signer_name || ''
    let counterSignerEmail = contract.counter_signer_email || ''

    if (!counterSignerEmail) {
      // Try to get default counter-signer from global integration settings
      const { data: sigSettings } = await supabase
        .from('global_integration_settings')
        .select('settings_json')
        .eq('integration_type', 'signature')
        .eq('is_enabled', true)
        .single()

      if (sigSettings?.settings_json) {
        const settings = sigSettings.settings_json as Record<string, any>
        counterSignerName = settings.default_counter_signer_name || ''
        counterSignerEmail = settings.default_counter_signer_email || ''
      }
    }

    // If still no counter-signer, try to get from the user who triggered the send (staff member)
    if (!counterSignerEmail && actorUserId) {
      const { data: staffProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', actorUserId)
        .single()

      if (staffProfile?.email) {
        counterSignerName = staffProfile.full_name || 'Startup Leiria'
        counterSignerEmail = staffProfile.email
      }
    }

    // Send via DocuSign with bilateral signing
    const { accessToken, accountId } = await getDocuSignAccessToken()
    const baseUrl = (Deno.env.get('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net') + '/restapi'

    // Batch C: provider idempotency key is bound to the *payload*, not only
    // command_id. Two calls with the same command but different documents
    // must produce different keys so DocuSign cannot silently coalesce them.
    // Hash the full document, not a prefix (audit finding: prefix-hash was
    // insufficient to detect substituted PDFs).
    const documentBytes = Uint8Array.from(atob(documentBase64), (c) => c.charCodeAt(0))
    const docDigestBuf = await crypto.subtle.digest('SHA-256', documentBytes)
    const documentSha256 = Array.from(new Uint8Array(docDigestBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const idemDigestBuf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${envelopeCommandId}:${documentSha256}`),
    )
    let providerIdempotencyKey = Array.from(new Uint8Array(idemDigestBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // RC5 Batch 2 (P0-B) — exactly-once dispatch lease. The lease layer owns the
    // provider-call window: it is claimed with the *document hash* before the
    // HTTP call, moved to `in_flight` immediately before it, and can only be
    // finalized by the owner that holds it. An expired lease that was never
    // reconciled refuses re-dispatch, so an ambiguous provider call can never
    // be blindly retried.
    const leaseOwnerId = crypto.randomUUID()
    const { data: leaseData, error: leaseError } = await supabase.rpc(
      'claim_docusign_dispatch_lease',
      {
        p_contract_id: contractId,
        p_command_id: envelopeCommandId,
        p_owner_id: leaseOwnerId,
        p_lease_seconds: 120,
        p_document_sha256: documentSha256,
      },
    )
    if (leaseError) {
      console.error('claim_docusign_dispatch_lease failed', leaseError)
      return new Response(JSON.stringify({ error: 'lease_claim_failed', details: leaseError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const lease = (leaseData ?? {}) as {
      claimed?: boolean
      idempotent?: boolean
      conflict?: string
      exhausted?: boolean
      requires_reconciliation?: boolean
      state?: string
      envelope_id?: string | null
      provider_idempotency_key?: string | null
    }
    if (!lease.claimed) {
      if (lease.idempotent && lease.envelope_id) {
        return new Response(JSON.stringify({
          status: 'already_sent',
          idempotent: true,
          envelopeId: lease.envelope_id,
          envelopeCommandId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        error: lease.requires_reconciliation
          ? 'A previous dispatch attempt is unreconciled; provider state must be confirmed before resending.'
          : 'Dispatch lease unavailable for this contract.',
        conflict: lease.conflict ?? (lease.exhausted ? 'attempts_exhausted' : lease.requires_reconciliation ? 'requires_reconciliation' : 'lease_unavailable'),
        leaseState: lease.state ?? null,
        envelopeCommandId,
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // The lease is the source of truth for the provider key so retries of the
    // same document reuse the exact key DocuSign already saw.
    if (lease.provider_idempotency_key) providerIdempotencyKey = lease.provider_idempotency_key


    // Construct DocuSign envelope body (Batch C fix: previously referenced
    // an undefined `envelopeBody` variable — audit finding P0).
    const contractLabel = contract.workspace?.startup?.name || `Contract ${contractId.slice(0, 8)}`
    const envelopeBody = {
      emailSubject: `Contrato Startup Leiria — ${contractLabel}`,
      emailBlurb: 'Por favor reveja e assine o contrato em anexo.',
      status: 'sent',
      documents: [
        {
          documentBase64,
          name: `${contractLabel}.pdf`,
          fileExtension: 'pdf',
          documentId: '1',
        },
      ],
      recipients: {
        signers: [
          {
            email: signerEmail,
            name: signerName,
            recipientId: '1',
            routingOrder: '1',
            tabs: {
              signHereTabs: [
                { anchorString: '/founder_sig/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' },
              ],
              dateSignedTabs: [
                { anchorString: '/founder_date/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' },
              ],
            },
          },
          ...(counterSignerEmail
            ? [{
              email: counterSignerEmail,
              name: counterSignerName || 'Startup Leiria',
              recipientId: '2',
              routingOrder: '2',
              tabs: {
                signHereTabs: [
                  { anchorString: '/sl_sig/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' },
                ],
                dateSignedTabs: [
                  { anchorString: '/sl_date/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' },
                ],
              },
            }]
            : []),
        ],
      },
      customFields: {
        textCustomFields: [
          { name: 'contractId', value: contractId, required: 'false', show: 'false' },
          { name: 'commandId', value: envelopeCommandId, required: 'false', show: 'false' },
          { name: 'documentSha256', value: documentSha256, required: 'false', show: 'false' },
          ...(companyNif ? [{ name: 'companyNif', value: String(companyNif), required: 'false', show: 'false' }] : []),
        ],
      },
    }


    let envelope: { envelopeId?: string } | null = null
    // 30s hard timeout — anything longer is ambiguous and must not be
    // treated as failure (Batch C reconciliation-first policy).
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 30_000)
    try {
      const envRes = await fetch(`${baseUrl}/v2.1/accounts/${accountId}/envelopes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-DocuSign-Idempotency-Key': providerIdempotencyKey,
        },
        body: JSON.stringify(envelopeBody),
        signal: abort.signal,
      })
      if (!envRes.ok) {
        const errText = await envRes.text()
        // 5xx / network-shaped errors are ambiguous — mark unknown and refuse
        // to auto-retry; reconciler must confirm provider state first.
        if (envRes.status >= 500) {
          await supabase
            .from('startup_contracts')
            .update({
              provider_last_error: `docusign_ambiguous_${envRes.status}: ${errText.slice(0, 200)}`,
              provider_last_sync_at: new Date().toISOString(),
            })
            .eq('id', contractId)
          return new Response(JSON.stringify({
            status: 'unknown',
            message: 'DocuSign returned an ambiguous response; reconciliation required before resend.',
            envelopeCommandId,
          }), {
            status: 202,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw new Error(`DocuSign API error: ${errText.slice(0, 500)}`)
      }
      envelope = await envRes.json()
      if (!envelope?.envelopeId) {
        throw new Error('DocuSign response missing envelopeId')
      }
    } catch (dispatchErr) {
      const isTimeout = (dispatchErr as { name?: string })?.name === 'AbortError'
      if (isTimeout) {
        // Ambiguous: envelope may or may not have been created upstream.
        await supabase
          .from('startup_contracts')
          .update({
            provider_last_error: 'docusign_timeout_unknown',
            provider_last_sync_at: new Date().toISOString(),
          })
          .eq('id', contractId)
        return new Response(JSON.stringify({
          status: 'unknown',
          message: 'DocuSign timed out; reconciliation required before resend.',
          envelopeCommandId,
        }), {
          status: 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Definite dispatch failure — release the claim so staff can retry.
      await supabase.rpc('release_docusign_envelope_command', {
        p_contract_id: contractId,
        p_command_id: envelopeCommandId,
        p_error: `docusign_dispatch_failed: ${(dispatchErr as Error).message ?? 'unknown'}`,
      })
      throw dispatchErr
    } finally {
      clearTimeout(timer)
    }

    // Finalize the claim: stamp envelope id + provider metadata atomically.
    // Only the row still holding envelope_command_id can be finalized, so a
    // stale worker whose claim was released can never overwrite a fresh one.
    const { data: finalizeData, error: finalizeError } = await supabase.rpc(
      'finalize_docusign_envelope',
      {
        p_contract_id: contractId,
        p_command_id: envelopeCommandId,
        p_envelope_id: envelope.envelopeId,
        p_signer_email: signerEmail,
        p_counter_signer_name: counterSignerName || null,
        p_counter_signer_email: counterSignerEmail || null,
      },
    )
    if (finalizeError) {
      console.error('finalize_docusign_envelope failed', finalizeError)
      // Envelope exists at provider but we could not stamp it — flag for reconciler.
      await supabase
        .from('startup_contracts')
        .update({
          provider_last_error: `finalize_failed: ${finalizeError.message}`,
          provider_last_sync_at: new Date().toISOString(),
        })
        .eq('id', contractId)
    }
    const finalized = (finalizeData ?? {}) as { finalized?: boolean; reason?: string }
    if (!finalized.finalized) {
      console.warn('envelope finalize was a no-op', { contractId, envelopeId: envelope.envelopeId, reason: finalized.reason })
    }


    // Log activity
    await supabase.from('activity_log').insert({
      user_id: actorUserId,
      entity_type: 'contract',
      entity_id: contractId,
      action: 'sent_for_signature',
      metadata: {
        envelope_id: envelope.envelopeId,
        envelope_command_id: envelopeCommandId,
        actor: actorUserId ? 'user' : 'service_role',
        founder_signer: signerEmail,
        counter_signer: counterSignerEmail || 'none',
        bilateral: !!counterSignerEmail,
      },
    })

    return new Response(JSON.stringify({
      status: 'sent',
      envelopeId: envelope.envelopeId,
      bilateral: !!counterSignerEmail,
      counterSigner: counterSignerEmail || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('DocuSign error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
