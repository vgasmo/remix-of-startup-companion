/**
 * Unit tests for the webhook inbox helpers used by docusign-webhook and
 * pandadoc-webhook. These lock in idempotency, PII scrubbing and terminal
 * state semantics without requiring a live Supabase.
 */
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  claimWebhookDelivery,
  markInboxProcessed,
  scrubWebhookPreview,
  sha256Hex,
  TERMINAL_SIGNATURE_STATUSES,
  type InboxClaimInput,
} from "./webhookInbox.ts";

// ─── sha256Hex ────────────────────────────────────────────────────────────
Deno.test("sha256Hex is deterministic and 64 hex chars", async () => {
  const a = await sha256Hex('{"event":"envelope-completed","envelope":"e1"}');
  const b = await sha256Hex('{"event":"envelope-completed","envelope":"e1"}');
  assertEquals(a, b);
  assertEquals(a.length, 64);
  assert(/^[0-9a-f]{64}$/.test(a), "hex-only output");
});

Deno.test("sha256Hex differs for whitespace-different payloads", async () => {
  // Providers occasionally reserialize on retry; hash MUST be computed on the
  // raw body received, not on a re-serialized object — this test documents
  // that whitespace changes the hash so callers stay honest.
  const a = await sha256Hex('{"a":1,"b":2}');
  const b = await sha256Hex('{"a":1, "b":2}');
  assertNotEquals(a, b);
});

// ─── TERMINAL_SIGNATURE_STATUSES ──────────────────────────────────────────
Deno.test("terminal statuses match the finalized signature lifecycle", () => {
  assert(TERMINAL_SIGNATURE_STATUSES.has("completed"));
  assert(TERMINAL_SIGNATURE_STATUSES.has("voided"));
  assert(TERMINAL_SIGNATURE_STATUSES.has("declined"));
  // Non-terminal — must not be included, or a late "sent" event would be
  // treated as terminal and swallowed.
  assert(!TERMINAL_SIGNATURE_STATUSES.has("sent_for_signature"));
  assert(!TERMINAL_SIGNATURE_STATUSES.has("viewed"));
  assert(!TERMINAL_SIGNATURE_STATUSES.has("draft"));
});

// ─── scrubWebhookPreview ──────────────────────────────────────────────────
Deno.test("scrubWebhookPreview masks emails and phone numbers in strings", () => {
  const out = scrubWebhookPreview(
    "signer alice@example.com phoned +351 912 345 678 about envelope 42",
  );
  assertStringIncludes(out, "[email]");
  assertStringIncludes(out, "[phone]");
  assert(!out.includes("alice@example.com"));
  assert(!out.includes("912 345 678"));
});

Deno.test("scrubWebhookPreview redacts PII keys inside JSON payloads", () => {
  const payload = JSON.stringify({
    event: "envelope-completed",
    data: {
      envelopeId: "env-1",
      recipients: [
        { email: "bob@example.com", first_name: "Bob", nif: "123456789" },
      ],
    },
  });
  const out = scrubWebhookPreview(payload);
  const obj = JSON.parse(out);
  assertEquals(obj.event, "envelope-completed");
  assertEquals(obj.data.envelopeId, "env-1");
  assertEquals(obj.data.recipients[0].email, "[redacted]");
  assertEquals(obj.data.recipients[0].first_name, "[redacted]");
  assertEquals(obj.data.recipients[0].nif, "[redacted]");
});

Deno.test("scrubWebhookPreview caps output length", () => {
  const huge = JSON.stringify({ blob: "x".repeat(10_000) });
  const out = scrubWebhookPreview(huge, 500);
  assert(out.length <= 500, `expected <=500, got ${out.length}`);
});

Deno.test("scrubWebhookPreview tolerates non-JSON input", () => {
  const out = scrubWebhookPreview("raw xml <Email>alice@example.com</Email>", 2000);
  assertStringIncludes(out, "[email]");
});

// ─── claimWebhookDelivery — mock supabase ─────────────────────────────────
type Insert = { table: string; row: Record<string, unknown> };

function makeMockSupabase(behavior: "ok" | "duplicate" | "error") {
  const calls: Insert[] = [];
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, row });
          return {
            select() {
              return {
                single: async () => {
                  if (behavior === "ok") {
                    return { data: { id: "inbox-1" }, error: null };
                  }
                  if (behavior === "duplicate") {
                    return {
                      data: null,
                      error: {
                        code: "23505",
                        message: "unique_violation",
                      },
                    };
                  }
                  return {
                    data: null,
                    error: { code: "XX000", message: "boom" },
                  };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          calls.push({ table: `${table}:update`, row: patch });
          return {
            eq: async () => ({ data: null, error: null }),
          };
        },
      };
    },
  };
  return { client, calls };
}

const baseInput: InboxClaimInput = {
  provider: "docusign",
  eventId: "evt-1",
  payloadHash: "a".repeat(64),
  eventName: "envelope-completed",
  contractId: null,
  rawBodyPreview: '{"event":"envelope-completed"}',
};

Deno.test("claimWebhookDelivery: fresh delivery returns inbox id", async () => {
  const { client, calls } = makeMockSupabase("ok");
  const result = await claimWebhookDelivery(client, baseInput);
  assertEquals(result.ok, true);
  assertEquals(result.duplicate, false);
  assertEquals(result.inboxId, "inbox-1");
  assertEquals(calls[0].table, "webhook_inbox");
  assertEquals((calls[0].row as { provider: string }).provider, "docusign");
  assertEquals(
    (calls[0].row as { event_id: string }).event_id,
    "evt-1",
    "provider-issued event id must be forwarded verbatim",
  );
});

