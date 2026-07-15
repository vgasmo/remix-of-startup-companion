
-- 1. Domiciliation uniqueness guard: at most one active service-only program.
-- Rationale: the two duplicate domiciliation programs were merged into
-- `df868ac6…`; without this guard a well-meaning admin could recreate the
-- duplicate through Programs Manager.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_service_only_program
  ON public.programs ((settings_json->>'service_only'))
  WHERE is_active = true
    AND status = 'active'
    AND (settings_json->>'service_only')::boolean IS TRUE;

COMMENT ON INDEX public.uniq_active_service_only_program IS
'At most one active program may have settings_json.service_only = true. Prevents recreation of the duplicate domiciliation program that was merged in July 2026.';

-- 2. Manual resolution queue: unified visibility of records the reconciler
-- and provisioning flow cannot resolve automatically.
CREATE OR REPLACE VIEW public.admin_manual_resolution_queue
WITH (security_invoker = true) AS
SELECT
  'orphan_contract'::text AS record_kind,
  sc.id AS record_id,
  sc.contract_number AS reference,
  COALESCE(sc.legal_representative_name, sc.company_nif, '?') AS label,
  sc.company_nif AS nif,
  sc.status AS state,
  sc.funnel_item_id,
  NULL::uuid AS workspace_id,
  sc.created_at,
  sc.updated_at,
  jsonb_build_object(
    'signature_status', sc.signature_status,
    'signed_at', sc.signed_at,
    'legal_representative_email', sc.legal_representative_email,
    'start_date', sc.start_date
  ) AS context
FROM public.startup_contracts sc
WHERE sc.workspace_id IS NULL

UNION ALL

SELECT
  'unlinked_contracted_funnel'::text,
  fi.id,
  fi.organization_name,
  COALESCE(fi.contact_name, fi.organization_name, '?'),
  fi.nif_normalized,
  fi.stage,
  fi.id,
  NULL::uuid,
  fi.created_at,
  fi.updated_at,
  jsonb_build_object(
    'contact_email', fi.contact_email,
    'phc_customer_id', fi.phc_customer_id,
    'linked_contract_id', fi.linked_contract_id,
    'program_id', fi.program_id,
    'source', fi.source
  )
FROM public.funnel_items fi
WHERE fi.stage = 'contracted' AND fi.linked_workspace_id IS NULL;

REVOKE ALL ON public.admin_manual_resolution_queue FROM PUBLIC;
GRANT SELECT ON public.admin_manual_resolution_queue TO authenticated, service_role;

COMMENT ON VIEW public.admin_manual_resolution_queue IS
'Records that neither the reconciler nor the provisioning flow can resolve automatically. RLS on underlying tables still applies via security_invoker; only staff who can read startup_contracts/funnel_items see rows.';
