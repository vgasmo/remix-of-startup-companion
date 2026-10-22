-- RC11 · Parte B — pgTAP
BEGIN;
SELECT plan(17);

-- ---- fixtures ------------------------------------------------------------
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'founder-a@test.local', now()),
  ('b0000000-0000-0000-0000-00000000000b', 'founder-b@test.local', now()),
  ('c0000000-0000-0000-0000-00000000000c', 'mentor-m@test.local', now()),
  ('d0000000-0000-0000-0000-00000000000d', 'staff-s@test.local', now());
INSERT INTO public.profiles (id, email, full_name, account_status) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'founder-a@test.local', 'Founder A', 'approved'),
  ('b0000000-0000-0000-0000-00000000000b', 'founder-b@test.local', 'Founder B', 'approved'),
  ('c0000000-0000-0000-0000-00000000000c', 'mentor-m@test.local', 'Mentor M', 'approved'),
  ('d0000000-0000-0000-0000-00000000000d', 'staff-s@test.local', 'Staff S', 'approved')
ON CONFLICT (id) DO UPDATE SET account_status = 'approved';
INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'founder'),
  ('b0000000-0000-0000-0000-00000000000b', 'founder'),
  ('c0000000-0000-0000-0000-00000000000c', 'mentor_externo'),
  ('d0000000-0000-0000-0000-00000000000d', 'consultor')
ON CONFLICT DO NOTHING;
INSERT INTO public.programs (id, name) VALUES ('e0000000-0000-0000-0000-00000000000e', 'Programa RC11');
INSERT INTO public.startups (id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Startup One'),
  ('10000000-0000-0000-0000-000000000002', 'Startup Two');
INSERT INTO public.workspaces (id, startup_id, program_id, status) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e', 'active'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'active');
INSERT INTO public.workspace_users (workspace_id, user_id, role, active) VALUES
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'founder', true),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'founder', true)
ON CONFLICT DO NOTHING;

-- ---- B1 staff suspenso perde poderes -----------------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
SELECT is(public.is_staff(), true, 'B1: consultor aprovado e staff');
SELECT is(public.has_workspace_access('20000000-0000-0000-0000-000000000002'), true, 'B1: consultor acede a qualquer workspace');
SELECT set_config('role', 'postgres', true);
UPDATE public.profiles SET account_status = 'suspended' WHERE id = 'd0000000-0000-0000-0000-00000000000d';
SELECT set_config('role', 'authenticated', true);
SELECT is(public.is_staff(), false, 'B1: consultor suspenso deixa de ser staff');
SELECT is(public.has_workspace_access('20000000-0000-0000-0000-000000000002'), false, 'B1: consultor suspenso perde acesso aos workspaces');
SELECT is(public.can_write_workspace('20000000-0000-0000-0000-000000000002'), false, 'B1: consultor suspenso perde escrita');
SELECT set_config('role', 'postgres', true);
UPDATE public.profiles SET account_status = 'approved' WHERE id = 'd0000000-0000-0000-0000-00000000000d';

-- ---- B2 cancelar reserva aceite cancela a sessao ligada --------------------------
INSERT INTO public.mentor_bookings (id, mentor_id, founder_id, workspace_id, requested_date, requested_start_time, requested_end_time, status)
VALUES ('50000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', CURRENT_DATE + 7, '14:00', '15:00', 'pending');
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
SELECT lives_ok($$SELECT public.mentor_transition_booking('50000000-0000-0000-0000-000000000002', 'accepted')$$, 'B2: mentor aceita a reserva');
SELECT set_config('role', 'postgres', true);
SELECT is((SELECT s.status FROM public.sessions s JOIN public.mentor_bookings b ON b.linked_session_id = s.id WHERE b.id = '50000000-0000-0000-0000-000000000002'), 'scheduled', 'B2: sessao criada em scheduled');
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT lives_ok($$SELECT public.mentor_transition_booking('50000000-0000-0000-0000-000000000002', 'cancelled')$$, 'B2: founder cancela a reserva aceite');
SELECT set_config('role', 'postgres', true);
SELECT is((SELECT s.status FROM public.sessions s JOIN public.mentor_bookings b ON b.linked_session_id = s.id WHERE b.id = '50000000-0000-0000-0000-000000000002'), 'cancelled', 'B2: sessao ligada passa a cancelled');

-- ---- B4 claims ----------------------------------------------------------------
INSERT INTO public.startup_claim_requests (id, user_id, status) VALUES ('60000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'approved');
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.reject_startup_claim('60000000-0000-0000-0000-000000000001', 'x')$$, 'P0002', 'claim_not_pending', 'B4: rejeitar claim ja resolvido falha');
SELECT set_config('role', 'postgres', true);
INSERT INTO public.startup_claim_requests (id, user_id, status) VALUES ('60000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'pending');
UPDATE public.workspaces SET status = 'archived', archived_at = now() WHERE id = '20000000-0000-0000-0000-000000000002';
SELECT set_config('role', 'authenticated', true);
SELECT throws_ok($$SELECT public.approve_startup_claim('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002')$$, '22023', 'workspace_archived_or_rejected', 'B4: aprovar claim num workspace arquivado falha');
SELECT set_config('role', 'postgres', true);
UPDATE public.workspaces SET status = 'active', archived_at = NULL WHERE id = '20000000-0000-0000-0000-000000000002';

-- ---- B7 conversas so com quem partilha workspace -----------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.create_conversation(ARRAY['b0000000-0000-0000-0000-00000000000b']::uuid[], NULL, NULL)$$, '42501', 'participant_not_allowed', 'B7: founder nao abre conversa com desconhecido');
SELECT throws_ok($$SELECT public.create_conversation(ARRAY['d0000000-0000-0000-0000-00000000000d']::uuid[], NULL, '20000000-0000-0000-0000-000000000002')$$, '42501', 'workspace_access_denied', 'B7: founder nao etiqueta conversa com workspace alheio');
SELECT set_config('role', 'postgres', true);

-- ---- B11 politicas -------------------------------------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.stage_gate_reviews (workspace_id, from_stage, to_stage, status, reviewed_by, reviewed_at) VALUES ('20000000-0000-0000-0000-000000000001', 'ideation', 'validation', 'approved', 'd0000000-0000-0000-0000-00000000000d', now())$$, '42501', NULL, 'B11: founder nao insere revisao ja aprovada');
SELECT lives_ok($$INSERT INTO public.stage_gate_reviews (workspace_id, from_stage, to_stage, requested_by) VALUES ('20000000-0000-0000-0000-000000000001', 'ideation', 'validation', auth.uid())$$, 'B11: founder pede revisao pendente');
SELECT throws_ok($$INSERT INTO public.startup_claim_requests (user_id, status) VALUES (auth.uid(), 'pending')$$, '42501', NULL, 'B11: insert direto em startup_claim_requests bloqueado');
SELECT set_config('role', 'postgres', true);

-- ---- B13 resumos: founder so ve audience shared ---------------------------------------
INSERT INTO public.relationship_recaps (workspace_id, summary, audience, language) VALUES ('20000000-0000-0000-0000-000000000001', 'interno', 'staff', 'pt');
INSERT INTO public.relationship_recaps (workspace_id, summary, audience, language) VALUES ('20000000-0000-0000-0000-000000000001', 'partilhado', 'shared', 'en');
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.relationship_recaps WHERE workspace_id = '20000000-0000-0000-0000-000000000001'), 1, 'B13: founder ve apenas o resumo partilhado');
SELECT set_config('role', 'postgres', true);

SELECT * FROM finish();
ROLLBACK;
