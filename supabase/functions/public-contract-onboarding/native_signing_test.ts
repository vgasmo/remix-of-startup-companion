// Native signing flow tests with fake data only: every network call is mocked,
// so no real contract, database row or email is touched.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'

Deno.env.set('SUPABASE_URL', 'http://fake.local')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
Deno.env.set('PUBLIC_APP_URL', 'https://app.test')

let handler: (req: Request) => Promise<Response>
// deno-lint-ignore no-explicit-any
;(Deno as any).serve = (h: any) => { handler = h; return {} }

const CONTRACT = {
  id: '00000000-0000-4000-8000-000000000001', status: 'pending_signature', signature_status: null,
  signature_provider: null, contract_number: 'INC-TEST-001', organization_name: 'Teste Lda',
  legal_representative_email: 'founder@test.invalid', legal_representative_name: 'Ana Teste',
}
let resendStatus = 200
let resendCalls = 0
let patches: unknown[] = []
let publicContract = { ...CONTRACT, signature_provider: null as string | null, signature_status: null as string | null, regulation_accepted_at: null as string | null, onboarding_token_expires_at: null as string | null }
let signatureFailure = false
let signatureCommands: Record<string, unknown>[] = []
const realFetch = globalThis.fetch
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init)
  const url = new URL(req.url)
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  if (url.host === 'api.resend.com') { resendCalls++; return resendStatus === 200 ? json({ id: 'x' }) : new Response('provider down', { status: resendStatus }) }
  if (url.pathname === '/auth/v1/user') return json({ id: 'staff-1', aud: 'authenticated', role: 'authenticated' })
  if (url.pathname === '/rest/v1/rpc/is_account_active') return json(true)
  if (url.pathname === '/rest/v1/contract_intakes') return json({ status: 'approved_for_signature' })
  if (url.pathname === '/rest/v1/user_roles') return json([{ role: 'admin' }])
  if (url.pathname === '/rest/v1/rpc/issue_contract_signing_grant') return json([{ nonce: 'test-single-use-grant' }])
  if (url.pathname === '/rest/v1/rpc/apply_contract_signature_atomic') {
    signatureCommands.push(await req.json())
    return signatureFailure ? json({ message: 'database unavailable', code: 'XX000' }, 500) : json({ signature_status: 'completed' })
  }
  if (url.pathname === '/rest/v1/startup_contracts') {
    if (req.method === 'PATCH') {
      patches.push(await req.json())
      return url.searchParams.has('select') ? json([]) : new Response(null, { status: 204 })
    }
    return json(url.searchParams.has('onboarding_token_hash') ? publicContract : CONTRACT)
  }
  throw new Error(`Unexpected network call in test: ${req.method} ${url}`)
}

await import('./index.ts')

