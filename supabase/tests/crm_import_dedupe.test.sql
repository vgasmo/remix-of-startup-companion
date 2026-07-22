-- Batch F3 pgTAP: normalized dedupe + conflict queue + batch state machine.
BEGIN;
SELECT plan(7);

SELECT has_function('public','normalize_ident', ARRAY['text'], 'normalize_ident exists');
SELECT is(public.normalize_ident('  Ácmé S.A.  '), 'acmés.a.', 'diacritics + trim + lower (partial)');
SELECT is(public.normalize_ident(NULL), NULL, 'null passthrough');
SELECT is(public.normalize_ident('   '), NULL, 'empty passthrough');

SELECT has_column('public','funnel_items','nif_normalized','nif_normalized generated col added');
SELECT has_table('public','crm_import_conflicts','conflict queue table exists');
SELECT has_function('public','finalize_crm_import_batch', ARRAY['uuid'], 'batch finalizer exists');

SELECT * FROM finish();
ROLLBACK;
