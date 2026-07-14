
-- 1) Allow admins to satisfy is_backoffice() checks
CREATE OR REPLACE FUNCTION public.is_backoffice()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('backoffice','admin')
  )
$function$;

-- 2) Contract room reference + discount period
ALTER TABLE public.startup_contracts
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_start_date date,
  ADD COLUMN IF NOT EXISTS discount_end_date date;

CREATE INDEX IF NOT EXISTS idx_startup_contracts_room_id ON public.startup_contracts(room_id);
CREATE INDEX IF NOT EXISTS idx_startup_contracts_discount_end ON public.startup_contracts(discount_end_date) WHERE discount_end_date IS NOT NULL;
