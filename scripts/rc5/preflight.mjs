#!/usr/bin/env node
// RC5 preflight guard. Refuses to run against production.
// Usage: RC5_ALLOW_STAGING_TESTS=true node scripts/rc5/preflight.mjs

const PROD_PROJECT_REF = 'apxzuslwhjujgrcsfzqw';
const REQUIRED = [
  'STAGING_SUPABASE_URL',
  'STAGING_SUPABASE_ANON_KEY',
  'STAGING_SUPABASE_SERVICE_ROLE_KEY',
  'STAGING_APP_URL',
  'RC5_TEST_FOUNDER_EMAIL',
  'RC5_TEST_FOUNDER_PASSWORD',
  'RC5_TEST_CONSULTANT_EMAIL',
  'RC5_TEST_CONSULTANT_PASSWORD',
  'RC5_TEST_MENTOR_EMAIL',
  'RC5_TEST_MENTOR_PASSWORD',
  'RC5_TEST_ADMIN_EMAIL',
  'RC5_TEST_ADMIN_PASSWORD',
  'RC5_TEST_BACKOFFICE_EMAIL',
  'RC5_TEST_BACKOFFICE_PASSWORD',
  'STAGING_CRON_SECRET',
];

function die(msg) {
  console.error(`[rc5:preflight] FAIL — ${msg}`);
  process.exit(1);
}

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') {
  die("RC5_ALLOW_STAGING_TESTS must be exactly 'true' to proceed.");
}

const url = process.env.STAGING_SUPABASE_URL ?? '';
if (!url) die('STAGING_SUPABASE_URL is not set.');
if (url.includes(PROD_PROJECT_REF)) {
  die(`STAGING_SUPABASE_URL points at the production project ref (${PROD_PROJECT_REF}). Aborting.`);
}
if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
  die(`STAGING_SUPABASE_URL is not a well-formed Supabase project URL: ${url.replace(/[a-z0-9]{16,}/, '<redacted>')}`);
}

const appUrl = process.env.STAGING_APP_URL ?? '';
if (appUrl.includes('leiria-launchpad-pro.lovable.app') || appUrl.includes('startupleiria.com')) {
  die('STAGING_APP_URL points at production. Aborting.');
}

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) die(`Missing required env vars: ${missing.join(', ')}`);

// Never print secret values. Only names.
console.log('[rc5:preflight] OK — all required secrets present, staging URL confirmed non-production.');
console.log('[rc5:preflight] Namespace guard: rc5-e2e-');
