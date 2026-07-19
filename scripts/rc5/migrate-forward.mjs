#!/usr/bin/env node
// Forward-apply the current migration set to staging via the Supabase CLI.
// Requires `supabase` CLI, STAGING_DATABASE_URL, and RC5_ALLOW_STAGING_TESTS=true.

import { spawnSync } from 'node:child_process';

const die = (m) => { console.error(`[rc5:migrate-forward] FAIL — ${m}`); process.exit(1); };

if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') die("RC5_ALLOW_STAGING_TESTS must be 'true'.");
const dbUrl = process.env.STAGING_DATABASE_URL || '';
if (!dbUrl) die('STAGING_DATABASE_URL is required.');
if (dbUrl.includes('apxzuslwhjujgrcsfzqw')) die('STAGING_DATABASE_URL references the production project ref. Refusing.');
if (spawnSync('supabase', ['--version'], { stdio: 'ignore' }).status !== 0) die('`supabase` CLI not found on PATH.');

const r = spawnSync('supabase', ['db', 'push', '--db-url', dbUrl], { stdio: 'inherit' });
if (r.status !== 0) die(`supabase db push exited ${r.status}.`);
console.log('[rc5:migrate-forward] OK.');
