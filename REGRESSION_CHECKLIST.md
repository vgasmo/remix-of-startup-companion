> **SUPERSEDED** — documento histórico. O estado em vigor está em `PUBLISH_READY.md`.

# Regression Checklist — Startup Leiria Ecosystem OS (Release Candidate RC-3)

**Date**: 2026-02-20  
**Tested by**: Automated + Manual Audit  

## Per-Profile Journeys

### Founder
- [x] Login → Dashboard com "Próxima melhor ação" visível
- [x] Sidebar: "A Minha Startup" expande com sub-itens (Objetivos, Sessões, Ações)
- [x] Criar startup via formulário → candidatura pendente
- [x] Workspace aprovado → aceder Objetivos & KPIs, atualizar valores
- [x] Sessões & Mentoria → criar sessão, gerar resumo IA, criar ações
- [x] Ações & Plano → criar ação, marcar como concluída
- [x] Documentos → carregar ficheiro, adicionar link, ver templates
- [x] Playbooks → aplicar playbook, descartar playbook (sem erro RLS)
- [x] Rede & Recursos → pesquisar, ver recomendações
- [x] Glossário & FAQ → pesquisar perguntas, ver glossário
- [x] Pedir mentor → pedido visível e rastreável
- [x] Dataroom → adicionar item, criar link de partilha

### Mentor Externo
- [x] Login → NDA gate se necessário
- [x] Dashboard com startups atribuídas
- [x] Ver detalhes da startup (KPIs, ações, última sessão)
- [x] Agenda e pedidos de mentoria
- [x] Preparação de sessão + notas
- [x] Sem itens de CRM/Admin visíveis no menu

### Consultor Interno
- [x] Login → Portefólio com alertas/risco
- [x] CRM Pipeline → clicar lead → drawer abre como overlay (sem empurrar conteúdo)
- [x] CRM → criar lead, mover entre stages
- [x] Sessões → agendar, preparar, registar notas
- [x] Ações & Follow-ups → ver ações atrasadas
- [x] Documentos (repositório global) → pesquisar, filtrar
- [x] Programas → configurar, gerir coortes
- [x] Relatórios → visualizar analytics
- [x] Templates e playbooks → aplicar a workspace

### Administrativo
- [x] Login → Admin dashboard
- [x] Utilizadores & Permissões → aprovar conta, atribuir roles
- [x] Programas & Coortes → criar programa, configurar módulos
- [x] Configuração do Sistema → integrações, feature flags
- [x] Contratos / Lifecycle Hub → ver alertas, converter leads
- [x] Datarooms → gerir partilhas
- [x] Infraestrutura → Mapa interativo com pins, drawer de espaço, editor de mapa
- [x] Infraestrutura → Lista de espaços, filtros por estado, pesquisa

## Per-Module Checks

### CRM Pipeline
- [x] Board view renderiza corretamente
- [x] Drawer abre como Sheet overlay (não empurra layout)
- [x] Tabs (Overview, Timeline, Tasks) funcionam
- [x] Empty states com mensagem clara
- [x] Stages traduzidas PT-PT

### Workspaces / Startups
- [x] Imagem de startup carrega corretamente
- [x] Tabs da workspace não duplicam menu lateral
- [x] Workspace bloqueado mostra mensagem adequada
- [x] Workspace pendente restringe acesso

### Infraestrutura (Mapa Operacional)
- [x] PDF floor maps renderizam via PDF.js
- [x] Pins clicáveis com tooltip (nome, ocupante, tenure)
- [x] SVG shapes (rect/polygon) com fill por estado
- [x] Drawer "Espaço" com estado, ocupante, ações
- [x] Edit mode: clicar no mapa → pesquisar sala → colocar pin
- [x] RoomShapeEditor para rect/polygon/pin
- [x] Legenda com contagem de salas mapeadas
- [x] Pesquisa de salas abaixo do mapa
- [x] Lista de espera funcional

### Programas / Coortes
- [x] Criar programa com wizard
- [x] Clonar programa existente
- [x] Atribuir startups a coortes

### Documentos & Templates
- [x] Repositório com 2 tabs (Documentos, Templates)
- [x] Pesquisa e filtro por categoria funcionam
- [x] Datas formatadas no locale correto (PT)
- [x] Upload funcional, download funcional
- [x] Links externos abrem em nova tab

### Sessões & Mentoria
- [x] Criar sessão com data/hora
- [x] Enviar convite (email/ICS)
- [x] Notas e decisões editáveis
- [x] Análise IA gera resumo e ações
- [x] Link Teams/Meet quando disponível

### KPIs & Objetivos
- [x] Definir KPIs para workspace
- [x] Atualizar valores mensais
- [x] Visualizar gráficos de tendência
- [x] Benchmarks / percentis visíveis

### Localização (i18n)
- [x] Zero strings EN visíveis em modo PT
- [x] Datas formatadas em PT (date-fns locale)
- [x] Categorias de documentos traduzidas
- [x] Stages do CRM traduzidas

### Acessibilidade (Tabs)
- [x] Tabs usam Radix `TabsList`/`TabsTrigger`/`TabsContent` (correct `role=tablist/tab/tabpanel`)
- [x] Keyboard navigation via Radix built-in (arrow keys, Enter, Space)
- [x] `aria-selected` managed automatically by Radix
- [x] Room cards have `role="button"`, `tabIndex={0}`, `onKeyDown` handlers

### Segurança
- [x] Sem service role no frontend (0 matches)
- [x] Edge functions falham de forma clara se env vars faltarem
- [x] RLS suporta todas as operações
- [x] SECURITY_NOTES.md com allowlist completa
- [x] Workspace pendente não acede a tabelas sensíveis
- [x] Public booking com token inválido retorna erro seguro

## Build Acceptance
- [x] `npm run build` PASS (Vite)
- [x] `npm run lint` PASS (ESLint)
- [x] `npx tsc --noEmit -p tsconfig.typecheck.json` PASS
- [x] Zero erros na consola nas rotas principais
- [x] Sem mistura de idiomas no UI (PT-PT first)
- [x] Empty states sempre com explicação + CTA

## GO / NO-GO

| Área | Estado | Notas |
|------|--------|-------|
| Build & Types | ✅ PASS | CI: lint + typecheck + build |
| Vitest | ✅ PASS | 10 test files, all green |
| i18n Parity | ✅ PASS | ~3900+ keys synced EN↔PT |
| i18n Lint | ✅ PASS | 0 duplicates, 0 EN-in-PT |
| Segurança / RLS | ✅ PASS | SECURITY_NOTES.md complete |
| CRM | ✅ PASS | Pipeline + drawer functional |
| Documentos | ✅ PASS | Upload/download/search |
| Infraestrutura | ✅ PASS | Map + pins + drawer + editor |
| Sessões | ✅ PASS | Create + AI + notes |
| Integrações | ✅ PASS | Teams/Outlook/ICS |
| Empty States | ✅ PASS | All modules covered |
| Acessibilidade | ✅ PASS | Radix tabs + keyboard nav |
| Secret Scan | ✅ PASS | scripts/secret-scan.cjs |

**Decisão**: ✅ **GO**  
**Data**: 2026-02-20
