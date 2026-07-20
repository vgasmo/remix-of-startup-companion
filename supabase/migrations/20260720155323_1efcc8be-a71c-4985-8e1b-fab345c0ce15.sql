
DO $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid := 'b6c24cbe-f2a8-48da-9042-d4f7d240e672';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = 'luiscoutf@gmail.com' LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'auth user not found for luiscoutf@gmail.com';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'founder')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
  VALUES (v_workspace_id, v_user_id, 'founder', true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'founder';
END $$;
