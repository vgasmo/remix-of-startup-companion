#!/usr/bin/env node
// Fresh replay of every migration into a disposable Postgres.
// Requires:
//   RC5_DISPOSABLE_DATABASE_URL — a throwaway Postgres (e.g. ephemeral Docker) the operator provisions.
//   `psql` on PATH.
// Refuses to run against the production project ref.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const die = (m) => { console.error(`[rc5:migrate-fresh-replay] FAIL — ${m}`); process.exit(1); };

const url = process.env.RC5_DISPOSABLE_DATABASE_URL || '';
if (!url) die('RC5_DISPOSABLE_DATABASE_URL is required (a disposable Postgres, not staging, not production).');
if (url.includes('apxzuslwhjujgrcsfzqw')) die('RC5_DISPOSABLE_DATABASE_URL references production. Refusing.');
if (spawnSync('psql', ['--version'], { stdio: 'ignore' }).status !== 0) die('`psql` not found on PATH.');

const dir = resolve('supabase/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) die('No migrations found under supabase/migrations.');

console.log(`[rc5:migrate-fresh-replay] Replaying ${files.length} migrations against disposable DB.`);
// Reset schema to prove replay from empty state.
let r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'], { stdio: 'inherit' });
if (r.status !== 0) die(`Reset failed (exit ${r.status}).`);

for (const f of files) {
  const p = resolve(dir, f);
  r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', p], { stdio: 'inherit' });
  if (r.status !== 0) die(`Migration ${f} failed (exit ${r.status}).`);
}
console.log('[rc5:migrate-fresh-replay] OK.');
