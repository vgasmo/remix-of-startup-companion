CREATE TABLE public.consultant_recurring_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time,
  end_time time,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultant_recurring_blocks_times CHECK (
    (start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);
CREATE INDEX idx_consultant_recurring_blocks_consultant ON public.consultant_recurring_blocks (consultant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultant_recurring_blocks TO authenticated;
GRANT ALL ON public.consultant_recurring_blocks TO service_role;
ALTER TABLE public.consultant_recurring_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own recurring blocks manage" ON public.consultant_recurring_blocks
  FOR ALL TO authenticated USING (consultant_id = auth.uid()) WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "Staff manage all recurring blocks" ON public.consultant_recurring_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'backoffice'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'backoffice'::app_role));

-- Expande os bloqueios semanais (hora de Lisboa) em janelas concretas
CREATE OR REPLACE FUNCTION public.expand_recurring_blocks(p_consultant_id uuid, p_from date, p_to date)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz, all_day boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    ((d::date + coalesce(b.start_time, time '00:00')) AT TIME ZONE 'Europe/Lisbon'),
    CASE WHEN b.end_time IS NULL THEN ((d::date + 1) AT TIME ZONE 'Europe/Lisbon')
         ELSE ((d::date + b.end_time) AT TIME ZONE 'Europe/Lisbon') END,
    b.start_time IS NULL
  FROM public.consultant_recurring_blocks b
  CROSS JOIN generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  WHERE b.consultant_id = p_consultant_id
    AND extract(dow FROM d)::int = b.weekday;
$$;
REVOKE EXECUTE ON FUNCTION public.expand_recurring_blocks(uuid, date, date) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_consultant_time_off(p_consultant_id uuid, p_from date, p_to date)
 RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone, all_day boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT t.starts_at, t.ends_at, t.all_day
    FROM public.consultant_time_off t
   WHERE t.consultant_id = p_consultant_id
     AND t.ends_at >= p_from::timestamptz
     AND t.starts_at < (p_to::timestamptz + interval '1 day')
  UNION ALL
  SELECT r.starts_at, r.ends_at, r.all_day
    FROM public.expand_recurring_blocks(p_consultant_id, p_from, p_to) r;
$function$;

CREATE OR REPLACE FUNCTION public.consultant_time_off_blocks(p_consultant_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.consultant_time_off t
     WHERE t.consultant_id = p_consultant_id AND t.starts_at < p_end AND t.ends_at > p_start
  ) OR EXISTS (
    SELECT 1 FROM public.expand_recurring_blocks(
      p_consultant_id,
      ((p_start AT TIME ZONE 'Europe/Lisbon')::date - 1),
      ((p_end AT TIME ZONE 'Europe/Lisbon')::date)
    ) r WHERE r.starts_at < p_end AND r.ends_at > p_start
  );
$function$;