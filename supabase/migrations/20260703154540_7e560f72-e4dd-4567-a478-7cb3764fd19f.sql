ALTER TABLE public.room_allocations
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.startup_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_room_allocations_contract_id
  ON public.room_allocations(contract_id) WHERE contract_id IS NOT NULL;