-- Seed 14 new playbooks + items (PT, você form)

INSERT INTO public.playbooks (stage, title, description, is_active) VALUES
  ('ideation', 'Lean Canvas em 7 Dias', 'Estruturar o modelo de negócio numa página e identificar as hipóteses mais arriscadas.', true),
  ('ideation', 'Estudo de Mercado Rápido', 'Dimensionar o mercado e conhecer a concorrência sem gastar dinheiro — em duas semanas.', true),
  ('ideation', 'Marca e Propriedade Intelectual (INPI)', 'Proteger o nome, a marca e o que a sua startup cria — antes que alguém o faça primeiro.', true),
  ('validation', 'Primeiros 10 Clientes', 'Conseguir os primeiros 10 clientes reais (pagantes ou pilotos comprometidos) através de venda direta.', true),
  ('validation', 'Pricing e Disposição a Pagar', 'Descobrir quanto os clientes pagam de facto — e escolher um modelo de preço com confiança.', true),
  ('validation', 'Constituição e Obrigações Legais', 'Constituir a empresa e ficar em dia com as obrigações fiscais e legais em Portugal.', true),
  ('mvp', 'Plano de Lançamento (Go-to-Market)', 'Planear e executar o lançamento do MVP: mensagem, canal e meta de primeiros utilizadores.', true),
  ('mvp', 'Modelo Financeiro e Unit Economics', 'Construir um modelo financeiro simples que responda: quanto custa servir um cliente e quando acaba o dinheiro?', true),
  ('mvp', 'Presença Digital e RGPD', 'Site, analytics e conformidade RGPD — o mínimo profissional para receber clientes e investidores.', true),
  ('growth', 'Máquina de Vendas B2B', 'Transformar vendas artesanais num funil repetível com etapas, números e cadência semanal.', true),
  ('growth', 'Primeira Contratação', 'Contratar a primeira pessoa sem se enganar: função, custo real, contrato e integração.', true),
  ('growth', 'Financiamento Público (Portugal 2030 e Vouchers)', 'Identificar e candidatar-se aos apoios públicos certos — sem se perder na burocracia.', true),
  ('growth', 'Investment Readiness e Pitch Deck', 'Preparar a startup para conversas com investidores: narrativa, deck, dataroom e lista de alvos.', true),
  ('scale', 'Internacionalização — Primeiro Mercado Externo', 'Escolher e testar o primeiro mercado internacional com risco controlado.', true)
ON CONFLICT DO NOTHING;

-- 1. Lean Canvas em 7 Dias
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Canvas completo', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Preencher os 9 blocos do Lean Canvas (rascunho)', NULL, 2, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Identificar as 3 hipóteses mais arriscadas', NULL, 3, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Rever o canvas com o consultor', NULL, 5, 'medium', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Hipóteses priorizadas para teste', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Definir 1 teste barato por hipótese (entrevista, landing page, pré-venda)', NULL, 7, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Agendar os testes no calendário', NULL, 7, 'medium', 7, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Lean Canvas em 7 Dias'
ON CONFLICT DO NOTHING;

-- 2. Estudo de Mercado Rápido
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Mercado dimensionado', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Estimar TAM/SAM/SOM com fontes públicas (INE, Pordata, relatórios setoriais)', NULL, 5, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Mapear 5-8 concorrentes diretos e indiretos numa tabela comparativa', NULL, 7, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Identificar o diferenciador defensável face a cada concorrente', NULL, 10, 'medium', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Síntese validada', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Escrever one-pager de mercado (dimensão, tendências, lacuna)', NULL, 12, 'medium', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Apresentar ao consultor e registar feedback', NULL, 14, 'medium', 7, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Estudo de Mercado Rápido'
ON CONFLICT DO NOTHING;

-- 3. Marca e Propriedade Intelectual (INPI)
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Nome e marca verificados', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Pesquisar disponibilidade do nome no INPI e registos de domínio', NULL, 3, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Verificar disponibilidade nas redes sociais relevantes', NULL, 3, 'low', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Submeter pedido de registo de marca nacional no INPI', NULL, 14, 'high', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Estratégia de PI definida', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Listar o que é protegível (marca, design, patente, segredo comercial)', NULL, 10, 'medium', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Decidir com o consultor o que registar agora vs mais tarde', NULL, 14, 'medium', 7, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Marca e Propriedade Intelectual (INPI)'
ON CONFLICT DO NOTHING;

