#!/usr/bin/env node
// Batch 0 — FULL-TREE Deno typecheck for every TypeScript file under supabase/functions.
// Replaces the changed-only assurance (scripts/rc5/deno-check-changed.mjs), which could not
// see pre-existing errors such as a dead remote module URL or a BufferSource mismatch.
//
// Behaviour:
//   * deno missing            => exit 127 (loud, never a silent skip)
//   * any file fails to check => exit 1, with the full list printed
//   * success                 => exit 0 and print the file count

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'supabase/functions');

const deno = spawnSync('deno', ['--version'], { encoding: 'utf8' });
if (deno.status !== 0) {
  console.error('[rc5:deno-check-all] deno CLI not found on PATH. Install Deno >= 2.x.');
  process.exit(127);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(abs);
  }
  return out;
}

const files = walk(ROOT).sort();
if (files.length === 0) {
  console.error('[rc5:deno-check-all] no edge TypeScript files found — refusing to report success.');
  process.exit(1);
}

console.log(`[rc5:deno-check-all] checking ${files.length} edge TypeScript files…`);
const r = spawnSync('deno', ['check', '--no-lock', ...files], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error(`[rc5:deno-check-all] FAILED (exit ${r.status}) — full-tree Deno check must be green.`);
  process.exit(r.status ?? 1);
}
console.log(`[rc5:deno-check-all] PASS — ${files.length} files typecheck clean.`);
process.exit(0);
