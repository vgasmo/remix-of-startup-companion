-- RC5 Batch E — pgTAP suite: profiles peer boundary + complete_workspace_onboarding gate.
--
-- Runs under scripts/rc5/run-pgtap.mjs against a non-production DB.
-- Refuses to execute against the production project ref.

BEGIN;
SELECT plan(11);

-- ---------- fixtures ----------
DO $$
DECLARE
  v_founder uuid := gen_random_uuid();
  v_peer    uuid := gen_random_uuid();
  v_staff   uuid := gen_random_uuid();
  v_wsp     uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('rc5.founder_id', v_founder::text, true);
  PERFORM set_config('rc5.peer_id',    v_peer::text,    true);
  PERFORM set_config('rc5.staff_id',   v_staff::text,   true);
  PERFORM set_config('rc5.wsp_id',     v_wsp::text,     true);

  INSERT INTO auth.users (id, email) VALUES
    (v_founder, 'rc5_e_founder@example.test'),
    (v_peer,    'rc5_e_peer@example.test'),
    (v_staff,   'rc5_e_staff@example.test');

  -- handle_new_user() already materialized a profile row per auth user.
  INSERT INTO public.profiles (id, full_name, email, phone, linkedin_url) VALUES
    (v_founder, 'RC5 Founder', 'rc5_e_founder@example.test', '+351900000001', 'https://linkedin.example/founder'),
    (v_peer,    'RC5 Peer',    'rc5_e_peer@example.test',    '+351900000002', 'https://linkedin.example/peer'),
    (v_staff,   'RC5 Staff',   'rc5_e_staff@example.test',   '+351900000003', 'https://linkedin.example/staff')
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        linkedin_url = EXCLUDED.linkedin_url;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_staff, 'admin');

  INSERT INTO public.startups (id, name) VALUES (v_wsp, 'RC5 Batch E Startup');
  INSERT INTO public.programs (id, name) VALUES (v_wsp, 'RC5 Batch E Program');
  INSERT INTO public.workspaces (id, startup_id, program_id, status, needs_onboarding)
  VALUES (v_wsp, v_wsp, v_wsp, 'active', true);

  INSERT INTO public.workspace_users (workspace_id, user_id, role, active) VALUES
    (v_wsp, v_founder, 'founder',  true),
    (v_wsp, v_peer,    'mentor_externo', true);
END $$;

-- ---------- profiles direct-select is DENIED for peer ----------
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rc5.peer_id'), 'role', 'authenticated')::text, true);

SELECT is_empty(
  format($q$SELECT 1 FROM public.profiles WHERE id = %L$q$, current_setting('rc5.founder_id')),
  'peer cannot read founder row from public.profiles (RLS)'
);

-- ---------- profiles_safe peer view ----------
SELECT results_eq(
  format($q$SELECT full_name FROM public.profiles_safe WHERE id = %L$q$, current_setting('rc5.founder_id')),
  $$VALUES ('RC5 Founder'::text)$$,
  'peer sees full_name of workspace mate via profiles_safe'
);

SELECT is(
  (SELECT email FROM public.profiles_safe WHERE id = current_setting('rc5.founder_id')::uuid),
  NULL,
  'peer sees NULL email via profiles_safe'
);

SELECT is(
  (SELECT phone FROM public.profiles_safe WHERE id = current_setting('rc5.founder_id')::uuid),
  NULL,
  'peer sees NULL phone via profiles_safe'
);

SELECT is(
  (SELECT linkedin_url FROM public.profiles_safe WHERE id = current_setting('rc5.founder_id')::uuid),
  NULL,
  'peer sees NULL linkedin_url via profiles_safe'
);

-- Stranger (no shared workspace) sees nothing at all.
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
SELECT is_empty(
  format($q$SELECT 1 FROM public.profiles_safe WHERE id = %L$q$, current_setting('rc5.founder_id')),
  'stranger sees no rows in profiles_safe'
);

-- Staff sees full PII via profiles_safe.
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rc5.staff_id'), 'role', 'authenticated')::text, true);
SELECT is(
  (SELECT email FROM public.profiles_safe WHERE id = current_setting('rc5.founder_id')::uuid),
  'rc5_e_founder@example.test',
  'staff sees email via profiles_safe'
);

-- ---------- complete_workspace_onboarding gate ----------
-- Peer (non-founder workspace member) is REJECTED.
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rc5.peer_id'), 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format($q$SELECT public.complete_workspace_onboarding(%L::uuid)$q$, current_setting('rc5.wsp_id')),
  '42501',
  NULL,
  'peer (non-founder workspace member) cannot complete onboarding'
);

-- Stranger is REJECTED.
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format($q$SELECT public.complete_workspace_onboarding(%L::uuid)$q$, current_setting('rc5.wsp_id')),
  '42501',
  NULL,
  'stranger cannot complete onboarding'
);

-- Founder succeeds.
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rc5.founder_id'), 'role', 'authenticated')::text, true);
SELECT lives_ok(
  format($q$SELECT public.complete_workspace_onboarding(%L::uuid)$q$, current_setting('rc5.wsp_id')),
  'founder can complete onboarding'
);
SELECT is(
  (SELECT needs_onboarding FROM public.workspaces WHERE id = current_setting('rc5.wsp_id')::uuid),
  false,
  'workspace.needs_onboarding flipped to false after founder call'
);

SELECT * FROM finish();
ROLLBACK;
