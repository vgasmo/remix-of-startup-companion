
-- Lock down "Users can accept own invitations" so invitees can only mark accepted_at.
-- Prevent tampering with role, workspace_id, email, expires_at, token, invited_by, etc.

CREATE OR REPLACE FUNCTION public.prevent_invitee_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_staff boolean;
BEGIN
  -- Staff (admin/consultor) may edit invitations freely via the staff policy.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['admin'::app_role, 'consultor'::app_role])
  ) INTO is_staff;

  IF is_staff THEN
    RETURN NEW;
  END IF;

  -- Non-staff (the invitee): only accepted_at may change. Freeze everything else.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.token IS DISTINCT FROM OLD.token
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Invitees can only accept invitations; other fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_invitations_prevent_tampering ON public.workspace_invitations;
CREATE TRIGGER trg_workspace_invitations_prevent_tampering
BEFORE UPDATE ON public.workspace_invitations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_invitee_field_tampering();
