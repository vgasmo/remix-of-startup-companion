
INSERT INTO public.profiles (id, email, full_name, account_status)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', 'Founder'), 'approved'::account_status
FROM auth.users u
WHERE u.id = '03fd1ac9-6e74-402d-a741-321c9da2c13a'
ON CONFLICT (id) DO NOTHING;