const call = (body: unknown) => handler(new Request('http://fn.local', {
  method: 'POST', headers: { Authorization: 'Bearer staff-jwt', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))

Deno.test('generate_token emails the native signing link and defaults to native signature', async () => {
  Deno.env.set('RESEND_API_KEY', 'fake'); resendStatus = 200; resendCalls = 0; patches = []
  const res = await call({ action: 'generate_token', contractId: CONTRACT.id })
  const data = await res.json()
  assertEquals(res.status, 200)
  assertEquals(data.emailSent, true)
  assertEquals(resendCalls, 1)
  assert(String(data.url).startsWith('https://app.test/contract-signing/'))
  // deno-lint-ignore no-explicit-any
  assertEquals((patches[0] as any).signature_provider, 'assinatura_digital')
  // only the hash is stored, never the raw token
  // deno-lint-ignore no-explicit-any
  assert((patches[0] as any).onboarding_token_hash !== data.token)
})

Deno.test('generate_token reports email failure honestly but still returns the link', async () => {
  resendStatus = 500; patches = []
  const res = await call({ action: 'generate_token', contractId: CONTRACT.id })
  const data = await res.json()
  assertEquals(res.status, 200)
  assertEquals(data.emailSent, false)
  assert(String(data.emailError).includes('Resend 500'))
  assert(data.url)
})

Deno.test('generate_token reports failure when the email service is not configured', async () => {
  Deno.env.delete('RESEND_API_KEY'); resendCalls = 0
  const data = await (await call({ action: 'generate_token', contractId: CONTRACT.id })).json()
  assertEquals(data.emailSent, false)
  assertEquals(resendCalls, 0)
})

for (const provider of ['docusign', 'pandadoc']) {
  Deno.test(`staff_submit_signing refuses ${provider}`, async () => {
    const res = await call({ action: 'staff_submit_signing', contractId: CONTRACT.id, signatureProvider: provider })
    assertEquals(res.status, 422)
    assertEquals((await res.json()).error, 'signature_provider_disabled')
  })
}

const signingRequest = {
  action: 'digital_sign', token: 'test-only-link',
  signatureData: { typed_name: 'Ana Teste', signer_email: 'founder@test.invalid', signer_nif: '123456789', user_agent: 'test-browser' },
  consent: { eidas_ack: true, timestamp: '2026-11-17T19:00:00Z', ip: '' },
}

function readyForSigning() {
  publicContract = { ...CONTRACT, signature_provider: 'assinatura_digital', signature_status: 'sent_for_signature', regulation_accepted_at: '2026-11-17T18:00:00Z', onboarding_token_expires_at: null }
  signatureCommands = []; patches = []; signatureFailure = false
}

Deno.test('native signature refuses signing before regulation acceptance', async () => {
  readyForSigning(); publicContract.regulation_accepted_at = null
  const res = await call(signingRequest)
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, 'signing_not_ready')
  assertEquals(signatureCommands.length, 0)
})

Deno.test('native signature requires explicit consent', async () => {
  readyForSigning()
  const res = await call({ ...signingRequest, consent: { ...signingRequest.consent, eidas_ack: false } })
  assertEquals(res.status, 400)
  assertEquals((await res.json()).error, 'consent_required')
  assertEquals(signatureCommands.length, 0)
})

Deno.test('native signature records proof and honestly reports deferred activation', async () => {
  readyForSigning(); resendCalls = 0
  const res = await call(signingRequest)
  const result = await res.json()
  assertEquals(res.status, 200)
  assertEquals(result.status, 'signed')
  assertEquals(result.activation_pending, true)
  assertEquals(signatureCommands.length, 1)
  const command = signatureCommands[0]
  const proof = command.p_evidence as Record<string, unknown>
  assertEquals(command.p_grant_nonce, 'test-single-use-grant')
  assertEquals(String(command.p_document_sha256).length, 64)
  assertEquals(String(command.p_canonical_payload_sha256).length, 64)
  assertEquals(proof.typed_name, 'Ana Teste')
  assertEquals(proof.signer_email, 'founder@test.invalid')
  assertEquals(proof.qualified, false)
  assertEquals((proof.consent as Record<string, unknown>).eidas_ack, true)
  assert(Number.isFinite(Date.parse(String(proof.signed_at))))
  assertEquals((patches[0] as Record<string, unknown>).signature_proof_json, proof)
  assertEquals(resendCalls, 0)
})

Deno.test('native signature does not report success or activate after an atomic recording failure', async () => {
  readyForSigning(); signatureFailure = true
  const res = await call(signingRequest)
  assertEquals(res.status, 500)
  assertEquals((await res.json()).error, 'Failed to record signature')
  assertEquals(patches.length, 0)
})

Deno.test('expired public signing link cannot record a signature', async () => {
  readyForSigning(); publicContract.onboarding_token_expires_at = '2000-01-01T00:00:00Z'
  const res = await call(signingRequest)
  assertEquals(res.status, 410)
  assertEquals((await res.json()).error, 'Token expired')
  assertEquals(signatureCommands.length, 0)
})

addEventListener('unload', () => { globalThis.fetch = realFetch })
