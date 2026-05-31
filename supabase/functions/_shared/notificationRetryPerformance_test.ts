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
      ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
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

Deno.test("performance indexes exist on notifications table", { ignore: !DB_URL }, async () => {
  const { stdout } = await psql(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'notifications'
      AND indexname IN ('idx_notifications_user_created_at', 'notifications_event_key_user_unique')
    ORDER BY indexname;
  `);

  const hasCreatedAt = stdout.includes("idx_notifications_user_created_at");
  const hasEventKey = stdout.includes("notifications_event_key_user_unique");

  assertEquals(
    hasCreatedAt,
    true,
    "missing index idx_notifications_user_created_at on (user_id, created_at DESC)",
  );
  assertEquals(
    hasEventKey,
    true,
    "missing unique index notifications_event_key_user_unique on (user_id, event_key)",
  );
});
