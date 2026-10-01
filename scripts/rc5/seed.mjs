#!/usr/bin/env node
// Deterministic seed for RC5 staging E2E. Every row uses a fixed e2e00000-...
// id namespace so cleanup.mjs can remove exactly what seed inserted — no
// broader deletes. Columns below match the real schema (startups.name,
// workspaces without a name column, public_booking_links.label/token_hash).

import { createClient } from '@supabase/supabase-js';

const NS = 'rc5-e2e-';
const die = (m) => { console.error(`[rc5:seed] FAIL — ${m}`); process.exit(1); };

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be 'true'.");
const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die('STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY required.');
if (url.includes('apxzuslwhjujgrcsfzqw')) die('URL points at production. Refusing.');

const supa = createClient(url, key, { auth: { persistSession: false } });

const SEED = {
  program: 'e2e00000-0000-4000-8000-000000000001',
  startup: 'e2e00000-0000-4000-8000-000000000002',
  workspace: 'e2e00000-0000-4000-8000-000000000003',
  link: 'e2e00000-0000-4000-8000-000000000004',
};
const { createHash } = await import('node:crypto');
const steps = [
  ['programs', { id: SEED.program, name: `${NS}program` }],
  ['startups', { id: SEED.startup, name: `${NS}alpha` }],
  ['workspaces', { id: SEED.workspace, startup_id: SEED.startup, program_id: SEED.program, status: 'active' }],
  ['public_booking_links', { id: SEED.link, label: `${NS}book`, active: true,
    token_hash: createHash('sha256').update(`${NS}book`).digest('hex') }],
];
for (const [table, row] of steps) {
  const { error } = await supa.from(table).upsert([row], { onConflict: 'id' });
  if (error) die(`${table} upsert: ${error.message}`);
}
console.log(`[rc5:seed] OK — RC5_TEST_WORKSPACE_ID=${SEED.workspace}`);
