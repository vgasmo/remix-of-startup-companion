-- P1.6 pgTAP: closing a CRM import batch must run and report partial state.
BEGIN;
SELECT plan(4);

SELECT has_function('public', 'finalize_crm_import_batch', ARRAY['uuid'],
  'finalize RPC exists');
SELECT has_column('public', 'crm_lead_import_batches', 'updated_at',
  'batches carry updated_at');

-- anon may not finalize batches
SET LOCAL role anon;
SELECT throws_ok(
  $$SELECT public.finalize_crm_import_batch('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501', NULL, 'anon cannot finalize a batch');
RESET role;

INSERT INTO auth.users (id, email) VALUES
  ('44444444-0000-0000-0000-00000000000a', 'pgtap-crm@example.com');

INSERT INTO public.crm_lead_import_batches
  (id, created_by, total_rows, valid_rows, invalid_rows, committed_rows, status, lifecycle_state)
VALUES ('44444444-0000-0000-0000-000000000001',
        '44444444-0000-0000-0000-00000000000a', 2, 1, 1, 1, 'staged', 'committing');

INSERT INTO public.crm_lead_import_rows
  (batch_id, row_index, row_hash, organization_name, valid, committed_funnel_item_id, error)
VALUES ('44444444-0000-0000-0000-000000000001', 1, 'h1', 'Valid Co', true, NULL, NULL),
       ('44444444-0000-0000-0000-000000000001', 2, 'h2', 'Broken Co', false, NULL, 'missing email');

INSERT INTO public.user_roles (user_id, role)
VALUES ('44444444-0000-0000-0000-00000000000a', 'admin');
SET LOCAL request.jwt.claims = '{"sub":"44444444-0000-0000-0000-00000000000a","role":"authenticated"}';

SELECT is(
  public.finalize_crm_import_batch('44444444-0000-0000-0000-000000000001'::uuid),
  'partial_needs_review',
  'a batch with one invalid row finalizes as partial_needs_review');

SELECT * FROM finish();
ROLLBACK;
