// Deterministic event-key builders for in-app notifications.
// Same (event, entity, recipient) MUST always produce the same key so that
// edge-function retries are idempotent against the
// `notifications_event_key_user_unique` index.

export function documentUploadedKey(documentId: string, userId: string): string {
  return `document_uploaded:${documentId}:${userId}`;
}

export function templateSubmittedKey(instanceId: string, userId: string): string {
  return `template_submitted:${instanceId}:${userId}`;
}
