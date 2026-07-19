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

    // Generate the contract PDF first
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
      if (pdfRes.ok) {
        const pdfData = await pdfRes.json()
        documentBase64 = pdfData.documentBase64 || ''
      } else {
        console.warn('PDF generation failed, proceeding with placeholder')
      }
    } catch (pdfErr) {
      console.warn('PDF generation error:', pdfErr)
    }

    // Check if DocuSign keys are configured
    const integrationKey = Deno.env.get('DOCUSIGN_INTEGRATION_KEY')
    if (!integrationKey) {
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
    if (!counterSignerEmail) {
      const { data: staffProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

      if (staffProfile?.email) {
        counterSignerName = staffProfile.full_name || 'Startup Leiria'
        counterSignerEmail = staffProfile.email
      }
    }

    // Send via DocuSign with bilateral signing
    const { accessToken, accountId } = await getDocuSignAccessToken()
    const baseUrl = (Deno.env.get('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net') + '/restapi'

    const startupName = contract.workspace?.startup?.name || 'Startup'

    // Build signers array — founder first, then counter-signer
    const signers: any[] = [
      {
        email: signerEmail,
        name: signerName,
        recipientId: '1',
        routingOrder: '1',
        tabs: {
          signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '72', yPosition: '580', anchorString: '/assinatura_primeiro_outorgante/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-20' }],
          dateSignedTabs: [{ documentId: '1', pageNumber: '1', xPosition: '250', yPosition: '580', anchorString: '/data_primeiro_outorgante/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-20' }],
        },
      },
    ]

    if (counterSignerEmail) {
      signers.push({
        email: counterSignerEmail,
        name: counterSignerName || 'Startup Leiria',
        recipientId: '2',
        routingOrder: '2',
        tabs: {
          signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '350', yPosition: '580', anchorString: '/assinatura_segundo_outorgante/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-20' }],
          dateSignedTabs: [{ documentId: '1', pageNumber: '1', xPosition: '500', yPosition: '580', anchorString: '/data_segundo_outorgante/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-20' }],
        },
      })
    }

    const envelopeBody = {
      emailSubject: `Contrato de Incubação — ${startupName} — Startup Leiria`,
      emailBlurb: `Segue o contrato de incubação para assinatura digital bilateral.`,
      status: 'sent',
      recipients: { signers },
      documents: [{
        documentId: '1',
        name: `Contrato_Incubacao_${startupName}.pdf`,
        documentBase64: documentBase64,
        fileExtension: 'pdf',
      }],
    }

    const envRes = await fetch(`${baseUrl}/v2.1/accounts/${accountId}/envelopes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelopeBody),
    })

    if (!envRes.ok) {
      const errText = await envRes.text()
      throw new Error(`DocuSign API error: ${errText}`)
    }

    const envelope = await envRes.json()

    // Update contract with envelope ID and bilateral signing info
    await supabase
      .from('startup_contracts')
      .update({
        docusign_envelope_id: envelope.envelopeId,
        signature_provider: 'docusign',
        provider_document_id: envelope.envelopeId,
        signature_status: 'sent_for_signature',
        signature_requested_at: new Date().toISOString(),
        provider_sent_at: new Date().toISOString(),
        provider_last_event: 'envelope-sent',
        provider_last_sync_at: new Date().toISOString(),
        provider_last_error: null,
        // Bilateral fields
        founder_signer_status: 'sent',
        counter_signer_name: counterSignerName || null,
        counter_signer_email: counterSignerEmail || null,
        counter_signer_status: counterSignerEmail ? 'pending' : null,
      })
      .eq('id', contractId)

    // Log activity
    await supabase.from('activity_log').insert({
      user_id: user.id,
      entity_type: 'contract',
      entity_id: contractId,
      action: 'sent_for_signature',
      metadata: {
        envelope_id: envelope.envelopeId,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
