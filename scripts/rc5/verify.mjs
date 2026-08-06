#!/usr/bin/env node
// RC5 verification orchestrator — cross-platform (Node/Bun on macOS/Linux/Windows).
// Contract:
//   * Deletes previous results at start.
//   * Runs local quality gates + staging gates in strict mode.
//   * Any missing tool, missing secret, skipped suite, or NOT PROVEN result => exit non-zero.
//   * Refuses known production project refs.
//   * Never prints secret values (only names + redacted refs).
//   * Records timestamp, git SHA, staging project ref, per-step exit codes into results.json.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, 'docs/rc5');
const RESULTS_JSON = resolve(OUT_DIR, 'results.json');
const RESULTS_MD = resolve(OUT_DIR, 'results.md');
const PROD_PROJECT_REF = 'apxzuslwhjujgrcsfzqw';
const PROD_HOST_HINTS = ['leiria-launchpad-pro.lovable.app', 'startupleiria.com'];

// --- reset results ---
mkdirSync(OUT_DIR, { recursive: true });
for (const f of [RESULTS_JSON, RESULTS_MD]) if (existsSync(f)) rmSync(f);

const STARTED_AT = new Date().toISOString();
const gitSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || 'unknown';
const gitBranch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || 'unknown';

function redactRef(url) {
  if (!url) return null;
  const m = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  return m ? `${m[1].slice(0, 4)}…${m[1].slice(-2)}` : 'invalid';
}
const stagingRef = redactRef(process.env.STAGING_SUPABASE_URL || '');

// --- production guard ---
const stagingUrl = process.env.STAGING_SUPABASE_URL || '';
const stagingApp = process.env.STAGING_APP_URL || '';
if (stagingUrl.includes(PROD_PROJECT_REF)) fatal(`STAGING_SUPABASE_URL matches production ref ${PROD_PROJECT_REF}. Refusing.`);
if (PROD_HOST_HINTS.some((h) => stagingApp.includes(h))) fatal('STAGING_APP_URL points at production. Refusing.');

const steps = [];

function record(name, status, code, durationMs, note) {
  steps.push({ name, status, exit_code: code, duration_ms: durationMs, note: note ?? null });
}

function run(name, cmd, args, opts = {}) {
  console.log(`\n▶ ${name}: ${cmd} ${args.join(' ')}`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, env: process.env, ...opts });
  const dt = Date.now() - t0;
  const code = r.status ?? (r.error ? 127 : 1);
  if (r.error && r.error.code === 'ENOENT') {
    record(name, 'fail', 127, dt, `tool not found: ${cmd}`);
    finalise('fail', `Missing tool: ${cmd}. Install it or run in an environment that provides it.`);
  }
  if (code !== 0) {
    record(name, 'fail', code, dt);
    finalise('fail', `Step "${name}" exited ${code}.`);
  }
  record(name, 'pass', 0, dt);
}

function fatal(msg) {
  console.error(`[rc5:verify] FATAL — ${msg}`);
  finalise('fail', msg);
}

function finalise(overall, reason) {
  const finishedAt = new Date().toISOString();
  const payload = {
    started_at: STARTED_AT,
    finished_at: finishedAt,
    overall,
    reason: reason ?? null,
    source: { git_sha: gitSha, git_branch: gitBranch },
    target: { staging_project_ref_redacted: stagingRef, staging_app_url_set: Boolean(stagingApp) },
    env_mode: process.env.RC5_ALLOW_STAGING_TESTS === 'true' ? 'staging' : 'local-only',
    steps,
  };
  writeFileSync(RESULTS_JSON, JSON.stringify(payload, null, 2));
  const rows = steps.map((s) => `| ${s.name} | ${s.status} | ${s.exit_code} | ${s.duration_ms} | ${s.note ?? ''} |`).join('\n');
  writeFileSync(
    RESULTS_MD,
    `# RC5 verification results\n\n- Started: ${STARTED_AT}\n- Finished: ${finishedAt}\n- Overall: **${overall}**\n- Reason: ${reason ?? '-'}\n- Git: ${gitBranch}@${gitSha}\n- Staging ref: ${stagingRef ?? '-'}\n\n| Step | Status | Exit | Duration (ms) | Note |\n|---|---|---|---|---|\n${rows}\n`,
  );
  process.exit(overall === 'pass' ? 0 : 1);
}

// ---------- LOCAL GATES ----------
run('install', 'bun', ['install', '--frozen-lockfile']);
run('typecheck', 'bunx', ['tsgo', '-p', 'tsconfig.typecheck.json', '--noEmit']);
run('lint', 'bun', ['run', 'lint']);
run('build', 'bun', ['run', 'build']);
run('vitest:run:1', 'bunx', ['vitest', 'run']);
run('vitest:run:2', 'bunx', ['vitest', 'run']);
run('vitest:run:3', 'bunx', ['vitest', 'run']);
run('i18n:parity', 'node', ['scripts/i18n-check.cjs']);
run('i18n:lint', 'node', ['scripts/i18n-lint.mjs']);
run('secret:scan', 'node', ['scripts/secret-scan.cjs']);
run('migration:scan', 'node', ['scripts/ci/scan-migrations.mjs']);
run('size-limit', 'bunx', ['size-limit']);
// Batch 0: full-tree Deno assurance replaces the changed-only check, which could
// not observe pre-existing errors in _shared/**.
run('deno:check-all', 'node', ['scripts/rc5/deno-check-all.mjs']);


// ---------- STAGING GATES ----------
// Strict: absence of RC5_ALLOW_STAGING_TESTS => overall fail (NO-GO).
if (process.env.RC5_ALLOW_STAGING_TESTS !== 'true') {
  record('staging:gate', 'fail', 2, 0, "RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed");
  finalise('fail', "Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.");
}

run('preflight', 'node', ['scripts/rc5/preflight.mjs']);
run('migrate:fresh-replay', 'node', ['scripts/rc5/migrate-fresh-replay.mjs']);
run('migrate:forward', 'node', ['scripts/rc5/migrate-forward.mjs']);
run('seed', 'node', ['scripts/rc5/seed.mjs']);
run('pgtap:rls', 'node', ['scripts/rc5/run-pgtap.mjs']);
run('rc5:concurrency', 'node', ['scripts/rc5/concurrency-log-session.mjs']);
run('automation:reconcile', 'node', ['scripts/rc5/reconcile-automations.mjs']);
run('e2e:personas', 'bunx', ['playwright', 'test', '--project=staging-personas']);
run('e2e:failure-inj', 'bunx', ['playwright', 'test', '--project=failure-injection']);
run('probe:graph', 'node', ['scripts/rc5/probe-graph.mjs']);
run('probe:email', 'node', ['scripts/rc5/probe-email.mjs']);
run('cleanup', 'node', ['scripts/rc5/cleanup.mjs']);


finalise('pass', null);
