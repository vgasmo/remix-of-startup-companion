UPDATE public.feature_flags SET enabled = true, updated_at = now()
WHERE key = 'financial_business_plan_coach_v1' AND scope = 'global';

INSERT INTO public.feature_flags (key, enabled, scope, description)
SELECT 'financial_business_plan_coach_v1', true, 'global', 'Guided Financial + Business Plan Coach (Batch B)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags WHERE key = 'financial_business_plan_coach_v1' AND scope = 'global'
);