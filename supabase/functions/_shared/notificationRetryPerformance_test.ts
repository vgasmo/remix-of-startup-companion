import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { documentUploadedKey } from "./notificationEventKey.ts";

const DB_URL = Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_DB_URL") || "";

/**
 * Helper: runs a SQL command via psql and returns { stdout, stderr, code }.
 */
async function psql(sql: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmd = new Deno.Command("psql", {
    args: [DB_URL, "-c", sql, "--tuples-only"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    stdout: new TextDecoder().decode(stdout).trim(),
    stderr: new TextDecoder().decode(stderr).trim(),
    code,
  };
}

async function psqlFile(sql: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmd = new Deno.Command("psql", {
    args: [DB_URL, "-c", sql],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    stdout: new TextDecoder().decode(stdout).trim(),
    stderr: new TextDecoder().decode(stderr).trim(),
    code,
  };
}

Deno.test("upsert retries do not create duplicates and stay fast", { ignore: !DB_URL }, async () => {
  const testUserId = crypto.randomUUID();
  const testEventKey = documentUploadedKey("perf-doc-1", testUserId);
  const iterations = 50;

  // Cleanup any pre-existing test rows
  await psql(`DELETE FROM public.notifications WHERE event_key = '${testEventKey}'`);

  const start = performance.now();

  // Fire many concurrent upserts simulating retries
  const upserts = Array.from({ length: iterations }).map(() =>
    psql(`
      INSERT INTO public.notifications (user_id, type, title, event_key, read)
      VALUES ('${testUserId}', 'test', 'Performance test', '${testEventKey}', false)
      ON CONFLICT (user_id, event_key) DO NOTHING;
    `)
  );
  const results = await Promise.all(upserts);

  const elapsed = performance.now() - start;

  // Verify all SQL commands succeeded
  const failures = results.filter((r) => r.code !== 0);
  assertEquals(failures.length, 0, `some upserts failed: ${failures.map((f) => f.stderr).join("; ")}`);

  // Verify only one row exists despite 50 retries
  const { stdout: countStr } = await psql(`
    SELECT COUNT(*) FROM public.notifications WHERE event_key = '${testEventKey}';
  `);
  const count = parseInt(countStr, 10);
  assertEquals(count, 1, `expected exactly 1 notification after ${iterations} retries, got ${count}`);

  // Performance assertion: 50 concurrent upserts should finish in under 3 seconds
  // on a healthy indexed table. This catches missing indexes or lock contention.
  assertEquals(
    elapsed < 3000,
    true,
    `expected ${iterations} concurrent upserts to finish under 3s, took ${elapsed.toFixed(0)}ms`,
  );

  // Cleanup
  await psql(`DELETE FROM public.notifications WHERE event_key = '${testEventKey}'`);
});

Deno.test("created_at index is used for user notification list query", { ignore: !DB_URL }, async () => {
  const testUserId = crypto.randomUUID();

  // Explain the typical query pattern from useNotifications
  const { stdout } = await psqlFile(`
    EXPLAIN (FORMAT JSON)
    SELECT id, user_id, type, title, message, link, read, created_at, metadata, entity_type, entity_id
    FROM public.notifications
    WHERE user_id = '${testUserId}'
    ORDER BY created_at DESC
    LIMIT 50;
  `);

  // The output should mention an index scan rather than a sequential scan
  const plan = stdout.toLowerCase();
  const usesIndexScan = plan.includes("index") && !plan.includes("seq scan");
  assertEquals(
    usesIndexScan,
    true,
    `expected query plan to use an index scan, got: ${stdout}`,
  );
});
