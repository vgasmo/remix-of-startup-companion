-- As duas tabelas já são referenciadas por 20260103024619 e 20260115005921, mas só eram criadas em 20260220001543.
-- Mesmo DDL de 20260220001543:5-28. Em produção é um no-op (as tabelas já existem).
CREATE TABLE IF NOT EXISTS public.investor_update_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    audience text NOT NULL DEFAULT 'investors',
    sections_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.investor_readiness_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    category text NOT NULL,
    stage text NOT NULL,
    program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
