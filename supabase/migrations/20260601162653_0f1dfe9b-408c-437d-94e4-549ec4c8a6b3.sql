ALTER TABLE public.startup_contracts DROP CONSTRAINT IF EXISTS chk_signature_provider;
ALTER TABLE public.startup_contracts ADD CONSTRAINT chk_signature_provider CHECK (
  signature_provider IS NULL OR signature_provider = ANY (ARRAY['docusign','pandadoc','manual','assinatura_digital','pandadoc_manual'])
);