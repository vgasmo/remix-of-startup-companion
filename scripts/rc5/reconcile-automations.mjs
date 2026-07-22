#!/usr/bin/env node
/**
 * RC5 · Batch G1 — Automation manifest reconciler.
 *
 * READ-ONLY. Refuses to touch production. Cross-checks:
 *   - docs/rc5/automation-manifest.md
 *   - public.automation_health_expectations
 *   - cron.job (pg_cron catalogue)
 *
 * Exits non-zero on any drift so CI blocks releases that add a cron
 * without also registering it in the manifest + health registry.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const PROD_REF = "apxzuslwhjujgrcsfzqw";

function fail(msg) {
  console.error(`reconcile-automations: ${msg}`);
  process.exit(2);
}

function parseManifest(md) {
  const rows = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| name") || line.startsWith("|---")) continue;
    const cols = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cols.length < 7) continue;
    rows.push({
      name: cols[0],
      trigger: cols[1],
      cadence: Number(cols[2]),
      target: cols[3].replaceAll("`", ""),
      owner: cols[4],
      flag: cols[5] === "—" ? "" : cols[5],
      health: cols[6] === "—" ? "" : cols[6],
    });
  }
  return rows;
}

async function main() {
  const dbUrl = process.env.STAGING_DATABASE_URL;
  if (!dbUrl) fail("STAGING_DATABASE_URL is required (non-prod).");
  if (dbUrl.includes(PROD_REF)) fail("refusing to run against production ref.");

  const manifest = parseManifest(readFileSync("docs/rc5/automation-manifest.md", "utf8"));
  if (manifest.length === 0) fail("manifest is empty or unparseable.");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const { rows: crons } = await client.query(
    `SELECT jobname, schedule, command FROM cron.job`
  );
  const { rows: health } = await client.query(
    `SELECT job_name FROM public.automation_health_expectations`
  );
  await client.end();

  const cronNames = new Set(crons.map((r) => r.jobname));
  const healthNames = new Set(health.map((r) => r.job_name));

  const drift = [];

  for (const row of manifest) {
    if (row.trigger === "cron" && !cronNames.has(row.name)) {
      drift.push(`missing_schedule: ${row.name}`);
    }
    if (row.trigger !== "cron" && cronNames.has(row.name)) {
      drift.push(`dead_cron: ${row.name} declared ${row.trigger} but pg_cron row exists`);
    }
    if (row.health && row.health !== "no_health_expectation" && !healthNames.has(row.health)) {
      drift.push(`missing_registry: ${row.name} → health=${row.health}`);
    }
  }

  const manifestNames = new Set(manifest.map((r) => r.name));
  for (const cron of crons) {
    if (!manifestNames.has(cron.jobname)) {
      drift.push(`unregistered_cron: ${cron.jobname}`);
    }
  }

  if (drift.length > 0) {
    for (const d of drift) console.error(`  ✗ ${d}`);
    fail(`${drift.length} manifest drift(s).`);
  }

  console.log(`reconcile-automations: OK · ${manifest.length} manifest rows · ${crons.length} pg_cron rows.`);
}

main().catch((err) => fail(err.message ?? String(err)));
