INSERT INTO public.email_sync_status (consultant_user_id, provider, mailbox_email, sync_state, last_sync_error, updated_at)
VALUES
  ('50148f8f-874f-41ee-8a19-61ffadddcfef'::uuid, 'outlook', 'admin.teste@startupleiria.com', 'disabled', 'Test account — mailbox does not exist in M365 tenant. Auto-sync disabled.', now()),
  ('cf436dab-e91c-4f9f-bcf4-0bae8a7650ff'::uuid, 'outlook', 'consultor.teste@startupleiria.com', 'disabled', 'Test account — mailbox does not exist in M365 tenant. Auto-sync disabled.', now())
ON CONFLICT (consultant_user_id, provider) DO UPDATE
SET sync_state = 'disabled',
    mailbox_email = EXCLUDED.mailbox_email,
    last_sync_error = EXCLUDED.last_sync_error,
    updated_at = now();