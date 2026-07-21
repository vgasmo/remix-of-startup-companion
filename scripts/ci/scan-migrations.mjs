#!/usr/bin/env node
/**
 * A4: reject person-specific data operations in supabase/migrations/*.sql.
 *
 * Fails if a migration file contains:
 *   - a real email address (RFC-ish match), unless the file is on the allowlist;
 *   - bare-UUID DML (INSERT/UPDATE/DELETE) with a specific UUID literal, unless
 *     the file is on the allowlist.
 *
 * Data reconciliation for live rows must happen through forward-only operational
 * RPCs, not through the repeatable database lifecycle. See
 * docs/rc5/migration-policy.md.
 *
 * Allowlist: scripts/ci/migration-scan-allowlist.txt (one filename per line).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const ROOT = process.cwd();
const MIG_DIR = resolve(ROOT, 'supabase/migrations');
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/ci/migration-scan-allowlist.txt');

const allowlist = new Set(
  existsSync(ALLOWLIST_PATH)
    ? readFileSync(ALLOWLIST_PATH, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    : [],
);

// Anchored email regex; excludes placeholders like user@example.com,
// test@test.com, and the noreply@... system addresses embedded in
// notification templates.
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'test.com', 'test.local',
  'localhost',
]);
const PLACEHOLDER_LOCALPARTS = new Set(['noreply', 'no-reply', 'support', 'admin', 'hello']);

// Specific-UUID DML: INSERT / UPDATE / DELETE that name a literal UUID string.
const UUID_LITERAL_RE = /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/gi;
const DML_STMT_RE = /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b[\s\S]*?;/gi;

const findings = [];

if (!existsSync(MIG_DIR)) {
  console.log('[scan-migrations] no supabase/migrations directory — nothing to scan');
  process.exit(0);
}

const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  if (allowlist.has(file)) continue;
  const full = resolve(MIG_DIR, file);
  const src = readFileSync(full, 'utf8');

  // Strip line and block comments before matching so `-- example@foo.com` and
  // `/* fixture UUID … */` do not trigger the scanner.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');

  // Emails.
  const emails = stripped.match(EMAIL_RE) ?? [];
  for (const email of emails) {
    const [local, domain] = email.toLowerCase().split('@');
    if (PLACEHOLDER_DOMAINS.has(domain)) continue;
    if (PLACEHOLDER_LOCALPARTS.has(local) && !PLACEHOLDER_DOMAINS.has(domain)) {
      // noreply@startupleiria.com etc. — still allowed only for system domains
      // handled explicitly by the ops policy; scanner remains strict here.
    }
    findings.push({ file, kind: 'email', match: email });
  }

  // UUID-in-DML.
  const dmlChunks = stripped.match(DML_STMT_RE) ?? [];
  for (const chunk of dmlChunks) {
    const uuids = chunk.match(UUID_LITERAL_RE) ?? [];
    if (uuids.length > 0) {
      findings.push({
        file,
        kind: 'uuid_dml',
        match: uuids.slice(0, 3).join(', '),
        preview: chunk.replace(/\s+/g, ' ').slice(0, 120),
      });
    }
  }
}

if (findings.length === 0) {
  console.log(`[scan-migrations] OK — scanned ${files.length} files, no person-specific data operations`);
  process.exit(0);
}

console.error(`[scan-migrations] FAIL — ${findings.length} finding(s)`);
for (const f of findings) {
  console.error(` - ${f.file} [${f.kind}] ${f.match}${f.preview ? `\n     ${f.preview}` : ''}`);
}
console.error(
  '\nPerson-specific data must not live in supabase/migrations/*.sql.\n' +
  'Move it to a forward-only operational RPC (see docs/rc5/migration-policy.md),\n' +
  'or, if the file is a documented exception, add its basename to\n' +
  'scripts/ci/migration-scan-allowlist.txt with a comment explaining why.',
);
process.exit(1);
