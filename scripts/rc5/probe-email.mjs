#!/usr/bin/env node
// Email sandbox probe. Sends one message via the sandbox provider (Resend test key or Mailtrap sink).
// Fails closed on missing vars or non-2xx response. Recipient must live inside the rc5-e2e- inbox convention.

const die = (m) => { console.error(`[rc5:probe-email] FAIL — ${m}`); process.exit(1); };

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be 'true'.");
const key = process.env.RC5_EMAIL_SANDBOX_API_KEY;
const from = process.env.RC5_EMAIL_SANDBOX_FROM;
const to = process.env.RC5_EMAIL_SANDBOX_TO;
if (!key || !from || !to) die('RC5_EMAIL_SANDBOX_API_KEY, RC5_EMAIL_SANDBOX_FROM, RC5_EMAIL_SANDBOX_TO are required.');
if (!to.startsWith('rc5-e2e-') && !to.includes('+rc5-e2e-')) die('Recipient must be in the rc5-e2e- namespace (e.g. rc5-e2e-inbox@…).');

const endpoint = process.env.RC5_EMAIL_SANDBOX_ENDPOINT || 'https://api.resend.com/emails';
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
  body: JSON.stringify({ from, to, subject: 'rc5-e2e-probe', text: 'rc5 verification probe' }),
});
if (!res.ok) die(`Email sandbox returned ${res.status}.`);
console.log('[rc5:probe-email] OK — sandbox accepted the message.');
