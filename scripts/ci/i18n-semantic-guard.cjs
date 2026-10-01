#!/usr/bin/env node
// Falha só se o i18n-sync alterar CONTEÚDO (chaves ou valores); ignora a ordem das chaves.
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(process.cwd(), 'src/i18n/locales');
const SNAP = path.resolve(process.cwd(), '.i18n-snapshot.json');
const flat = (o, p = '', r = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const kk = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, kk, r); else r[kk] = v;
  }
  return r;
};
const read = () => Object.fromEntries(['pt', 'en'].map((l) => [l, flat(JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8')))]));
const mode = process.argv[2];
if (mode === 'snapshot') { fs.writeFileSync(SNAP, JSON.stringify(read())); console.log('i18n snapshot saved'); process.exit(0); }
if (mode !== 'compare') { console.error('usage: snapshot | compare'); process.exit(2); }
const before = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const after = read();
const problems = [];
for (const l of ['pt', 'en']) {
  const b = before[l], a = after[l];
  for (const k of Object.keys(a)) if (!(k in b)) problems.push(`${l}: chave em falta no catálogo → ${k} = ${JSON.stringify(a[k])}`);
  for (const k of Object.keys(b)) if (!(k in a)) problems.push(`${l}: chave removida pelo sync → ${k}`);
  for (const k of Object.keys(a)) if (k in b && a[k] !== b[k]) problems.push(`${l}: valor alterado pelo sync → ${k}: ${JSON.stringify(b[k])} → ${JSON.stringify(a[k])}`);
}
if (problems.length) {
  console.error(`❌ i18n fora de sincronia (${problems.length}). Acrescente as chaves com tradução revista, não a gerada:`);
  for (const p of problems.slice(0, 80)) console.error(' •', p);
  process.exit(1);
}
console.log('✅ i18n: conteúdo em sincronia (ordem das chaves ignorada)');
