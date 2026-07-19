#!/usr/bin/env node
// Deterministic seed for RC5 staging E2E. Every row uses the rc5-e2e- namespace
// so cleanup.mjs can remove exactly what seed inserted — no broader deletes.

import { createClient } from '@supabase/supabase-js';

const NS = 'rc5-e2e-';
const die = (m) => { console.error(`[rc5:seed] FAIL — ${m}`); process.exit(1); };

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be 'true'.");
const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die('STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY required.');
if (url.includes('apxzuslwhjujgrcsfzqw')) die('URL points at production. Refusing.');

const supa = createClient(url, key, { auth: { persistSession: false } });

// Idempotent — upsert by namespaced natural key.
const { error: eStartup } = await supa
  .from('startups')
  .upsert([{ name: `${NS}alpha`, stage: 'validation' }], { onConflict: 'name' });
if (eStartup) die(`startups upsert: ${eStartup.message}`);

const { error: eWs } = await supa
  .from('workspaces')
  .upsert([{ name: `${NS}alpha-ws`, status: 'active' }], { onConflict: 'name' });
if (eWs) die(`workspaces upsert: ${eWs.message}`);

const { error: eLink } = await supa
  .from('public_booking_links')
  .upsert([{ slug: `${NS}book`, active: true }], { onConflict: 'slug' });
if (eLink) die(`public_booking_links upsert: ${eLink.message}`);

console.log('[rc5:seed] OK — deterministic namespace-scoped rows in place.');