Deno.test("claimWebhookDelivery: duplicate 23505 is treated as ok+duplicate, never surfaced as 5xx", async () => {
  const { client } = makeMockSupabase("duplicate");
  const result = await claimWebhookDelivery(client, baseInput);
  assertEquals(result.ok, true);
  assertEquals(result.duplicate, true);
  assertEquals(result.inboxId, null);
  assertEquals(result.error, undefined);
});

Deno.test("claimWebhookDelivery: non-unique DB error is surfaced so provider retries", async () => {
  const { client } = makeMockSupabase("error");
  const result = await claimWebhookDelivery(client, baseInput);
  assertEquals(result.ok, false);
  assertEquals(result.duplicate, false);
  assertEquals(result.inboxId, null);
  assertEquals(result.error, "boom");
});

Deno.test("claimWebhookDelivery: null event_id (XML deliveries) still inserts — dedupe falls back to payload_hash", async () => {
  const { client, calls } = makeMockSupabase("ok");
  const result = await claimWebhookDelivery(client, {
    ...baseInput,
    eventId: null,
  });
  assertEquals(result.ok, true);
  assertEquals((calls[0].row as { event_id: string | null }).event_id, null);
  assertEquals(
    (calls[0].row as { payload_hash: string }).payload_hash,
    baseInput.payloadHash,
  );
});

Deno.test("claimWebhookDelivery: raw_body_preview is capped at 2000 chars even if caller sends more", async () => {
  const { client, calls } = makeMockSupabase("ok");
  await claimWebhookDelivery(client, {
    ...baseInput,
    rawBodyPreview: "y".repeat(5000),
  });
  const preview = (calls[0].row as { raw_body_preview: string })
    .raw_body_preview;
  assertEquals(preview.length, 2000);
});

// ─── markInboxProcessed ───────────────────────────────────────────────────
Deno.test("markInboxProcessed is a no-op when inboxId is null (duplicate path)", async () => {
  const { client, calls } = makeMockSupabase("ok");
  await markInboxProcessed(client, null, { status: "processed" });
  assertEquals(calls.length, 0);
});

Deno.test("markInboxProcessed swallows DB errors (best-effort audit)", async () => {
  // A throwing client must not propagate — the primary work already succeeded
  // and re-raising here would cause the provider to retry a fully-applied event.
  const throwingClient = {
    from() {
      return {
        update() {
          return {
            eq: () => {
              throw new Error("write failed");
            },
          };
        },
      };
    },
  };
  await markInboxProcessed(throwingClient, "inbox-1", {
    status: "processed",
    httpStatus: 200,
  });
  // no assertion — reaching this line proves the throw was swallowed
});

// ─── Retry simulation ─────────────────────────────────────────────────────
Deno.test("retry simulation: same event_id delivered N times yields exactly one claim", async () => {
  // Simulate an inbox keyed by (provider,event_id) — the first insert wins,
  // every subsequent one raises 23505 which claimWebhookDelivery reports as
  // duplicate=true.
  const store = new Set<string>();
  const client = {
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          const key = `${row.provider}:${row.event_id ?? row.payload_hash}`;
          const isDup = store.has(key);
          if (!isDup) store.add(key);
          return {
            select() {
              return {
                single: async () =>
                  isDup
                    ? {
                        data: null,
                        error: { code: "23505", message: "dup" },
                      }
                    : { data: { id: `id-${store.size}` }, error: null },
              };
            },
          };
        },
      };
    },
  };

  const input: InboxClaimInput = { ...baseInput, eventId: "evt-retry" };
  const first = await claimWebhookDelivery(client, input);
  const second = await claimWebhookDelivery(client, input);
  const third = await claimWebhookDelivery(client, input);

  assertEquals(first.duplicate, false);
  assertEquals(first.inboxId, "id-1");
  assertEquals(second.duplicate, true);
  assertEquals(third.duplicate, true);
  assertEquals(store.size, 1, "only one row survives across retries");
});

Deno.test("retry simulation: XML-style deliveries (event_id=null) dedupe on payload_hash", async () => {
  const store = new Set<string>();
  const client = {
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          const key = `${row.provider}:${row.event_id ?? row.payload_hash}`;
          const isDup = store.has(key);
          if (!isDup) store.add(key);
          return {
            select() {
              return {
                single: async () =>
                  isDup
                    ? {
                        data: null,
                        error: { code: "23505", message: "dup" },
                      }
                    : { data: { id: `id-${store.size}` }, error: null },
              };
            },
          };
        },
      };
    },
  };

  const hash = await sha256Hex("<xml>same</xml>");
  const input: InboxClaimInput = {
    ...baseInput,
    eventId: null,
    payloadHash: hash,
  };

  const first = await claimWebhookDelivery(client, input);
  const second = await claimWebhookDelivery(client, input);
  assertEquals(first.duplicate, false);
  assertEquals(second.duplicate, true);

  // A distinct payload gets a distinct hash → new claim.
  const differentHash = await sha256Hex("<xml>different</xml>");
  const third = await claimWebhookDelivery(client, {
    ...input,
    payloadHash: differentHash,
  });
  assertEquals(third.duplicate, false);
  assertEquals(store.size, 2);
});
