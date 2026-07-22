#!/usr/bin/env node
// Batch H — Deno typecheck for changed edge functions.
// Scope: files under supabase/functions/**/index.ts changed vs merge-base with origin/main.
// Behaviour:
//   * If `deno` is not installed, exit 127 with a clear message (verify.mjs will fail).
//   * If nothing changed, exit 0 (no-op).
//   * Otherwise run `deno check` per changed function; any non-zero exits non-zero.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function sh(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

const deno = sh('deno', ['--version']);
if (deno.status !== 0) {
  console.error('[rc5:deno-check] deno CLI not found on PATH. Install Deno >= 1.44.');
  process.exit(127);
}

// Determine merge base — fall back to HEAD~1 if origin/main isn't fetched.
let base = sh('git', ['merge-base', 'origin/main', 'HEAD']).stdout.trim();
if (!base) base = sh('git', ['rev-parse', 'HEAD~1']).stdout.trim();

const diff = sh('git', ['diff', '--name-only', `${base}...HEAD`]);
if (diff.status !== 0) {
  console.error('[rc5:deno-check] git diff failed');
  process.exit(diff.status ?? 1);
}

const changed = diff.stdout
  .split('\n')
  .map((f) => f.trim())
  .filter((f) => f.startsWith('supabase/functions/') && f.endsWith('/index.ts'));

if (changed.length === 0) {
  console.log('[rc5:deno-check] no changed edge functions — skipping.');
  process.exit(0);
}

let failed = 0;
for (const rel of changed) {
  const abs = resolve(process.cwd(), rel);
  if (!existsSync(abs)) {
    console.log(`[rc5:deno-check] ${rel} deleted, skipping.`);
    continue;
  }
  console.log(`▶ deno check ${rel}`);
  const r = spawnSync('deno', ['check', '--no-lock', abs], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

process.exit(failed === 0 ? 0 : 1);
