#!/usr/bin/env node
// Batch 0 / P2 — semantic i18n quality gate.
// Parity (scripts/i18n-check.cjs) proves keys exist; it cannot see English text
// sitting inside pt.json. This gate fails loudly on English leakage in PT-PT and
// on obvious placeholder/fallback strings in either locale.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PT = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/locales/pt.json'), 'utf8'));
const EN = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/locales/en.json'), 'utf8'));

// English markers that never legitimately appear in PT-PT product copy.
const EN_LEAK = /\b(failed to|please (?:wait|enter|select|fill|configure|save|check|allow|upload)|the following|match the|should contain|permission denied|dry run|unsupported)\b/i;
// Strings that look like unfinished work in any locale.
const PLACEHOLDER = /^(tbd|todo|fixme|xxx|lorem|placeholder|\.\.\.)$/i;

function walk(obj, visit, path = '') {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) walk(v, visit, path ? `${path}.${k}` : k);
  } else if (typeof obj === 'string') {
    visit(path, obj);
  }
}

const problems = [];
walk(PT, (key, value) => {
  if (EN_LEAK.test(value)) problems.push(`pt.${key}: English leakage → "${value}"`);
  if (PLACEHOLDER.test(value.trim())) problems.push(`pt.${key}: placeholder → "${value}"`);
});
walk(EN, (key, value) => {
  if (PLACEHOLDER.test(value.trim())) problems.push(`en.${key}: placeholder → "${value}"`);
});

if (problems.length > 0) {
  console.error(`❌ i18n quality FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`   • ${p}`);
  process.exit(1);
}
console.log('✅ i18n quality PASSED — no English leakage or placeholder strings.');
