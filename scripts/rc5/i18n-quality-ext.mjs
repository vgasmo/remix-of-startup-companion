// scripts/rc5/i18n-quality-ext.mjs — uso: node scripts/rc5/i18n-quality-ext.mjs [dir]
import { readFileSync } from 'node:fs';
const dir = process.argv[2] ?? 'src/i18n/locales';
const PT = JSON.parse(readFileSync(`${dir}/pt.json`, 'utf8'));
const EN = JSON.parse(readFileSync(`${dir}/en.json`, 'utf8'));
const flat = (o, p = '', r = {}) => { for (const [k, v] of Object.entries(o)) { const kk = p ? `${p}.${k}` : k; v && typeof v === 'object' ? flat(v, kk, r) : (r[kk] = v); } return r; };
const pt = flat(PT), en = flat(EN);
const VAR = /\{\{\s*([^}\s,]+)\s*(?:,[^}]*)?\}\}/g;
const vars = (s) => new Set([...String(s).matchAll(VAR)].map((m) => m[1]));
const humanize = (leaf) => leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
const EN_PT = /\b(the|and|to|of|for|with|your|you|this|is|are|during|another|complete|configuration|invalid|valid|rows|first|over|before|reminders?|timing|how|due|on|last|generated|suggested|insights|contact|main|missing|across|programs|export|phone|month|select|duplicates|errors|expected|format|importing|synced|sent|logged|recomputed|deactivated|role)\b/i;
const ALLOW = new Set(['admin.groups.insights', 'dashboard.insights', 'financialPanel.insights', 'inbox.tab.insights', 'glossary.b2b', 'glossary.b2c', 'crm.import.hint']);
const problems = [];
for (const [k, v] of Object.entries(pt)) {
  if (ALLOW.has(k)) continue;
  const leaf = k.split('.').at(-1);
  if (/^[a-z]+(\.[A-Za-z0-9_]+)+$/.test(v)) problems.push(`pt.${k}: value is an i18n key → "${v}"`);
  if (/\S\s+(Desc|Placeholder|Hint|Button|Confirm|Confirmar)$/.test(v.trim()) && v.split(' ').length <= 5) problems.push(`pt.${k}: key-name placeholder → "${v}"`);
  if (v === en[k] && /^[A-Z]?[a-z]+[A-Z]/.test(leaf) && v.toLowerCase().replace(/[^a-z ]/g, '').trim() === humanize(leaf) && EN_PT.test(v)) problems.push(`pt.${k}: humanized English key → "${v}"`);
  if (/[ =]$/.test(v) && !/[.:!?…] $/.test(v)) problems.push(`pt.${k}: truncated value → "${v}"`);
  if (/[A-Za-zÀ-ÿ]\{\{\s/.test(v)) problems.push(`pt.${k}: placeholder glued to text → "${v}"`);
  if (v.includes('${')) problems.push(`pt.${k}: JS template literal → "${v}"`);
  if (EN_PT.test(v.replace(VAR, ' ')) && v === en[k] && /[a-z]{3}/.test(v)) problems.push(`pt.${k}: identical to EN → "${v}"`);
  const a = vars(v), b = vars(en[k] ?? '');
  if ([...a].some((x) => !b.has(x)) || [...b].some((x) => !a.has(x))) problems.push(`${k}: pt/en placeholders differ (${[...a]} vs ${[...b]})`);
}
for (const [k, v] of Object.entries(en)) if (/^[a-z]+(\.[A-Za-z0-9_]+)+$/.test(v)) problems.push(`en.${k}: value is an i18n key → "${v}"`);
if (problems.length) { console.error(`❌ ${problems.length} problem(s)`); for (const p of problems) console.error(' •', p); process.exit(1); }
console.log('✅ extra i18n checks passed');
