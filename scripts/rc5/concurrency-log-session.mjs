#!/usr/bin/env node
// RC5 Batch A — true two-connection concurrency probe for
// public.log_completed_session_atomic.
//
// Refuses to run against production. Never silently skips: exits non-zero
// with a labelled reason when the required env is missing.
//
// Invariants proven when a non-production DB is provided:
//   1. Two independent psql-level sessions issuing the SAME command_id with
//      the SAME actor/workspace/payload race to a single sessions row.
//   2. Two independent sessions issuing the SAME command_id with DIFFERENT
//      payloads: one wins, the other receives 42501 (fingerprint mismatch)
//      — never a silent duplicate.
//   3. The unique index on (command_id, created_by, workspace_id,
//      command_fingerprint) is the ultimate guard; count(*)=1 after the race.

import pg from 'pg';
import { randomUUID } from 'node:crypto';

const die = (msg, code = 1) => {
  console.error(`[rc5:concurrency] FAIL — ${msg}`);
  process.exit(code);
};

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') {
  die("RC5_ALLOW_STAGING_TESTS must be 'true'. This test never silently skips.");
}
const dbUrl = process.env.STAGING_DATABASE_URL || '';
if (!dbUrl) die('STAGING_DATABASE_URL is required.');
if (dbUrl.includes('apxzuslwhjujgrcsfzqw')) {
  die('STAGING_DATABASE_URL references the production project ref. Refusing to run.');
}

const workspaceId = process.env.RC5_TEST_WORKSPACE_ID;
const actorId = process.env.RC5_TEST_ACTOR_ID;
if (!workspaceId || !actorId) {
  die('RC5_TEST_WORKSPACE_ID and RC5_TEST_ACTOR_ID must be seeded before this test.');
}

const iso = () => new Date().toISOString();
const client = () => new pg.Client({ connectionString: dbUrl });

async function callRpc(c, { commandId, title }) {
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [actorId]);
  try {
    const r = await c.query(
      `SELECT public.log_completed_session_atomic(
         $1::uuid, $2::uuid, $3::text,
         now() - interval '1 hour', 30,
         $4::uuid, NULL, 'general', 'off_platform') AS out`,
      [commandId, workspaceId, title, actorId],
    );
    return { ok: true, out: r.rows[0].out };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

async function scenario(label, fn) {
  console.log(`[${iso()}] ${label} — START`);
  const t0 = Date.now();
  const r = await fn();
  console.log(`[${iso()}] ${label} — ${r.pass ? 'PASS' : 'FAIL'} (${Date.now() - t0}ms) ${r.note ?? ''}`);
  if (!r.pass) die(`${label}: ${r.note}`);
}

const [a, b] = [client(), client()];
await Promise.all([a.connect(), b.connect()]);

try {
  // Scenario 1: identical command_id + identical payload race
  await scenario('C1 identical command + identical payload race', async () => {
    const commandId = randomUUID();
    const title = `rc5-conc-${commandId}`;
    // Barrier: both start LISTEN, then a NOTIFY releases them simultaneously.
    await a.query('LISTEN rc5_conc_go');
    await b.query('LISTEN rc5_conc_go');
    const pA = (async () => { await new Promise((r) => a.once('notification', r)); return callRpc(a, { commandId, title }); })();
    const pB = (async () => { await new Promise((r) => b.once('notification', r)); return callRpc(b, { commandId, title }); })();
    await new Promise((r) => setTimeout(r, 25));
    const notifier = client(); await notifier.connect();
    await notifier.query(`NOTIFY rc5_conc_go`); await notifier.end();
    const [ra, rb] = await Promise.all([pA, pB]);
    const okCount = [ra, rb].filter((x) => x.ok).length;
    if (okCount !== 2) return { pass: false, note: `expected both to succeed under identical payload; got ${JSON.stringify([ra, rb])}` };
    const chk = await a.query(`SELECT count(*)::int c FROM public.sessions WHERE command_id=$1`, [commandId]);
    if (chk.rows[0].c !== 1) return { pass: false, note: `expected 1 sessions row, got ${chk.rows[0].c}` };
    return { pass: true, note: `1 row, both callers observed idempotent success` };
  });

  // Scenario 2: identical command_id + divergent payload race
  await scenario('C2 identical command + divergent payload race', async () => {
    const commandId = randomUUID();
    const pA = callRpc(a, { commandId, title: 'race-A' });
    const pB = callRpc(b, { commandId, title: 'race-B' });
    const [ra, rb] = await Promise.all([pA, pB]);
    const okCount = [ra, rb].filter((x) => x.ok).length;
    const rejected = [ra, rb].find((x) => !x.ok);
    if (okCount !== 1 || !rejected || rejected.code !== '42501') {
      return { pass: false, note: `expected exactly 1 success + 1×42501 fingerprint mismatch; got ${JSON.stringify([ra, rb])}` };
    }
    const chk = await a.query(`SELECT count(*)::int c FROM public.sessions WHERE command_id=$1`, [commandId]);
    if (chk.rows[0].c !== 1) return { pass: false, note: `expected 1 sessions row, got ${chk.rows[0].c}` };
    return { pass: true, note: 'one 42501 fingerprint mismatch, no duplicate row' };
  });
} finally {
  await Promise.all([a.end(), b.end()]);
}

console.log(`[${iso()}] rc5:concurrency OK`);
