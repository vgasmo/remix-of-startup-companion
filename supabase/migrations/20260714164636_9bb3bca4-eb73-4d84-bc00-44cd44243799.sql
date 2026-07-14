
CREATE TABLE public.contract_field_ownership (
  field_name TEXT PRIMARY KEY,
  owner TEXT NOT NULL CHECK (owner IN ('backoffice','crm','shared')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contract_field_ownership TO authenticated;
GRANT ALL ON public.contract_field_ownership TO service_role;
ALTER TABLE public.contract_field_ownership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read ownership"
  ON public.contract_field_ownership FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor') OR public.has_role(auth.uid(), 'backoffice'));

CREATE POLICY "Admins manage ownership"
  ON public.contract_field_ownership FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.contract_field_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.startup_contracts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_owner TEXT,
  attempted_source TEXT,
  resolution TEXT NOT NULL CHECK (resolution IN ('applied','rejected','unattributed','shared_lww')),
  old_value JSONB,
  attempted_value JSONB,
  actor_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_field_conflicts_contract ON public.contract_field_conflicts(contract_id, created_at DESC);

GRANT SELECT ON public.contract_field_conflicts TO authenticated;
GRANT ALL ON public.contract_field_conflicts TO service_role;
ALTER TABLE public.contract_field_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read conflicts"
  ON public.contract_field_conflicts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor') OR public.has_role(auth.uid(), 'backoffice'));

CREATE POLICY "Service role manages conflicts"
  ON public.contract_field_conflicts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.contract_field_ownership (field_name, owner, description) VALUES
  ('status', 'backoffice', 'Estado operacional do contrato'),
  ('signature_status', 'backoffice', 'Estado da assinatura'),
  ('signed_at', 'backoffice', 'Data efetiva de assinatura'),
  ('signature_requested_at', 'backoffice', 'Envio do link de assinatura'),
  ('signature_provider', 'backoffice', 'Provedor de assinatura'),
  ('activation_date', 'backoffice', 'Data de ativação'),
  ('termination_date', 'backoffice', 'Data de cessação'),
  ('discount_percentage', 'backoffice', 'Percentagem de desconto'),
  ('discount_start_date', 'backoffice', 'Início do desconto'),
  ('discount_end_date', 'backoffice', 'Fim do desconto'),
  ('discount_reason', 'backoffice', 'Fundamentação do desconto'),
  ('base_price', 'backoffice', 'Preço base'),
  ('monthly_price', 'backoffice', 'Mensalidade'),
  ('pricing_snapshot_json', 'backoffice', 'Snapshot imutável de pricing'),
  ('contract_number', 'backoffice', 'Numeração INC'),
  ('typology_id', 'backoffice', 'Tipologia contratada'),
  ('incubation_type', 'backoffice', 'Tipo de incubação'),
  ('duration_months', 'backoffice', 'Duração'),
  ('office_space_id', 'backoffice', 'Espaço alocado'),
  ('onboarding_token_hash', 'backoffice', 'Token público de assinatura'),
  ('onboarding_token_expires_at', 'backoffice', 'Validade do token'),
  ('sharepoint_archived_at', 'backoffice', 'Arquivo SharePoint'),
  ('sharepoint_path', 'backoffice', 'Caminho SharePoint'),
  ('crm_stage', 'crm', 'Stage comercial'),
  ('crm_notes', 'crm', 'Notas comerciais'),
  ('commercial_proposal_url', 'crm', 'Link da proposta'),
  ('commercial_proposal_sent_at', 'crm', 'Envio de proposta'),
  ('lead_source', 'crm', 'Origem do lead'),
  ('funnel_item_id', 'crm', 'Item de funnel de origem'),
  ('legal_representative_name', 'shared', 'Representante legal'),
  ('legal_representative_email', 'shared', 'Email do representante'),
  ('legal_representative_phone', 'shared', 'Telefone do representante'),
  ('legal_representative_nif', 'shared', 'NIF do representante'),
  ('company_nif', 'shared', 'NIF da empresa'),
  ('company_name', 'shared', 'Nome da empresa'),
  ('company_address', 'shared', 'Morada'),
  ('notes', 'shared', 'Notas gerais')
ON CONFLICT (field_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.apply_contract_patch(
  _contract_id UUID,
  _patch JSONB,
  _source TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key TEXT;
  _new JSONB;
  _old JSONB;
  _owner TEXT;
  _applied JSONB := '{}'::jsonb;
  _rejected JSONB := '[]'::jsonb;
  _actor UUID := auth.uid();
BEGIN
  IF _source IS NULL OR _source NOT IN ('backoffice','crm','system') THEN
    RAISE EXCEPTION 'apply_contract_patch: invalid source %', _source;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.startup_contracts WHERE id = _contract_id) THEN
    RAISE EXCEPTION 'contract not found: %', _contract_id;
  END IF;

  PERFORM set_config('app.contract_write_source', _source, true);

  FOR _key, _new IN SELECT * FROM jsonb_each(_patch) LOOP
    SELECT owner INTO _owner FROM public.contract_field_ownership WHERE field_name = _key;

    EXECUTE format('SELECT to_jsonb(t.%I) FROM public.startup_contracts t WHERE id = $1', _key)
      INTO _old USING _contract_id;

    IF _owner IS NULL THEN
      _owner := 'shared';
      INSERT INTO public.contract_field_conflicts(contract_id, field_name, field_owner, attempted_source, resolution, old_value, attempted_value, actor_id, reason)
      VALUES (_contract_id, _key, NULL, _source, 'unattributed', _old, _new, _actor, 'field not in ownership registry');
    END IF;

    IF _owner = 'shared' OR _owner = _source OR _source = 'system' THEN
      BEGIN
        EXECUTE format(
          'UPDATE public.startup_contracts SET %I = x.val FROM LATERAL jsonb_populate_record(NULL::public.startup_contracts, jsonb_build_object(%L, $1::jsonb)) x WHERE id = $2',
          _key, _key
        ) USING _new, _contract_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.contract_field_conflicts(contract_id, field_name, field_owner, attempted_source, resolution, old_value, attempted_value, actor_id, reason)
        VALUES (_contract_id, _key, _owner, _source, 'rejected', _old, _new, _actor, 'type coercion failed: '||SQLERRM);
        _rejected := _rejected || jsonb_build_object('field', _key, 'reason', 'type_error');
        CONTINUE;
      END;

      _applied := _applied || jsonb_build_object(_key, _new);

      IF _owner = 'shared' AND _old IS DISTINCT FROM _new THEN
        INSERT INTO public.contract_field_conflicts(contract_id, field_name, field_owner, attempted_source, resolution, old_value, attempted_value, actor_id, reason)
        VALUES (_contract_id, _key, _owner, _source, 'shared_lww', _old, _new, _actor, 'shared field LWW');
      END IF;
    ELSE
      INSERT INTO public.contract_field_conflicts(contract_id, field_name, field_owner, attempted_source, resolution, old_value, attempted_value, actor_id, reason)
      VALUES (_contract_id, _key, _owner, _source, 'rejected', _old, _new, _actor, format('field owned by %s, write from %s denied', _owner, _source));
      _rejected := _rejected || jsonb_build_object('field', _key, 'owner', _owner, 'reason', 'ownership_denied');
    END IF;
  END LOOP;

  INSERT INTO public.contract_lifecycle_events(contract_id, event_type, source, payload)
  VALUES (_contract_id, 'field_patch', 'apply_contract_patch:'||_source,
          jsonb_build_object('applied', _applied, 'rejected', _rejected, 'actor', _actor));

  RETURN jsonb_build_object('applied', _applied, 'rejected', _rejected);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_contract_patch(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_contract_patch(UUID, JSONB, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_log_unattributed_contract_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _source TEXT := current_setting('app.contract_write_source', true);
BEGIN
  IF _source IS NOT NULL AND _source <> '' THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  INSERT INTO public.contract_field_conflicts(contract_id, field_name, field_owner, attempted_source, resolution, old_value, attempted_value, actor_id, reason)
  VALUES (NEW.id, '_direct_update', NULL, 'unknown', 'unattributed', NULL, NULL, auth.uid(),
          'direct UPDATE on startup_contracts without apply_contract_patch');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_unattributed_contract_writes ON public.startup_contracts;
CREATE TRIGGER trg_log_unattributed_contract_writes
AFTER UPDATE ON public.startup_contracts
FOR EACH ROW EXECUTE FUNCTION public.tg_log_unattributed_contract_writes();

REVOKE EXECUTE ON FUNCTION public.tg_log_unattributed_contract_writes() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_log_unattributed_contract_writes() TO service_role;
