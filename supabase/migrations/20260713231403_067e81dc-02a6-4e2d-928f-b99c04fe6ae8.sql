-- Seed revenue + CMVMC item-1 input cells for the canonical Startup Leiria XLSM.
-- All addresses reference the "Pressupostos" sheet on schema_version=1.
-- direction='input' means the guided plan writes these back on export.
INSERT INTO public.financial_cell_map
  (schema_version, sheet, address, metric_key, unit, period_kind, period_index, direction, notes)
VALUES
  -- Vendas de Mercadorias — item 1
  (1, 'Pressupostos', 'F54', 'revenue.mercadorias.item1.name',       'text',     'point', NULL, 'input', jsonb_build_object('label','Nome do item')),
  (1, 'Pressupostos', 'D55', 'revenue.mercadorias.item1.vat',        'pct',      'point', NULL, 'input', jsonb_build_object('label','IVA aplicável')),
  (1, 'Pressupostos', 'E55', 'revenue.mercadorias.item1.export_pct', 'pct',      'point', NULL, 'input', jsonb_build_object('label','% Exportação')),
  (1, 'Pressupostos', 'G56', 'revenue.mercadorias.item1.qty_y0',     'count',    'point', NULL, 'input', jsonb_build_object('label','Quantidade Y0')),
  (1, 'Pressupostos', 'G57', 'revenue.mercadorias.item1.pvp_y0',     'currency', 'point', NULL, 'input', jsonb_build_object('label','PVP Y0')),
  (1, 'Pressupostos', 'G58', 'revenue.mercadorias.item1.growth',     'pct',      'year',  0,    'input', jsonb_build_object('label','Taxa crescimento Y0')),
  (1, 'Pressupostos', 'H58', 'revenue.mercadorias.item1.growth',     'pct',      'year',  1,    'input', jsonb_build_object('label','Taxa crescimento Y1')),
  (1, 'Pressupostos', 'I58', 'revenue.mercadorias.item1.growth',     'pct',      'year',  2,    'input', jsonb_build_object('label','Taxa crescimento Y2')),
  (1, 'Pressupostos', 'J58', 'revenue.mercadorias.item1.growth',     'pct',      'year',  3,    'input', jsonb_build_object('label','Taxa crescimento Y3')),
  (1, 'Pressupostos', 'K58', 'revenue.mercadorias.item1.growth',     'pct',      'year',  4,    'input', jsonb_build_object('label','Taxa crescimento Y4')),
  (1, 'Pressupostos', 'L58', 'revenue.mercadorias.item1.growth',     'pct',      'year',  5,    'input', jsonb_build_object('label','Taxa crescimento Y5')),
  (1, 'Pressupostos', 'M58', 'revenue.mercadorias.item1.growth',     'pct',      'year',  6,    'input', jsonb_build_object('label','Taxa crescimento Y6')),

  -- Vendas de Produtos — item 1
  (1, 'Pressupostos', 'F60', 'revenue.produtos.item1.name',          'text',     'point', NULL, 'input', jsonb_build_object('label','Nome do item')),
  (1, 'Pressupostos', 'D61', 'revenue.produtos.item1.vat',           'pct',      'point', NULL, 'input', jsonb_build_object('label','IVA aplicável')),
  (1, 'Pressupostos', 'E61', 'revenue.produtos.item1.export_pct',    'pct',      'point', NULL, 'input', jsonb_build_object('label','% Exportação')),
  (1, 'Pressupostos', 'G62', 'revenue.produtos.item1.qty_y0',        'count',    'point', NULL, 'input', jsonb_build_object('label','Quantidade Y0')),
  (1, 'Pressupostos', 'G63', 'revenue.produtos.item1.pvp_y0',        'currency', 'point', NULL, 'input', jsonb_build_object('label','PVP Y0')),
  (1, 'Pressupostos', 'G64', 'revenue.produtos.item1.growth',        'pct',      'year',  0,    'input', jsonb_build_object('label','Taxa crescimento Y0')),
  (1, 'Pressupostos', 'H64', 'revenue.produtos.item1.growth',        'pct',      'year',  1,    'input', jsonb_build_object('label','Taxa crescimento Y1')),
  (1, 'Pressupostos', 'I64', 'revenue.produtos.item1.growth',        'pct',      'year',  2,    'input', jsonb_build_object('label','Taxa crescimento Y2')),
  (1, 'Pressupostos', 'J64', 'revenue.produtos.item1.growth',        'pct',      'year',  3,    'input', jsonb_build_object('label','Taxa crescimento Y3')),
  (1, 'Pressupostos', 'K64', 'revenue.produtos.item1.growth',        'pct',      'year',  4,    'input', jsonb_build_object('label','Taxa crescimento Y4')),
  (1, 'Pressupostos', 'L64', 'revenue.produtos.item1.growth',        'pct',      'year',  5,    'input', jsonb_build_object('label','Taxa crescimento Y5')),
  (1, 'Pressupostos', 'M64', 'revenue.produtos.item1.growth',        'pct',      'year',  6,    'input', jsonb_build_object('label','Taxa crescimento Y6')),

  -- Serviços Prestados — item 1
  (1, 'Pressupostos', 'F66', 'revenue.servicos.item1.name',          'text',     'point', NULL, 'input', jsonb_build_object('label','Nome do item')),
  (1, 'Pressupostos', 'D67', 'revenue.servicos.item1.vat',           'pct',      'point', NULL, 'input', jsonb_build_object('label','IVA aplicável')),
  (1, 'Pressupostos', 'E67', 'revenue.servicos.item1.export_pct',    'pct',      'point', NULL, 'input', jsonb_build_object('label','% Exportação')),
  (1, 'Pressupostos', 'G68', 'revenue.servicos.item1.qty_y0',        'count',    'point', NULL, 'input', jsonb_build_object('label','Quantidade Y0')),
  (1, 'Pressupostos', 'G69', 'revenue.servicos.item1.pvp_y0',        'currency', 'point', NULL, 'input', jsonb_build_object('label','PVP Y0')),
  (1, 'Pressupostos', 'G70', 'revenue.servicos.item1.growth',        'pct',      'year',  0,    'input', jsonb_build_object('label','Taxa crescimento Y0')),
  (1, 'Pressupostos', 'H70', 'revenue.servicos.item1.growth',        'pct',      'year',  1,    'input', jsonb_build_object('label','Taxa crescimento Y1')),
  (1, 'Pressupostos', 'I70', 'revenue.servicos.item1.growth',        'pct',      'year',  2,    'input', jsonb_build_object('label','Taxa crescimento Y2')),
  (1, 'Pressupostos', 'J70', 'revenue.servicos.item1.growth',        'pct',      'year',  3,    'input', jsonb_build_object('label','Taxa crescimento Y3')),
  (1, 'Pressupostos', 'K70', 'revenue.servicos.item1.growth',        'pct',      'year',  4,    'input', jsonb_build_object('label','Taxa crescimento Y4')),
  (1, 'Pressupostos', 'L70', 'revenue.servicos.item1.growth',        'pct',      'year',  5,    'input', jsonb_build_object('label','Taxa crescimento Y5')),
  (1, 'Pressupostos', 'M70', 'revenue.servicos.item1.growth',        'pct',      'year',  6,    'input', jsonb_build_object('label','Taxa crescimento Y6')),

  -- CMVMC coefficients (fraction of revenue for the respective category)
  (1, 'Pressupostos', 'D83', 'cmvmc.mercadorias.coefficient',        'pct',      'point', NULL, 'input', jsonb_build_object('label','% CMV / Vendas de Mercadorias')),
  (1, 'Pressupostos', 'D91', 'cmvmc.produtos.coefficient',           'pct',      'point', NULL, 'input', jsonb_build_object('label','% CMC / Vendas de Produtos'))
ON CONFLICT DO NOTHING;