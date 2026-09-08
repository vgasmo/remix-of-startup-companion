-- RC5 legacy baseline.
--
-- Three production tables predate this repository's migration history (their
-- CREATE TABLE statements were never committed), so a from-empty forward replay
-- fails on the later migrations that add their policies and grants.
-- The DDL below mirrors the live production schema exactly (columns, types,
-- defaults, nullability) and is applied BEFORE the forward replay so the
-- harness reproduces production instead of an impossible empty state.
--
-- Do not add anything here that a committed migration already creates.

CREATE TABLE IF NOT EXISTS public.investor_readiness_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid,
  stage text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_readiness_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  item_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  notes text,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.investor_update_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  audience text NOT NULL DEFAULT 'angel',
  sections_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
