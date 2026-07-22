# Batch B — Contract Signing Integrity (FAILING REPRO)

Source: `supabase/functions/public-contract-onboarding/index.ts` (1492 lines),
`public.apply_contract_signature_atomic` RPC (migration
`20260721125335_3620b85d…`), `contract_signature_events`, `startup_contracts`.

## Defects to correct

1. **Hardcoded consent flags** — request body accepted without an explicit
   `consent: { eidas_ack: true, timestamp, ip }` block; server infills.
2. **Signer identity not bound to intended party** — token grants signing on
   the contract, not on `(contract_id, party_role, party_email_at_issue)`.
3. **Reusable / insufficiently scoped token** — no single-use nonce, no
   document-hash binding, no expiry <= 15 min for the actual sign call.
4. **Command identity derived from mutable email** — `command_id` currently
   hashes `contract_id + role + email`; email can change between issue and
   sign, breaking idempotency guarantees.
5. **Evidence + activation outside the atomic tx** — signature event write,
   `startup_contracts.status` transition, and lifecycle activation happen in
   separate awaits; a mid-flight failure can leave contract signed with no
   activation, or activation with no evidence.
6. **Invalid `staff_work_queue_items` columns** — the fallback insert
   references columns that no longer exist after the schema move; needs the
   canonical `(kind, workspace_id, entity_ref, severity, payload_json)`
   shape.
7. **Missing counter-signer action path** — bilateral contracts never emit a
   real counter-sign task; today the founder-signed state is treated as
   terminal.
8. **Incomplete state-transition validation** — no `FOR UPDATE` lock on
   `startup_contracts` before transitioning; racing signs can flip a
   terminal state.
9. **Global consultant read on signature evidence** — RLS on
   `contract_signature_events` allows any consultant with staff role to
   read every workspace's evidence.
10. **Evidence deletion through contract cascade** — `ON DELETE CASCADE`
    from `startup_contracts` wipes signature audit; must be `RESTRICT` with
    an archival table.
11. **Concurrency / idempotency race** — two simultaneous same-command
    calls both pass the pre-check and both attempt inserts.

## Required outcome

- Expiring grant bound to `(contract_id, party, signer, document_sha256,
  version)`; single-use nonce; 15 min TTL.
- Explicit `consent` object in request; reject with 400 otherwise.
- No unsupported "eIDAS compliant" claim in copy — only "advanced
  electronic signature per eIDAS Article 26".
- One atomic call performs: signature event insert, evidence link, signer
  state transition, contract terminal status, lifecycle activation row,
  counter-sign task creation (bilateral only).
- Founder AND counter-signer journeys have real edge routes and typed
  errors mapped in PT/EN.
- Evidence table detached from cascade; ownership policy scoped to the
  contract's workspace assigned consultant + admin/backoffice.
- pgTAP + edge-level test: divergent-payload race, terminal-state guard,
  fingerprint mismatch, consent missing, expired token, wrong document
  hash, RLS peer read denied.
- Deno check clean on the rewritten function.

## Forward migration (draft — held, not applied)

Path: `docs/rc5/drafts/2026-07-22_batch-b_signing_integrity.sql` (to be
authored in the Batch B execution turn). Will:

- Add `contract_signing_grants(id, contract_id, party_role,
  signer_email_at_issue, document_sha256, nonce, expires_at, consumed_at)`
  with a partial unique index on `(contract_id, party_role) WHERE
  consumed_at IS NULL`.
- Extend `apply_contract_signature_atomic` to require and consume a grant
  in the same tx and to fingerprint the command on
  `(contract_id, party_role, document_sha256, canonical_payload_sha256)`.
- Replace cascade with `RESTRICT` and add
  `contract_signature_events_archive` mirror.
- Narrow RLS on `contract_signature_events` to workspace-scoped consultant
  + admin/backoffice; deny anonymous.

## Runtime proofs — NOT PROVEN (blocked without staging)

- pgTAP suite `supabase/tests/apply_contract_signature_atomic.test.sql`.
- Edge-level test with mocked signing provider.
- True two-connection concurrency probe on identical + divergent payloads.
- Provider failure injection (signing service 5xx/timeout).

## Next executable action

Write the migration draft + edge-function rewrite in the dedicated Batch B
turn. Do not merge into a numbered production migration until the pgTAP +
concurrency probes run green against an isolated database.
