/**
 * PandaDoc Send Document Edge Function
 * Sends a contract for BILATERAL digital signature via PandaDoc API.
 * Signer 1: Founder / Legal Representative
 * Signer 2: Startup Leiria Representative (counter-signer)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PANDADOC_API = 'https://api.pandadoc.com/public/v1'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authorization: only staff may dispatch a contract for PandaDoc signing.
    // Prevents any authenticated user from redirecting another startup's
    // contract to an attacker-controlled email.
    const { data: staffRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    const isStaff = (staffRoles ?? []).some((r: { role: string }) =>
      r.role === 'admin' || r.role === 'consultor' || r.role === 'backoffice'
    )
    if (!isStaff) {
      return new Response(JSON.stringify({ error: 'Staff access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }


    const body = await req.json().catch(() => ({}))
    const contractId = typeof body?.contractId === 'string' ? body.contractId.trim() : ''
    const requestedSignerEmail = typeof body?.signerEmail === 'string' ? body.signerEmail.trim() : ''
    const requestedSignerName = typeof body?.signerName === 'string' ? body.signerName.trim() : ''

    if (!contractId) {
      return new Response(JSON.stringify({ error: 'Missing required field: contractId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY')
    if (!pandadocApiKey) {
      await supabase
        .from('startup_contracts')
        .update({
          signature_status: 'pending_manual',
          signature_provider: 'manual',
          signature_requested_at: new Date().toISOString(),
          provider_last_error: 'PANDADOC_API_KEY not configured',
        })
        .eq('id', contractId)

      return new Response(JSON.stringify({
        status: 'pending_manual',
        message: 'PandaDoc not configured. Contract marked for manual processing.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch contract
    const { data: contract, error: contractError } = await supabase
      .from('startup_contracts')
      .select('*, workspace:workspaces(startup:startups(name,main_contact_email))')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const signerEmail =
      requestedSignerEmail ||
      contract.legal_representative_email ||
      contract.workspace?.startup?.main_contact_email ||
      ''

    const signerName =
      requestedSignerName ||
      contract.legal_representative_name ||
      contract.workspace?.startup?.name ||
      'Founder'

    if (!signerEmail) {
      const missingSignerError = 'No signer email found. Fill Legal Representative Email or Startup main contact email before sending.'
      await supabase.from('startup_contracts').update({
        provider_last_error: missingSignerError,
        provider_last_sync_at: new Date().toISOString(),
      }).eq('id', contractId)

      return new Response(JSON.stringify({ error: missingSignerError }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Guard: do not resend contracts already in terminal/sent state
    if (contract.signature_provider && contract.provider_document_id &&
        contract.signature_status && !['draft', 'failed', 'ready_to_send', 'pending_manual'].includes(contract.signature_status)) {
      return new Response(JSON.stringify({
        error: 'Contract already sent for signature. Cannot resend.',
        currentProvider: contract.signature_provider,
        currentStatus: contract.signature_status,
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve counter-signer (Startup Leiria representative)
    let counterSignerName = contract.counter_signer_name || ''
    let counterSignerEmail = contract.counter_signer_email || ''

    if (!counterSignerEmail) {
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

    // Generate the contract PDF
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
        const errText = await pdfRes.text()
        console.error('PDF generation failed:', errText)
      }
    } catch (pdfErr) {
      console.error('PDF generation error:', pdfErr)
    }

    if (!documentBase64) {
      await supabase.from('startup_contracts').update({
        provider_last_error: 'Failed to generate contract PDF',
        provider_last_sync_at: new Date().toISOString(),
      }).eq('id', contractId)

      return new Response(JSON.stringify({
        error: 'Failed to generate contract PDF. Cannot send to PandaDoc.',
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const startupName = contract.workspace?.startup?.name || 'Startup'

    // Build recipients — founder + counter-signer
    const recipients: any[] = [
      {
        email: signerEmail,
        first_name: signerName.split(' ')[0],
        last_name: signerName.split(' ').slice(1).join(' ') || '',
        role: 'Primeiro Outorgante',
        signing_order: 1,
      },
    ]

    if (counterSignerEmail) {
      recipients.push({
        email: counterSignerEmail,
        first_name: (counterSignerName || 'Startup Leiria').split(' ')[0],
        last_name: (counterSignerName || 'Startup Leiria').split(' ').slice(1).join(' ') || '',
        role: 'Segundo Outorgante',
        signing_order: 2,
      })
    }

    // Step 1: Create document from PDF file upload
    const boundary = '----PandaDocBoundary' + Date.now()
    const pdfBytes = Uint8Array.from(atob(documentBase64), c => c.charCodeAt(0))

    const metadata = JSON.stringify({
      name: `Contrato de Incubação — ${startupName}`,
      recipients,
      parse_form_fields: false,
    })

    const encoder = new TextEncoder()
    const parts: Uint8Array[] = []

    parts.push(encoder.encode(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="data"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      metadata + '\r\n'
    ))

    parts.push(encoder.encode(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="Contrato_Incubacao_${startupName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`
    ))
    parts.push(pdfBytes)
    parts.push(encoder.encode('\r\n'))
    parts.push(encoder.encode(`--${boundary}--\r\n`))

    const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
    const bodyBytes = new Uint8Array(totalLength)
    let offset = 0
    for (const part of parts) {
      bodyBytes.set(part, offset)
      offset += part.length
    }

    const createRes = await fetch(`${PANDADOC_API}/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandadocApiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBytes,
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      await supabase.from('startup_contracts').update({
        provider_last_error: `PandaDoc create failed [${createRes.status}]: ${errText.slice(0, 500)}`,
        provider_last_sync_at: new Date().toISOString(),
      }).eq('id', contractId)

      throw new Error(`PandaDoc API error [${createRes.status}]: ${errText}`)
    }

    const doc = await createRes.json()
    const pandadocDocId = doc.id

    await supabase.from('startup_contracts').update({
      signature_provider: 'pandadoc',
      provider_document_id: pandadocDocId,
      signature_status: 'draft',
      signature_requested_at: new Date().toISOString(),
      provider_last_sync_at: new Date().toISOString(),
      provider_last_event: 'document.created',
      provider_last_error: null,
      founder_signer_status: 'pending',
      counter_signer_name: counterSignerName || null,
      counter_signer_email: counterSignerEmail || null,
      counter_signer_status: counterSignerEmail ? 'pending' : null,
    }).eq('id', contractId)

    // Wait for document processing
    await new Promise(resolve => setTimeout(resolve, 3000))

    const statusRes = await fetch(`${PANDADOC_API}/documents/${pandadocDocId}`, {
      headers: { 'Authorization': `API-Key ${pandadocApiKey}` },
    })

    if (!statusRes.ok) {
      const statusErr = await statusRes.text()
      await supabase.from('startup_contracts').update({
        signature_status: 'ready_to_send',
        provider_last_error: `Status check failed [${statusRes.status}]: ${statusErr.slice(0, 500)}`,
        provider_last_sync_at: new Date().toISOString(),
      }).eq('id', contractId)

      return new Response(JSON.stringify({
        error: `PandaDoc status check failed [${statusRes.status}]`,
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const statusData = await statusRes.json()

    if (statusData.status !== 'document.draft') {
      await supabase.from('startup_contracts').update({
        signature_status: 'ready_to_send',
        provider_last_event: statusData.status,
        provider_last_sync_at: new Date().toISOString(),
      }).eq('id', contractId)

      return new Response(JSON.stringify({
        error: 'Documento ainda em processamento no PandaDoc. Tenta novamente em alguns segundos.',
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send the document for signature
    const sendRes = await fetch(`${PANDADOC_API}/documents/${pandadocDocId}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandadocApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Segue o contrato de incubação para assinatura digital bilateral.`,
        silent: false,
      }),
    })

    if (!sendRes.ok) {
      const sendErr = await sendRes.text()
      await supabase.from('startup_contracts').update({
        signature_status: 'ready_to_send',
        provider_last_error: `Send failed [${sendRes.status}]: ${sendErr.slice(0, 500)}`,
        provider_last_sync_at: new Date().toISOString(),
      }).eq('id', contractId)

      const friendlyError = sendRes.status === 403
        ? 'PandaDoc rejeitou o envio (403). Esta API key não tem permissão para enviar em nome da organização.'
        : `PandaDoc send failed [${sendRes.status}]`

      return new Response(JSON.stringify({
        error: friendlyError,
        details: sendErr.slice(0, 500),
      }), {
        status: sendRes.status === 403 ? 403 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await supabase.from('startup_contracts').update({
      signature_status: 'sent_for_signature',
      provider_sent_at: new Date().toISOString(),
      provider_last_event: 'document.sent',
      provider_last_sync_at: new Date().toISOString(),
      provider_last_error: null,
      founder_signer_status: 'sent',
      counter_signer_status: counterSignerEmail ? 'pending' : null,
    }).eq('id', contractId)

    await supabase.from('activity_log').insert({
      user_id: user.id,
      entity_type: 'contract',
      entity_id: contractId,
      action: 'sent_for_signature_pandadoc',
      metadata: {
        pandadoc_document_id: pandadocDocId,
        founder_signer: signerEmail,
        counter_signer: counterSignerEmail || 'none',
        bilateral: !!counterSignerEmail,
      },
    })

    return new Response(JSON.stringify({
      status: 'sent',
      provider: 'pandadoc',
      documentId: pandadocDocId,
      bilateral: !!counterSignerEmail,
      counterSigner: counterSignerEmail || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('PandaDoc error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown PandaDoc error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
