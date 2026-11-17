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
  if (url.pathname === '/rest/v1/startup_contracts') {
    if (req.method === 'PATCH') { patches.push(await req.json()); return new Response(null, { status: 204 }) }
    return json(CONTRACT)
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

addEventListener('unload', () => { globalThis.fetch = realFetch })
