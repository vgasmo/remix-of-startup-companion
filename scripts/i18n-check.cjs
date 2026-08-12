#!/usr/bin/env node
/**
 * i18n Key Parity & Completeness Check (STRICT)
 *
 * Ensures EN and PT locale files have identical key sets and no empty values.
 * Exit code 1 on ANY failure so CI gates block.
 *
 * IMPORTANT: Run i18n-sync.cjs BEFORE this script to auto-fill missing keys.
 * release-check.sh does this automatically.
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../src/i18n/locales');
const EN_PATH = path.join(LOCALES_DIR, 'en.json');
const PT_PATH = path.join(LOCALES_DIR, 'pt.json');

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return acc.concat(flattenKeys(value, fullKey));
    }
    acc.push({ key: fullKey, value });
    return acc;
  }, []);
}

function run() {
  if (!fs.existsSync(EN_PATH) || !fs.existsSync(PT_PATH)) {
    console.error('❌ Missing locale files. Expected en.json and pt.json in src/i18n/locales/');
    process.exit(1);
  }

  const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf-8'));
  const pt = JSON.parse(fs.readFileSync(PT_PATH, 'utf-8'));

  const enEntries = flattenKeys(en);
  const ptEntries = flattenKeys(pt);

  const enKeys = new Set(enEntries.map(e => e.key));
  const ptKeys = new Set(ptEntries.map(e => e.key));

  const errors = [];

  // Keys in EN but missing from PT
  const missingInPt = [...enKeys].filter(k => !ptKeys.has(k));
  if (missingInPt.length > 0) {
    errors.push(`\n🇵🇹 Missing in pt.json (${missingInPt.length}):`);
    missingInPt.slice(0, 30).forEach(k => errors.push(`  - ${k}`));
    if (missingInPt.length > 30) errors.push(`  ... and ${missingInPt.length - 30} more`);
  }

  // Keys in PT but missing from EN
  const missingInEn = [...ptKeys].filter(k => !enKeys.has(k));
  if (missingInEn.length > 0) {
    errors.push(`\n🇬🇧 Missing in en.json (${missingInEn.length}):`);
    missingInEn.slice(0, 30).forEach(k => errors.push(`  - ${k}`));
    if (missingInEn.length > 30) errors.push(`  ... and ${missingInEn.length - 30} more`);
  }

  // Empty values in EN
  const emptyEn = enEntries.filter(e => (typeof e.value === 'string' && e.value.trim() === '') || e.value === null);
  if (emptyEn.length > 0) {
    errors.push(`\n🇬🇧 Empty values in en.json (${emptyEn.length}):`);
    emptyEn.forEach(e => errors.push(`  - ${e.key}`));
  }

  // Empty values in PT
  const emptyPt = ptEntries.filter(e => (typeof e.value === 'string' && e.value.trim() === '') || e.value === null);
  if (emptyPt.length > 0) {
    errors.push(`\n🇵🇹 Empty values in pt.json (${emptyPt.length}):`);
    emptyPt.forEach(e => errors.push(`  - ${e.key}`));
  }

  if (errors.length > 0) {
    console.error('❌ i18n Parity Check FAILED');
    errors.forEach(e => console.error(e));
    console.error(`\n  EN keys: ${enKeys.size}  |  PT keys: ${ptKeys.size}`);
    console.error('\n  💡 Run: node scripts/i18n-sync.cjs to auto-fix missing keys.');
    process.exit(1);
  }

  console.log(`✅ i18n Parity Check PASSED — ${enKeys.size} keys in sync, no empty values.`);
  process.exit(0);
}

run();
