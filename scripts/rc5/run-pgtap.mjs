#!/usr/bin/env node
// Execute pgTAP suite (supabase/tests/*.test.sql) against staging via pg_prove.
// Requires: pg_prove on PATH, STAGING_DATABASE_URL, RC5_ALLOW_STAGING_TESTS=true.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const die = (m) => { console.error(`[rc5:pgtap] FAIL — ${m}`); process.exit(1); };

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be 'true'.");
const dbUrl = process.env.STAGING_DATABASE_URL || '';
if (!dbUrl) die('STAGING_DATABASE_URL is required.');
if (dbUrl.includes('apxzuslwhjujgrcsfzqw')) die('STAGING_DATABASE_URL references production. Refusing.');
if (spawnSync('pg_prove', ['--version'], { stdio: 'ignore' }).status !== 0) die('`pg_prove` not found on PATH.');

const dir = resolve('supabase/tests');
const files = readdirSync(dir).filter((f) => f.endsWith('.test.sql')).map((f) => resolve(dir, f));
if (!files.length) die('No pgTAP .test.sql files found under supabase/tests.');

console.log(`[rc5:pgtap] Executing ${files.length} pgTAP file(s):`);
for (const f of files) console.log(`  - ${f}`);

const r = spawnSync('pg_prove', ['--dbname', dbUrl, '--ext', '.sql', ...files], { stdio: 'inherit' });
if (r.status !== 0) die(`pg_prove exited ${r.status}.`);
console.log('[rc5:pgtap] OK.');
