-- RC12 (sql_db) · CRM-08 — lembretes de intake: a fase de assinatura recomeca a contagem.
-- run-intake-reminders usa reminder_count / last_reminder_sent_at nas duas fases (preenchimento e assinatura) e nunca os repunha
-- ao entrar em 'signature_sent': um intake com lembretes antigos recebia "Assinatura pendente" logo na primeira corrida do cron
-- a seguir ao envio do contrato (com novo link, que invalida o anterior), em vez de aos D+3.
-- Idempotente (CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
CREATE OR REPLACE FUNCTION public.reset_intake_reminders_on_phase_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Ao entrar em 'signature_sent' ou 'changes_requested' a contagem recomeca, salvo se a propria instrucao UPDATE
  -- ja mexeu nesses campos (o UPDATE do cron nao toca em status, por isso nao e anulado).
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('signature_sent', 'changes_requested')
     AND NEW.reminder_count IS NOT DISTINCT FROM OLD.reminder_count
     AND NEW.last_reminder_sent_at IS NOT DISTINCT FROM OLD.last_reminder_sent_at THEN
    NEW.reminder_count := 0;
    NEW.last_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_reset_intake_reminders ON public.contract_intakes;
CREATE TRIGGER trg_reset_intake_reminders
  BEFORE UPDATE OF status ON public.contract_intakes
  FOR EACH ROW EXECUTE FUNCTION public.reset_intake_reminders_on_phase_change();