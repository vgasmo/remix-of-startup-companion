
CREATE TABLE public.checkin_response_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id UUID,
  instance_id UUID,
  question_id TEXT,
  kpi_definition_id UUID,
  action TEXT NOT NULL CHECK (action IN ('insert','update','delete')),
  old_value TEXT,
  new_value TEXT,
  old_number NUMERIC,
  new_number NUMERIC,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkin_response_audit_instance ON public.checkin_response_audit(instance_id);
CREATE INDEX idx_checkin_response_audit_response ON public.checkin_response_audit(response_id);
CREATE INDEX idx_checkin_response_audit_changed_at ON public.checkin_response_audit(changed_at DESC);

GRANT SELECT ON public.checkin_response_audit TO authenticated;
GRANT ALL ON public.checkin_response_audit TO service_role;

ALTER TABLE public.checkin_response_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and workspace members can view audit"
ON public.checkin_response_audit
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.checkin_instances ci
    WHERE ci.id = checkin_response_audit.instance_id
      AND has_workspace_access(ci.workspace_id)
  )
);

CREATE OR REPLACE FUNCTION public.log_checkin_response_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.checkin_response_audit(
      response_id, instance_id, question_id, kpi_definition_id,
      action, new_value, new_number, changed_by
    ) VALUES (
      NEW.id, NEW.instance_id, NEW.question_id, NEW.kpi_definition_id,
      'insert', NEW.response_value, NEW.response_number, auth.uid()
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.response_value IS DISTINCT FROM NEW.response_value)
       OR (OLD.response_number IS DISTINCT FROM NEW.response_number) THEN
      INSERT INTO public.checkin_response_audit(
        response_id, instance_id, question_id, kpi_definition_id,
        action, old_value, new_value, old_number, new_number, changed_by
      ) VALUES (
        NEW.id, NEW.instance_id, NEW.question_id, NEW.kpi_definition_id,
        'update', OLD.response_value, NEW.response_value,
        OLD.response_number, NEW.response_number, auth.uid()
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.checkin_response_audit(
      response_id, instance_id, question_id, kpi_definition_id,
      action, old_value, old_number, changed_by
    ) VALUES (
      OLD.id, OLD.instance_id, OLD.question_id, OLD.kpi_definition_id,
      'delete', OLD.response_value, OLD.response_number, auth.uid()
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_checkin_response_change ON public.checkin_responses;
CREATE TRIGGER trg_log_checkin_response_change
AFTER INSERT OR UPDATE OR DELETE ON public.checkin_responses
FOR EACH ROW EXECUTE FUNCTION public.log_checkin_response_change();
