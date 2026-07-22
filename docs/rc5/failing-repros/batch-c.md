# Batch C — DocuSign Exactly-Once Delivery (FAILING REPRO)

Source: `supabase/functions/docusign-send-envelope/index.ts`,
`supabase/functions/docusign-webhook/index.ts`, RPCs
`claim_docusign_envelope` / `finalize_docusign_envelope` (migration
`20260721*_docusign_idempotency*.sql`).

## Defects

1. Dispatch lease has no explicit `owner` / `claimed_at` / `expires_at`;
   two workers can both believe they own a send.
2. Second same-command caller today re-enters the provider call rather
   than returning `in_progress`.
3. Provider `X-DocuSign-Idempotency-Key` derived from `command_id` alone
   — not bound to envelope payload hash.
4. Ambiguous provider timeouts are marked `failed` and immediately
   retried; must become `unknown` with reconciliation-first policy.
5. Finalize path is not idempotent — a webhook retry after finalize
   overwrites `provider_sent_at`.
6. No stale-lease recovery with capped attempts; a dead worker parks the
   envelope forever.
7. Webhook-before-finalize (fast provider) is not handled — race sets
   envelope to `sent` after `completed`.
8. No operator-visible reconciliation state on the envelope row.

## Required outcome

- `docusign_dispatch_leases(command_id, owner_id, claimed_at, expires_at,
  state, attempts, last_error)`, `state IN
  ('claimed','in_flight','unknown','sent','completed','failed_terminal')`.
- Provider idempotency key = `sha256(command_id || document_sha256)`.
- Timeout → `unknown` + reconciliation call before any resend.
- Finalize is a monotonic state machine keyed on
  `(command_id, envelope_id)`; original `provider_sent_at` preserved.
- Stale lease (age > `expires_at`) may be re-claimed only after a
  reconciliation call confirms provider state; attempts capped at 5 with
  exponential backoff.
- Mocked provider tests + true-concurrency Node probe against staging.

## Runtime proofs — NOT PROVEN

Real DocuSign failure injection **must never** run against production.

## Next action

Draft migration `docs/rc5/drafts/2026-07-22_batch-c_docusign_lease.sql`
and mocked-provider vitest in the Batch C turn.
