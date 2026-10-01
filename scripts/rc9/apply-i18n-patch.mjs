// scripts/rc9/apply-i18n-patch.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const [patchPath, dir = 'src/i18n/locales'] = process.argv.slice(2);
const patch = JSON.parse(readFileSync(patchPath, 'utf8'));
const walk = (root, key, create) => {
  const parts = key.split('.');
  let node = root;
  for (const p of parts.slice(0, -1)) {
    if (!(p in node)) { if (!create) throw new Error(`missing parent for ${key}`); node[p] = {}; }
    node = node[p];
    if (typeof node !== 'object' || node === null) throw new Error(`parent of ${key} is not an object`);
  }
  return [node, parts.at(-1)];
};
for (const lang of ['pt', 'en']) {
  const file = `${dir}/${lang}.json`;
  const cat = JSON.parse(readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(patch[lang].update)) { const [n, l] = walk(cat, k, false); if (!(l in n)) throw new Error(`${lang}: update of missing key ${k}`); n[l] = v; }
  for (const [k, v] of Object.entries(patch[lang].add)) { const [n, l] = walk(cat, k, true); if (l in n && n[l] !== v) console.warn(`${lang}: ${k} já existia — fica o valor do anexo`); n[l] = v; }
  for (const k of patch.remove) { const [n, l] = walk(cat, k, false); if (!(l in n)) throw new Error(`${lang}: remove of missing key ${k}`); delete n[l]; }
  writeFileSync(file, JSON.stringify(cat, null, 2) + '\n');
  console.log(`${lang}: ${Object.keys(patch[lang].update).length} updated, ${Object.keys(patch[lang].add).length} added, ${patch.remove.length} removed`);
}
