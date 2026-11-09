/**
 * Traduz a resposta de `send-session-invite` no aviso que o CreateSessionDialog mostra (HRD-13).
 *
 * O servidor devolve `{ message, skipped, results: [{ email, success }] }`: `skipped` conta os
 * destinatários sem conta ativa (ignorados, já não recusam o lote) e `results` o envio por email.
 */
export type SessionInviteOutcome =
  | { kind: 'ok' }
  | { kind: 'failed' }
  | { kind: 'partial'; notDelivered: number };

export function getSessionInviteOutcome(
  result: { data?: unknown; error?: unknown } | null | undefined,
): SessionInviteOutcome {
  if (!result || result.error) return { kind: 'failed' };

  const data = (result.data ?? null) as { skipped?: unknown; results?: unknown } | null;
  const results = Array.isArray(data?.results) ? (data.results as Array<{ success?: unknown } | null>) : [];
  const failed = results.filter((r) => r?.success === false).length;
  if (results.length > 0 && failed === results.length) return { kind: 'failed' };

  const skippedRaw = Number(data?.skipped);
  const skipped = Number.isFinite(skippedRaw) && skippedRaw > 0 ? Math.floor(skippedRaw) : 0;
  const notDelivered = failed + skipped;
  return notDelivered > 0 ? { kind: 'partial', notDelivered } : { kind: 'ok' };
}
