ALTER TABLE public.survey_instances
  ADD COLUMN IF NOT EXISTS public_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS survey_instances_public_token_key
  ON public.survey_instances (public_token);