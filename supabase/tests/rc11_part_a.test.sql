-- RC11 · Parte A — pgTAP
BEGIN;
SELECT plan(20);

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
INSERT INTO public.conversations (id, workspace_id, is_group, title) VALUES ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false, NULL);
INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES
  ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d');
INSERT INTO public.messages (conversation_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'segredo');
INSERT INTO public.mentor_connections (id, founder_id, mentor_id, status, workspace_id) VALUES ('40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c', 'pending', '20000000-0000-0000-0000-000000000001');
INSERT INTO public.mentor_bookings (id, mentor_id, founder_id, workspace_id, requested_date, requested_start_time, requested_end_time, status)
VALUES ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', CURRENT_DATE + 7, '10:00', '11:00', 'pending');

-- ---- A1 conversas -------------------------------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c')$$,
  '42501', NULL, 'A1: nao participante nao se adiciona a conversa');
SELECT is((SELECT count(*)::int FROM public.messages WHERE conversation_id = '30000000-0000-0000-0000-000000000001'), 0, 'A1: nao participante nao le mensagens');
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT lives_ok($$INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES ('30000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b')$$,
  'A1: participante adiciona outro participante');
SELECT lives_ok($$UPDATE public.conversation_participants SET last_read_at = now() WHERE conversation_id = '30000000-0000-0000-0000-000000000001' AND user_id = auth.uid()$$,
  'A1: participante marca como lido');
SELECT throws_ok($$UPDATE public.conversation_participants SET conversation_id = gen_random_uuid() WHERE user_id = auth.uid()$$,
  '42501', NULL, 'A1: participante nao muda a conversa da propria participacao');

-- ---- A7 ligacoes de mentoria ------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
SELECT throws_ok($$UPDATE public.mentor_connections SET status = 'accepted', founder_id = 'b0000000-0000-0000-0000-00000000000b' WHERE id = '40000000-0000-0000-0000-000000000001'$$,
  '42501', 'connection_fields_immutable', 'A7: mentor nao reescreve founder_id');
SELECT lives_ok($$UPDATE public.mentor_connections SET status = 'accepted', responded_at = now() WHERE id = '40000000-0000-0000-0000-000000000001'$$,
  'A7: mentor aceita a ligacao');
SELECT is((SELECT status FROM public.mentor_connections WHERE id = '40000000-0000-0000-0000-000000000001'), 'accepted', 'A7: estado aceito');

-- ---- A6 reservas: founder cancela, mentor nao move a reserva ----------------
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT lives_ok($$UPDATE public.mentor_bookings SET status = 'cancelled' WHERE id = '50000000-0000-0000-0000-000000000001'$$, 'A6: founder cancela reserva pendente');
SELECT is((SELECT status FROM public.mentor_bookings WHERE id = '50000000-0000-0000-0000-000000000001'), 'cancelled', 'A6: reserva cancelada');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
SELECT throws_ok($$UPDATE public.mentor_bookings SET founder_id = 'b0000000-0000-0000-0000-00000000000b' WHERE id = '50000000-0000-0000-0000-000000000001'$$,
  '42501', 'booking_fields_immutable', 'A6: mentor nao muda founder_id da reserva');

-- ---- A9 bloqueio de workspace -----------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT is(public.has_workspace_access('20000000-0000-0000-0000-000000000001'), true, 'A9: founder acede ao workspace ativo');
SELECT set_config('role', 'postgres', true);
UPDATE public.workspaces SET blocked_at = now(), blocked_reason = 'teste' WHERE id = '20000000-0000-0000-0000-000000000001';
SELECT set_config('role', 'authenticated', true);
SELECT is(public.has_workspace_access('20000000-0000-0000-0000-000000000001'), false, 'A9: founder perde acesso quando blocked_at esta preenchido');
SELECT is(public.can_write_workspace('20000000-0000-0000-0000-000000000001'), false, 'A9: founder perde escrita quando bloqueado');
SELECT set_config('role', 'postgres', true);
UPDATE public.workspaces SET blocked_at = NULL, blocked_reason = NULL WHERE id = '20000000-0000-0000-0000-000000000001';

-- ---- A2 publish_program_setup com service_role passa a barreira de autenticacao -----
SELECT set_config('role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT throws_ok($$SELECT public.publish_program_setup('f0000000-0000-0000-0000-00000000000f'::uuid, 'f0000000-0000-0000-0000-00000000000f'::uuid, '{}'::jsonb, '{}'::jsonb)$$,
  'P0001', NULL, 'A2: chamada service_role passa a autenticacao e falha so por programa inexistente');
SELECT set_config('role', 'postgres', true);

-- ---- A14 ensure_dataroom_exists exige escrita -------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.ensure_dataroom_exists('20000000-0000-0000-0000-000000000002')$$, '42501', 'forbidden', 'A14: nao membro nao cria dataroom');
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
SELECT lives_ok($$SELECT public.ensure_dataroom_exists('20000000-0000-0000-0000-000000000002')$$, 'A14: founder cria o dataroom do seu workspace');

-- ---- A16 has_role devolve false em pedidos anonimos ------------------------
SELECT set_config('role', 'anon', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(public.has_role('a0000000-0000-0000-0000-00000000000a'::uuid, 'founder'::public.app_role), false, 'A16: anon nao enumera papeis');
SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

-- ---- A10/A12/A15 grants e triggers --------------------------------------------
SELECT is(has_function_privilege('authenticated', 'public.get_next_intake_consultant(uuid)', 'EXECUTE'), false, 'A10: get_next_intake_consultant sem EXECUTE para authenticated');
SELECT is((SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid = 'public.communication_log'::regclass AND NOT t.tgisinternal AND t.tgname LIKE '%funnel_last_activity%'), 1, 'A12: um unico trigger de last_activity');

SELECT * FROM finish();
ROLLBACK;
