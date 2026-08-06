-- pgTAP: Batch C — DocuSign dispatch lease exactly-once semantics.
-- Run against staging after applying 2026-07-22_batch-c_docusign_lease.sql.
BEGIN;
SELECT plan(14);

-- Fixture contract
INSERT INTO public.startup_contracts (id, contract_number, status, start_date)
VALUES ('11111111-1111-1111-1111-111111111111', 'TEST-C-001', 'draft', current_date)
ON CONFLICT DO NOTHING;

-- 1. Fresh claim succeeds
SELECT is(
  (public.claim_docusign_dispatch_lease(
     '11111111-1111-1111-1111-111111111111', 'cmd-a', 'worker-1', 60, 'docsha-1'
   ))->>'claimed', 'true', 'worker-1 obtains fresh lease');

-- 2. Second worker for same command_id is refused with lease_held
SELECT is(
  (public.claim_docusign_dispatch_lease(
     '11111111-1111-1111-1111-111111111111', 'cmd-a', 'worker-2', 60, 'docsha-1'
   ))->>'conflict', 'lease_held', 'concurrent worker-2 blocked');

-- 3. Provider idempotency key is bound to command_id + document sha
SELECT ok(
  (SELECT provider_idempotency_key FROM public.docusign_dispatch_leases WHERE command_id = 'cmd-a')
    = encode(extensions.digest('cmd-a:docsha-1', 'sha256'), 'hex'),
  'idempotency key = sha256(command_id || document_sha256)');

-- 4. Mark in-flight transitions state
SELECT ok(public.mark_docusign_dispatch_in_flight('cmd-a', 'worker-1'), 'in-flight transition');
SELECT is(
  (SELECT state FROM public.docusign_dispatch_leases WHERE command_id = 'cmd-a'),
  'in_flight', 'state = in_flight');

-- 5. Timeout → unknown, not failed
SELECT ok(public.mark_docusign_dispatch_unknown('cmd-a', 'worker-1', 'timeout'), 'ambiguous → unknown');
SELECT is(
  (SELECT state FROM public.docusign_dispatch_leases WHERE command_id = 'cmd-a'),
  'unknown', 'ambiguous outcome recorded as unknown, not failed');

-- 6. Reclaim while stale + not reconciled is refused
UPDATE public.docusign_dispatch_leases SET expires_at = now() - interval '1 minute' WHERE command_id = 'cmd-a';
SELECT is(
  (public.claim_docusign_dispatch_lease(
     '11111111-1111-1111-1111-111111111111', 'cmd-a', 'worker-3', 60, 'docsha-1'
   ))->>'requires_reconciliation', 'true', 'stale lease requires reconciliation before resend');

-- 7. Reconcile with provider "not_found" allows next attempt
SELECT is(
  (public.reconcile_docusign_dispatch_lease('cmd-a', NULL, 'not_found'))->>'state',
  'claimed', 'reconciliation with not_found rewinds state');

-- 8. Now worker-3 can reclaim, attempts incremented
SELECT is(
  (public.claim_docusign_dispatch_lease(
     '11111111-1111-1111-1111-111111111111', 'cmd-a', 'worker-3', 60, 'docsha-1'
   ))->>'reclaimed', 'true', 'post-reconcile reclaim allowed');

-- 9. Finalize by owner succeeds
SELECT ok(public.mark_docusign_dispatch_in_flight('cmd-a', 'worker-3'), 'in-flight for finalize test');
SELECT is(
  (public.finalize_docusign_dispatch_lease('cmd-a', 'worker-3', 'env-xyz'))->>'finalized',
  'true', 'finalize by owning worker succeeds');

-- 10. Second finalize is idempotent no-op, envelope_id preserved
SELECT is(
  (public.finalize_docusign_dispatch_lease('cmd-a', 'worker-3', 'env-different'))->>'reason',
  'already_terminal', 'monotonic finalize refuses to overwrite envelope_id');
SELECT is(
  (SELECT envelope_id FROM public.docusign_dispatch_leases WHERE command_id = 'cmd-a'),
  'env-xyz', 'original envelope_id preserved on replay');

SELECT * FROM finish();
ROLLBACK;