-- 4. Primeiros 10 Clientes
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Pipeline inicial construído', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Listar 50 potenciais clientes com contacto direto', NULL, 5, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Escrever mensagem de abordagem (email/LinkedIn) e testar em 10 contactos', NULL, 7, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Marcar as primeiras 5 conversas', NULL, 10, 'high', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Primeiros compromissos', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Fazer 10 conversas de venda e registar objeções', NULL, 21, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Fechar 3 pilotos ou pré-vendas com data e valor', NULL, 30, 'urgent', 7, '{"milestone_ref":"M2"}'),
  ('action', 'Documentar o que fez os "sins" dizerem sim', NULL, 30, 'medium', 8, '{"milestone_ref":"M2"}'),
  ('milestone', '10 clientes', NULL, NULL, NULL, 9, '{"ref":"M3"}'),
  ('action', 'Repetir o ciclo até 10 clientes/pilotos ativos', NULL, 60, 'high', 10, '{"milestone_ref":"M3"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Primeiros 10 Clientes'
ON CONFLICT DO NOTHING;

-- 5. Pricing e Disposição a Pagar
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Dados de valor recolhidos', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Perguntar a 10 clientes/prospects o custo atual do problema', NULL, 7, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Testar 3 âncoras de preço em conversas reais (Van Westendorp simplificado)', NULL, 14, 'high', 3, '{"milestone_ref":"M1"}'),
  ('milestone', 'Modelo de preço escolhido', NULL, NULL, NULL, 4, '{"ref":"M2"}'),
  ('action', 'Comparar 3 modelos (subscrição, uso, one-off) contra o custo de servir', NULL, 18, 'medium', 5, '{"milestone_ref":"M2"}'),
  ('action', 'Definir tabela de preços v1 com justificação', NULL, 21, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Validar a tabela com 3 vendas reais', NULL, 35, 'urgent', 7, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Pricing e Disposição a Pagar'
ON CONFLICT DO NOTHING;

-- 6. Constituição e Obrigações Legais
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Empresa constituída', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Escolher forma jurídica com apoio do consultor (LDA, unipessoal)', NULL, 5, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Constituir via Empresa na Hora / Empresa Online e obter NIPC', NULL, 12, 'urgent', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Abrir conta bancária empresarial', NULL, 15, 'high', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Obrigações em dia', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Contratar contabilista certificado e entregar declaração de início de atividade', NULL, 20, 'urgent', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Verificar enquadramento IVA e obrigações de faturação (software certificado)', NULL, 25, 'high', 7, '{"milestone_ref":"M2"}'),
  ('action', 'Registar beneficiário efetivo (RCBE)', NULL, 30, 'high', 8, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Constituição e Obrigações Legais'
ON CONFLICT DO NOTHING;

-- 7. Plano de Lançamento (Go-to-Market)
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Mensagem e canal definidos', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Escrever proposta de valor em uma frase (teste: a sua avó entende?)', NULL, 3, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Escolher UM canal principal de lançamento e justificar', NULL, 5, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Preparar página de destino com chamada clara para ação', NULL, 10, 'high', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Lançamento executado', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Definir meta de lançamento (ex.: 100 registos / 10 demos em 30 dias)', NULL, 10, 'medium', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Lançar e promover no canal escolhido durante 2 semanas', NULL, 24, 'urgent', 7, '{"milestone_ref":"M2"}'),
  ('action', 'Rever números vs meta com o consultor e decidir próximo passo', NULL, 30, 'high', 8, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Plano de Lançamento (Go-to-Market)'
ON CONFLICT DO NOTHING;

-- 8. Modelo Financeiro e Unit Economics
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Modelo v1 construído', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Preencher o template de modelo financeiro da plataforma (Documentos → Modelo Financeiro)', NULL, 7, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Calcular CAC e LTV com os dados reais que tem (mesmo poucos)', NULL, 10, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Calcular runway atual e cenário pessimista', NULL, 10, 'urgent', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Modelo validado e em uso', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Rever pressupostos com o consultor', NULL, 14, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Definir os 3 números a acompanhar mensalmente nos KPIs', NULL, 15, 'medium', 7, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Modelo Financeiro e Unit Economics'
ON CONFLICT DO NOTHING;

-- 9. Presença Digital e RGPD
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Presença online no ar', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Publicar site com proposta de valor, contacto e prova social', NULL, 10, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Configurar analytics e definir os 3 eventos que interessam', NULL, 12, 'medium', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Criar perfil de empresa no LinkedIn e Google Business', NULL, 12, 'low', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Conformidade básica', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Publicar política de privacidade e banner de cookies conformes', NULL, 15, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Verificar base legal para emails de marketing (consentimento)', NULL, 18, 'medium', 7, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Presença Digital e RGPD'
ON CONFLICT DO NOTHING;

-- 10. Máquina de Vendas B2B
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Funil desenhado', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Definir etapas do funil e critérios de passagem', NULL, 5, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Migrar todos os contactos ativos para o funil', NULL, 8, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Definir cadência semanal de follow-up', NULL, 8, 'medium', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Funil a produzir', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Medir taxa de conversão por etapa durante 4 semanas', NULL, 36, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Identificar a etapa com maior fuga e testar 2 melhorias', NULL, 45, 'high', 7, '{"milestone_ref":"M2"}'),
  ('action', 'Documentar o processo de venda para poder delegar', NULL, 50, 'medium', 8, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Máquina de Vendas B2B'
ON CONFLICT DO NOTHING;

-- 11. Primeira Contratação
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Decisão preparada', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Escrever a função em resultados esperados (não tarefas)', NULL, 5, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Calcular custo total anual (salário + TSU + subsídios) e impacto no runway', NULL, 7, 'urgent', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Escolher tipo de contrato com apoio do contabilista/consultor', NULL, 10, 'high', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Pessoa contratada e integrada', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Publicar oferta e entrevistar pelo menos 5 candidatos', NULL, 30, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Fazer proposta e comunicar admissão à Segurança Social antes do início', NULL, 40, 'urgent', 7, '{"milestone_ref":"M2"}'),
  ('action', 'Preparar plano de integração de 30 dias', NULL, 42, 'medium', 8, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Primeira Contratação'
ON CONFLICT DO NOTHING;

-- 12. Financiamento Público (Portugal 2030 e Vouchers)
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Apoios mapeados', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Levantar avisos abertos relevantes (Portugal 2030, PRR, vouchers StartUP Portugal, IAPMEI)', NULL, 7, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Verificar elegibilidade e prazos com o consultor', NULL, 10, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Escolher 1-2 candidaturas prioritárias', NULL, 12, 'high', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Candidatura submetida', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Reunir documentação (certidões, IES, declaração de não dívida)', NULL, 25, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Escrever a memória descritiva com apoio do consultor', NULL, 35, 'high', 7, '{"milestone_ref":"M2"}'),
  ('action', 'Submeter no Balcão dos Fundos antes do prazo', NULL, 45, 'urgent', 8, '{"milestone_ref":"M2"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Financiamento Público (Portugal 2030 e Vouchers)'
ON CONFLICT DO NOTHING;

-- 13. Investment Readiness e Pitch Deck
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Deck e narrativa prontos', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Estruturar deck de 10-12 slides (usar template da plataforma)', NULL, 10, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Ensaiar o pitch de 3 minutos com o consultor e um mentor', NULL, 15, 'high', 3, '{"milestone_ref":"M1"}'),
  ('milestone', 'Dataroom preparado', NULL, NULL, NULL, 4, '{"ref":"M2"}'),
  ('action', 'Organizar o Data Room na plataforma (contratos, contas, cap table, métricas)', NULL, 20, 'high', 5, '{"milestone_ref":"M2"}'),
  ('action', 'Preparar respostas aos 10 pedidos de due diligence mais comuns', NULL, 25, 'medium', 6, '{"milestone_ref":"M2"}'),
  ('milestone', 'Conversas iniciadas', NULL, NULL, NULL, 7, '{"ref":"M3"}'),
  ('action', 'Construir lista de 20 investidores adequados à fase (BAs, micro-VCs, Portugal Ventures)', NULL, 25, 'medium', 8, '{"milestone_ref":"M3"}'),
  ('action', 'Conseguir 5 primeiras reuniões por via quente', NULL, 45, 'high', 9, '{"milestone_ref":"M3"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Investment Readiness e Pitch Deck'
ON CONFLICT DO NOTHING;

-- 14. Internacionalização — Primeiro Mercado Externo
INSERT INTO public.playbook_items (playbook_id, item_type, title, description, relative_due_days, priority, order_index, metadata_json)
SELECT p.id, i.item_type, i.title, i.description, i.relative_due_days, i.priority, i.order_index, i.metadata_json::jsonb
FROM public.playbooks p CROSS JOIN (VALUES
  ('milestone', 'Mercado escolhido', NULL, NULL, NULL, 1, '{"ref":"M1"}'),
  ('action', 'Comparar 3 mercados candidatos (dimensão, concorrência, barreiras, língua)', NULL, 10, 'high', 2, '{"milestone_ref":"M1"}'),
  ('action', 'Falar com 5 potenciais clientes do mercado-alvo', NULL, 20, 'high', 3, '{"milestone_ref":"M1"}'),
  ('action', 'Verificar requisitos legais/fiscais de venda para esse mercado', NULL, 25, 'medium', 4, '{"milestone_ref":"M1"}'),
  ('milestone', 'Teste em curso', NULL, NULL, NULL, 5, '{"ref":"M2"}'),
  ('action', 'Definir experiência mínima de entrada (ex.: 10 clientes remotos em 90 dias)', NULL, 28, 'high', 6, '{"milestone_ref":"M2"}'),
  ('action', 'Adaptar materiais de venda à língua/contexto local', NULL, 35, 'medium', 7, '{"milestone_ref":"M2"}'),
  ('action', 'Explorar apoios AICEP à exportação', NULL, 30, 'low', 8, '{"milestone_ref":"M2"}'),
  ('milestone', 'Decisão go/no-go', NULL, NULL, NULL, 9, '{"ref":"M3"}'),
  ('action', 'Rever resultados do teste com o consultor e decidir investimento', NULL, 90, 'high', 10, '{"milestone_ref":"M3"}')
) AS i(item_type, title, description, relative_due_days, priority, order_index, metadata_json)
WHERE p.title = 'Internacionalização — Primeiro Mercado Externo'
ON CONFLICT DO NOTHING;
