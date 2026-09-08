#!/usr/bin/env node
// Creates (idempotently) the five RC5 test personas in the STAGING project and
// assigns their roles. Never runs against production. Never prints passwords.
//
// Usage:
//   RC5_ALLOW_STAGING_TESTS=true node scripts/rc5/seed-personas.mjs

import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'apxzuslwhjujgrcsfzqw';
const die = (m) => { console.error(`[rc5:personas] FAIL — ${m}`); process.exit(1); };

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be exactly 'true'.");

const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die('STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY are required.');
if (url.includes(PROD_REF)) die('STAGING_SUPABASE_URL points at production. Refusing.');

const PERSONAS = [
  { env: 'FOUNDER', role: 'founder', name: 'RC5 Founder' },
  { env: 'CONSULTANT', role: 'consultor', name: 'RC5 Consultor' },
  { env: 'MENTOR', role: 'mentor_externo', name: 'RC5 Mentor' },
  { env: 'ADMIN', role: 'admin', name: 'RC5 Admin' },
  { env: 'BACKOFFICE', role: 'backoffice', name: 'RC5 Backoffice' },
];

const missing = PERSONAS.flatMap(({ env }) =>
  [`RC5_TEST_${env}_EMAIL`, `RC5_TEST_${env}_PASSWORD`].filter((k) => !process.env[k]),
);
if (missing.length) die(`Missing env vars: ${missing.join(', ')}`);

const supa = createClient(url, key, { auth: { persistSession: false } });

for (const p of PERSONAS) {
  const email = process.env[`RC5_TEST_${p.env}_EMAIL`];
  const password = process.env[`RC5_TEST_${p.env}_PASSWORD`];

  // Look up by email through the admin list (paginated defensively).
  let userId = null;
  for (let page = 1; page <= 20 && !userId; page += 1) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
    if (error) die(`listUsers page ${page}: ${error.message}`);
    if (!data?.users?.length) break;
    userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
  }

  if (!userId) {
    const { data, error } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.name, rc5_persona: p.role },
    });
    if (error) die(`createUser ${p.role}: ${error.message}`);
    userId = data.user.id;
    console.log(`[rc5:personas] created ${p.role}`);
  } else {
    const { error } = await supa.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) die(`updateUser ${p.role}: ${error.message}`);
    console.log(`[rc5:personas] refreshed ${p.role}`);
  }

  const { error: eProfile } = await supa
    .from('profiles')
    .upsert({ id: userId, email, full_name: p.name, account_status: 'approved' }, { onConflict: 'id' });
  if (eProfile) die(`profiles upsert ${p.role}: ${eProfile.message}`);

  const { error: eRole } = await supa
    .from('user_roles')
    .upsert({ user_id: userId, role: p.role }, { onConflict: 'user_id,role' });
  if (eRole) die(`user_roles upsert ${p.role}: ${eRole.message}`);
}

console.log(`[rc5:personas] OK — ${PERSONAS.length} personas ready (no secrets printed).`);
