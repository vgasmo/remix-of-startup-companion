
-- =========================================================================
-- reconcile_contract_founders(contract_id uuid default null)
-- Ensures every active contract with workspace_id + legal_representative_email
-- has: profile row, user_roles founder, workspace_users membership.
-- When the auth user does not exist yet, opens a triage work-queue item.
-- Passing NULL processes ALL eligible contracts (used by cron).
-- Returns a JSON summary { checked, linked, invited, missing_auth }.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reconcile_contract_founders(p_contract_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_auth_id uuid;
  v_email text;
  v_name text;
  v_checked int := 0;
  v_linked int := 0;
  v_invited int := 0;
  v_missing int := 0;
BEGIN
  FOR r IN
    SELECT c.id,
           c.workspace_id,
           lower(trim(c.legal_representative_email)) AS email,
           COALESCE(NULLIF(trim(c.legal_representative_name), ''), 'Founder') AS full_name
    FROM public.startup_contracts c
    WHERE c.status = 'active'
      AND c.workspace_id IS NOT NULL
      AND c.legal_representative_email IS NOT NULL
      AND c.legal_representative_email <> ''
      AND (p_contract_id IS NULL OR c.id = p_contract_id)
  LOOP
    v_checked := v_checked + 1;
    v_email := r.email;
    v_name := r.full_name;

    SELECT id INTO v_auth_id
    FROM auth.users
    WHERE lower(email) = v_email
    LIMIT 1;

    IF v_auth_id IS NULL THEN
      -- No auth account yet: enqueue triage so staff invites the founder.
      v_missing := v_missing + 1;
      BEGIN
        INSERT INTO public.staff_work_queue_items (
          workspace_id, type, title, description, priority, status, evidence_json
        ) VALUES (
          r.workspace_id,
          'triage',
          'Convidar founder — ' || v_name,
          'Contrato ativo sem conta de auth para ' || v_email || '. Convite manual necessário.',
          'high',
          'open',
          jsonb_build_object(
            'purpose', 'invite_founder',
            'contract_id', r.id,
            'reason', 'missing_auth_user',
            'email', v_email
          )
        );
      EXCEPTION WHEN unique_violation THEN
        -- Already queued (idx_work_queue_unique_active) — leave the open task in place.
        NULL;
      END;
      CONTINUE;
    END IF;

    -- Profile
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (v_auth_id, v_email, v_name, 'approved'::account_status)
    ON CONFLICT (id) DO NOTHING;

    -- Founder role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_auth_id, 'founder')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Workspace membership (active)
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (r.workspace_id, v_auth_id, 'founder', true)
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET active = true,
          role = COALESCE(public.workspace_users.role, 'founder');

    v_linked := v_linked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked,
    'linked', v_linked,
    'invited', v_invited,
    'missing_auth', v_missing,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_contract_founders(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_contract_founders(uuid) TO service_role;

-- =========================================================================
-- Trigger: reconcile as soon as a contract becomes active or its workspace
-- is (re)assigned. Runs as SECURITY DEFINER via the function above.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_reconcile_contract_founder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
     AND NEW.workspace_id IS NOT NULL
     AND NEW.legal_representative_email IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
       OR OLD.legal_representative_email IS DISTINCT FROM NEW.legal_representative_email
     )
  THEN
    BEGIN
      PERFORM public.reconcile_contract_founders(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Never block the contract write; the hourly cron will catch it.
      RAISE WARNING 'reconcile_contract_founder failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_contract_founder ON public.startup_contracts;
CREATE TRIGGER trg_reconcile_contract_founder
AFTER INSERT OR UPDATE OF status, workspace_id, legal_representative_email
ON public.startup_contracts
FOR EACH ROW
EXECUTE FUNCTION public.trg_reconcile_contract_founder();
