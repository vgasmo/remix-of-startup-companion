#!/usr/bin/env node
// Read-only catalogue reconciliation. Never schedules, invokes or repairs jobs.
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { parseManifest, reconcileManifest } from './automation-manifest.mjs';

async function main() {
  const value = process.env.STAGING_DATABASE_URL;
  if (!value) throw new Error('STAGING_DATABASE_URL is required (isolated environment).');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('invalid_database_protocol');
  if (value.includes('apxzuslwhjujgrcsfzqw')) throw new Error('production_connection_refused');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && process.env.RC5_ALLOW_STAGING_TESTS !== 'true') throw new Error('explicit_staging_opt_in_required');
  const manifest = parseManifest(readFileSync(new URL('../../docs/rc5/automation-manifest.md', import.meta.url), 'utf8'));
  const client = new Client({ connectionString: value, connectionTimeoutMillis: 10000, query_timeout: 15000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const { rows: crons } = await client.query('SELECT jobname, schedule, command, active FROM cron.job');
    const { rows: health } = await client.query('SELECT job_name, expected_cadence_seconds, enabled FROM public.automation_health_expectations');
    const drift = reconcileManifest(manifest, crons, health);
    await client.query('ROLLBACK');
    if (drift.length) { for (const d of drift) console.error(d); throw new Error(`${drift.length} manifest drift(s)`); }
    console.log(`reconcile-automations: OK · ${manifest.length} entries · ${crons.length} schedules`);
  } finally { await client.end(); }
}
main().catch(() => { console.error('reconcile-automations: verification failed; connection details and raw database errors are not logged.'); process.exitCode = 2; });
