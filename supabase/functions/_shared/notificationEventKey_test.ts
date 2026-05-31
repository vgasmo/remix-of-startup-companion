import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  documentUploadedKey,
  templateSubmittedKey,
} from "./notificationEventKey.ts";

Deno.test("documentUploadedKey is deterministic across retries", () => {
  const a = documentUploadedKey("doc-1", "user-1");
  const b = documentUploadedKey("doc-1", "user-1");
  assertEquals(a, b, "same inputs must produce same key");
  assertEquals(a, "document_uploaded:doc-1:user-1");
});

Deno.test("templateSubmittedKey is deterministic across retries", () => {
  const a = templateSubmittedKey("inst-1", "user-1");
  const b = templateSubmittedKey("inst-1", "user-1");
  assertEquals(a, b);
  assertEquals(a, "template_submitted:inst-1:user-1");
});

Deno.test("event keys are unique per recipient", () => {
  assertNotEquals(
    documentUploadedKey("doc-1", "user-1"),
    documentUploadedKey("doc-1", "user-2"),
  );
  assertNotEquals(
    templateSubmittedKey("inst-1", "user-1"),
    templateSubmittedKey("inst-1", "user-2"),
  );
});

Deno.test("event keys do not collide across event types", () => {
  assertNotEquals(
    documentUploadedKey("x", "u"),
    templateSubmittedKey("x", "u"),
  );
});

Deno.test("retry simulation: deduping a batch by event_key yields one row per (user,event)", () => {
  // Simulate two retries each emitting the same payload for 3 recipients.
  const recipients = ["u1", "u2", "u3"];
  const attempts = [1, 2]; // 2 retries
  const rows = attempts.flatMap(() =>
    recipients.map((u) => ({
      user_id: u,
      event_key: documentUploadedKey("doc-99", u),
    }))
  );
  // The DB unique index on (user_id, event_key) would collapse these.
  const dedup = new Map(rows.map((r) => [`${r.user_id}|${r.event_key}`, r]));
  assertEquals(dedup.size, recipients.length);
});
