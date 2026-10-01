#!/usr/bin/env node
// RC5 cleanup — deletes only rows carrying the rc5-e2e- namespace, in an order
// that respects foreign keys (workspaces before startups/programs).
// Refuses to run against production. Never prints secrets.

import { createClient } from '@supabase/supabase-js';

const NS = 'rc5-e2e-';
const PROD_PROJECT_REF = 'apxzuslwhjujgrcsfzqw';

function die(msg) {
  console.error(`[rc5:cleanup] FAIL — ${msg}`);
  process.exit(1);
}

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be 'true'.");
const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die('STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY are required.');
if (url.includes(PROD_PROJECT_REF)) die('URL points at production. Aborting.');

const supa = createClient(url, key, { auth: { persistSession: false } });

// Only tables that seed.mjs writes into. workspaces is deleted first (by id)
// so the startups/programs rows it references can then be removed by name.
const targets = [
  { table: 'workspaces', col: 'id', op: 'eq', val: 'e2e00000-0000-4000-8000-000000000003' },
  { table: 'startups', col: 'name', op: 'like', val: `${NS}%` },
  { table: 'programs', col: 'name', op: 'like', val: `${NS}%` },
  { table: 'funnel_items', col: 'organization_name', op: 'like', val: `${NS}%` },
  { table: 'public_booking_links', col: 'label', op: 'like', val: `${NS}%` },
  { table: 'workspace_invitations', col: 'email', op: 'like', val: `${NS}%` },
  { table: 'mentor_bookings', col: 'idempotency_key', op: 'like', val: `${NS}%` },
  { table: 'notification_ledger', col: 'business_key', op: 'like', val: `${NS}%` },
];

let total = 0;
for (const t of targets) {
  const q = supa.from(t.table).delete();
  const { data, error } = await (t.op === 'eq' ? q.eq(t.col, t.val) : q.like(t.col, t.val)).select('id');
  if (error) {
    console.error(`[rc5:cleanup] ${t.table} error: ${error.message}`);
    process.exit(2);
  }
  const n = data?.length ?? 0;
  total += n;
  console.log(`[rc5:cleanup] ${t.table}: removed ${n} rows`);
}

console.log(`[rc5:cleanup] OK — total ${total} rows removed. Namespace-scoped, no other data touched.`);
