// RC11: locale files carry root-level keys with dots ("common.cancel": "...") that i18next never resolves
// (keySeparator '.') and that make scripts/rc5/i18n-quality*.mjs fail. Modes:
//   node rc11-i18n-flat-keys.mjs report <localesDir>   -> table of flat keys vs nested definitions
//   node rc11-i18n-flat-keys.mjs fix <localesDir> [patch.json] -> remove flat keys; when the nested key is missing and the
//        flat value is a real string, move it; apply optional patch {pt:{...},en:{...}} of nested values; print leftovers.
import { readFileSync, writeFileSync } from 'node:fs';
const [mode, dir = 'src/i18n/locales', patchPath] = process.argv.slice(2);
const isKeyPath = (v) => typeof v === 'string' && /^[a-z]+(\.[A-Za-z0-9_]+)+$/.test(v);
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const set = (o, p, v) => { const parts = p.split('.'); let n = o; for (const k of parts.slice(0, -1)) { if (typeof n[k] !== 'object' || n[k] === null) n[k] = {}; n = n[k]; } n[parts.at(-1)] = v; };
const patch = patchPath ? JSON.parse(readFileSync(patchPath, 'utf8')) : null;
const leftovers = {};
for (const lang of ['pt', 'en']) {
  const file = `${dir}/${lang}.json`;
  const cat = JSON.parse(readFileSync(file, 'utf8'));
  // dotted keys never resolve with keySeparator '.'; keys with spaces, commas, parentheses or colons are extraction
  // artefacts (PostgREST select strings mistaken for t() keys) and are removed when the value repeats the key
  const flat = Object.keys(cat).filter((k) => k.includes('.') || (/[\s,():]/.test(k) && cat[k] === k));
  if (mode === 'report') {
    console.log(`\n== ${lang}.json: ${flat.length} root-level dotted keys ==`);
    for (const k of flat) {
      const nested = get(cat, k);
      const status = nested === undefined ? (isKeyPath(cat[k]) ? 'MISSING+junk-value' : 'MISSING (flat value usable)') : (typeof nested === 'object' ? 'nested is object' : 'nested exists');
      console.log(`${k} | flat=${JSON.stringify(cat[k])} | nested=${JSON.stringify(nested)} | ${status}`);
    }
    continue;
  }
  let moved = 0, removed = 0, patched = 0;
  for (const k of flat) {
    const nested = get(cat, k);
    if (nested === undefined && typeof cat[k] === 'string' && !isKeyPath(cat[k])) { set(cat, k, cat[k]); moved++; }
    delete cat[k]; removed++;
  }
  if (patch && patch[lang]) for (const [k, v] of Object.entries(patch[lang])) { set(cat, k, v); patched++; }
  for (const k of flat) { if (!k.includes('.') || /[\s,():]/.test(k)) continue; const v = get(cat, k); if (v === undefined || isKeyPath(v)) (leftovers[lang] ||= []).push(k); }
  writeFileSync(file, JSON.stringify(cat, null, 2) + '\n');
  console.log(`${lang}: removed ${removed} flat keys, moved ${moved} values into nested keys, patched ${patched}`);
}
if (mode === 'fix') {
  for (const [lang, keys] of Object.entries(leftovers)) console.log(`${lang}: still missing or junk (${keys.length}): ${keys.join(', ')}`);
}
