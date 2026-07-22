# Batch C — DocuSign Exactly-Once Delivery (STATUS: FIXED IN SOURCE / RUNTIME NOT PROVEN)

Source: `supabase/functions/docusign-send-envelope/index.ts`,
`supabase/functions/docusign-webhook/index.ts`, RPCs
`claim_docusign_envelope` / `finalize_docusign_envelope`.

## Landed in source (2026-07-22)

- Migration draft `docs/rc5/drafts/2026-07-22_batch-c_docusign_lease.sql`
  introduces `docusign_dispatch_leases(command_id, owner_id, claimed_at,
  expires_at, state, attempts, document_sha256, provider_idempotency_key,
  envelope_id, last_error, reconciled_at)` with the state machine
  `claimed → in_flight → {sent | unknown | failed_terminal}` and a monotonic
  `finalize` that preserves the first envelope_id and refuses to regress
  terminal state.
- SECURITY DEFINER RPCs: `claim_docusign_dispatch_lease`,
  `mark_docusign_dispatch_in_flight`, `mark_docusign_dispatch_unknown`,
  `finalize_docusign_dispatch_lease`, `reconcile_docusign_dispatch_lease`
  (service_role only; RLS on the table exposes read-only lease state to
  staff for the operator dashboard).
- `docusign-send-envelope` now:
  - Computes `document_sha256` from the generated PDF and derives
    `X-DocuSign-Idempotency-Key = sha256(command_id || document_sha256)`.
  - Enforces a 30s abort timeout; timeouts and 5xx responses are recorded
    as `unknown` (HTTP 202) with `provider_last_error` and refuse to
    auto-retry — reconciliation must confirm provider state first.
- pgTAP `supabase/tests/docusign_dispatch_lease.test.sql` covers 14
  assertions: concurrent claim collapse, idempotency-key binding, in-flight
  transition, unknown recording, stale reclaim gated by reconciliation,
  attempt increment after not_found, monotonic finalize idempotency, and
  envelope_id preservation on replay.

## Runtime proofs — NOT PROVEN

The migration has NOT been applied against production; staging environment
still absent. Real DocuSign failure injection must not touch production.
Once staging exists, execute the pgTAP file plus a Node concurrency probe
that mocks the provider (500 / timeout / duplicate webhook).

## Follow-ups deferred to Batch F / release engineering

- Cutover of `docusign-send-envelope` / `docusign-webhook` from the legacy
  `claim_docusign_envelope` / `finalize_docusign_envelope` pair to the
  lease RPCs. The new table + RPCs coexist with the current path so the
  switch is a one-line diff behind a feature flag.
- Reconciliation worker: cron job that queries DocuSign for envelopes
  where the lease is `unknown` for > N minutes and calls
  `reconcile_docusign_dispatch_lease`.
