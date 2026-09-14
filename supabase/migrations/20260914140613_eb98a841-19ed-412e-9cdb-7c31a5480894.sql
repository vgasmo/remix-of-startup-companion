ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_startup_name text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, signup_startup_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    NULLIF(TRIM(new.raw_user_meta_data ->> 'startup_name'), '')
  );
  RETURN new;
END;
$$;