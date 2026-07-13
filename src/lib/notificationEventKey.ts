// Deterministic event-key builders for in-app notifications on the client.
//
// Same (event, entity, recipient) MUST always produce the same key so that
// React Query retries, double-clicks and concurrent tabs are idempotent
// against the `notifications_event_key_user_unique` partial unique index.
//
// Mirrors supabase/functions/_shared/notificationEventKey.ts. Kept as a
// separate file because edge functions run in Deno and cannot import from
// src/. If you add a builder here, add the same one there.

export function templateRequestCreatedKey(requestId: string, userId: string): string {
  return `template_request_created:${requestId}:${userId}`;
}

export function templateRequestResolvedKey(
  requestId: string,
  status: string,
  userId: string,
): string {
  return `template_request_resolved:${requestId}:${status}:${userId}`;
}

export function sessionEventKey(
  sessionId: string,
  kind: "created" | "rescheduled" | "cancelled",
  userId: string,
): string {
  return `session_${kind}:${sessionId}:${userId}`;
}
