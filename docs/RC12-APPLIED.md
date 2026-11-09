# RC12 — Estado de aplicação em 9 novembro 2026

## Aplicado
- Anexo i18n sem alterações: PT 1 atualização + 140 adições; EN 121 atualizações + 140 adições.
- Parte 1: ONB-02 — has_role ignora staff suspenso; block/unblock usam has_role; política restritiva em 204/204 tabelas RLS elegíveis.
- Parte 1: FEB-01/FES-08/FEX-01 — sete proteções de esquemas URL confirmadas no catálogo.
- Parte 1: DBP-01/DBP-02/DBP-03/SCH-01/SCH-13 — três índices únicos completos e válidos confirmados.
- Todos os 18 blocos diff da Parte 1 aplicados por correspondência exata do contexto original: contagens, URLs, notificações, carregamento de idioma, redação de tokens, acessibilidade, CommandDialog, papel backoffice e aviso de falha na cópia de pitch deck.
- SQL das três migrações comparado byte-a-byte com os blocos fornecidos; sem divergências. Aplicado pela ferramenta de migrações em drizzle/migrations, conforme o mecanismo obrigatório do projeto, sem criar migrações duplicadas em supabase/migrations.
- 22 regressões adicionadas em queryCount.test.ts, sanitizeUrl.test.ts e logError.redact.test.ts.

## Evidências
- Antes: i18n lint falhava; depois: zero problemas em 688 ficheiros.
- Paridade: 9379 chaves, sem valores vazios.
- Suite completa: 279/279 testes, 41 ficheiros.
- ESLint: exit 0.
- Compilação automática: build OK em 09:59:10 UTC.
- Playwright: /login abre, títulos Startup Leiria e Bem-vindo; nenhum pageerror. Não foi realizado login autenticado nem reserva.
- Leitura do catálogo: has_role md5 ef25422c4c8524dba6f9cfeb797b5b51, valor pós-migração esperado; 204 políticas; sete constraints NOT VALID conforme o pacote; três índices indisunique/indisvalid sem predicado.

## Ainda não aplicado ou certificado
- Pacote opcional 1–3 não aplicado; Partes essenciais 3–15 aplicadas nesta continuação, com evidências abaixo.
- Referências cruzadas da Parte 1 aos restantes domínios (widgets de contagem, páginas públicas de idioma e atributos de links) dependem das partes seguintes.
- A consulta de prova comportamental de has_role foi recusada pela identidade da ferramenta de leitura: `ERROR: 42501: permission denied for function has_role`. Não se alargaram grants para contornar essa proteção. A definição e políticas foram confirmadas, mas não se certificou o fluxo com uma conta suspensa.
- Parte 1 não alterou funções de servidor; Parte 2 publicou as funções afetadas, como detalhado abaixo. Não houve publicação de frontend.
- Não ocorreram erros de migração nem de compilação nas alterações aplicadas.

O RC12 completo e a release final não estão certificados por esta ronda.

## Continuação — Parte 2
- Aplicados os nove diffs compatíveis: HRD-02/ED4-09/ED1-03/HRD-15 (contas inativas e destinatários aprovados); HRD-07/ED3-12/ED3-13/ED3-14/FES-15/FES-14/FEX-15 (Copilot, histórico, limite por utilizador, contexto de papel e acessibilidade).
- A proteção isAccountActive usa um contrato estrutural mínimo para aceitar as duas versões já instaladas do cliente; não houve casts para contornar diferenças de API.
- Exceção técnica obrigatória ao diff de transporte: o Copilot passou a usar o Gateway SDK servidor, preservando google/gemini-3-flash-preview, SSE, cancelamento e ausência de replay automático (maxRetries: 0). Catálogo confirmou workspace_models=included e chat-completions com retenção zero. Nenhum modelo foi substituído.
- Os imports transitivos foram enumerados a partir dos ficheiros atuais: 71 funções publicadas; copilot-chat republicado após ajuste da declaração de tipos.
- 282/282 testes Vitest; 56/56 testes Deno direcionados; ESLint e dois gates i18n passaram. Cinco funções alteradas passaram deno check. Build automática OK às 10:15:40 UTC.
- Regressões do histórico longo falharam antes da correção (5 passaram, 2 falharam) e passaram depois. Novos testes cobrem 20 mensagens/4000 caracteres, limite 30 por hora sem workspace, JSON inválido, falha fechada, continuidade de stream durante 40 segundos e recuperação após 15 segundos.
- O cache gerado pelo mecanismo de pré-visualização apareceu no lint após instalar a dependência; .oj-cache foi excluído por ser saída gerada, não código da aplicação.

### Limites de verificação da Parte 2
- Pedido alojado sem autenticação devolveu 401, como esperado.
- Playwright autenticado na conta do requerente abriu o Copilot e enviou texto real. A resposta não chegou: pedido interrompido pelo limite de inatividade, sem erros JS; na tentativa anterior foi mostrado o estado de indisponibilidade. Não se certificou geração real de IA. Logs alojados mostraram apenas arranque, não erro do modelo.
- Vários pedidos de dados também foram interrompidos durante a verificação. Estes sinais não provam falha do modelo nem certificam os restantes fluxos administrativos.
- Não foram enviados emails reais, alterados contratos, desbloqueadas contas nem executadas importações.
- Sem migrações nesta parte. Erros temporários de tipos e lint foram corrigidos; verificações finais sem erros.

## Continuação — Partes 3–15
- Aplicados todos os diffs das Partes 3–15, os sete novos módulos, a substituição integral fornecida para AdminBackoffice, a substituição da regressão de portefólio por pgTAP e o skip do XLSM quando falta a fixture canónica.
- Partes 3–4: navegação, alertas de leitura falhada, contagens, sanitização de links, locale, isolamento de rascunhos, exportação de ações e leitura completa de utilizadores.
- Partes 5–6: importação, onboarding, convites, reutilização por NIF, isolamento Data Room, notas de mentor, monitorização partial, promoção CRM, integration_errors, retenção, índices, links antigos, prazos e atividade entre separadores.
- Partes 7–11: armazenamento seguro, palavra-passe/login/convites, fragmentos, recuperação de webhooks, assinatura e ativação, marcação/agenda, importação CSV, guardas de conta, cron, relatórios e filtros defensivos.
- Partes 12–15: filtros de saúde, pesquisa/paleta, mentor/check-in, alertas de sistema, permissões de administração, separadores e filtros, relatórios, rotas antigas, testes e jobs CI.
- Dez migrações novas em drizzle/migrations/0022–0031, sem editar migrações anteriores nem types.ts manualmente. As reparações DML e a expectativa da purga correram separadamente pela ferramenta de dados.
- integration_errors usa public.profiles para resolved_by, não auth.users, e grants imediatamente após CREATE TABLE: adaptações obrigatórias às regras Cloud. A política restritiva de suspensão foi confirmada no catálogo.
- SQL foi submetido com formatação compactada, preservando condições e guardas. Os hashes finais de claim_startup, ensure_contract_workspace e check_automation_health diferem dos hashes pós-patch previstos devido a comentários/formatação; a reexecução literal dos blocos fornecidos para essas funções poderá abortar. Não foram desativados guardas. Os hashes reais estão no catálogo e os SQL aplicados permanecem no histórico.
- O parser inicial marcou dois diffs como divergentes por não interpretar `No newline at end of file`; corrigida essa interpretação, ambos aplicaram sem adaptação funcional.
- O diff de useExportData inseriu o carregamento de donos no primeiro `if (error)` correspondente, na exportação de sessões. O build identificou owner_user_id ausente e owners fora de âmbito; o bloco foi movido para useExportActions, sem alterar a finalidade pedida.
- assertStaff de bulk-import-leads usa o tipo concretizado do cliente para resolver incompatibilidade genérica; mocks lifecycleSync/webhookInbox ganharam not/lt para acompanhar os filtros novos, sem enfraquecer asserções.

### Evidências atuais
- Vitest: 288 testes em 43 ficheiros; Deno: 198 passam, zero falhas, cinco ignorados (três XLSM sem fixture e dois testes de performance já condicionais).
- Adicionadas 17 regressões concretas: três prazos, três permissões, cinco CSV e seis regras de slots.
- Replay isolado: migrações legadas sem falhas; Drizzle completo aplicado com a fixture local existente para playbook_template_assignments, ausente no replay legado. Sem acesso a dados alojados pelo harness.
- Cinco suites pgTAP: rc10_part3 17, pulse_notifications_kill_switch 8, log_completed_session_atomic 22, crm_contracted_conversion 9, portfolio_archived_actions 5; total 61 asserções, zero falhas/erros.
- 31 funções diretamente alteradas passaram deno check; 45 funções diretas/transitivas publicadas com sucesso.
- ESLint e gates i18n passam: 699 ficheiros, zero problemas, 9379 chaves em paridade. Build automática OK às 10:50:44 UTC.
- Playwright autenticado abriu Espaços, mudou para Contratos e confirmou novamente Espaços; zero pageerrors. Não certifica Back do browser: o ensaio inicial ficou em Contratos devido à alteração de query de um painel interno.
- Catálogo alojado confirmou integration_errors, guarda Data Room, política de suspensão, purga agendada e remoção do índice de texto livre. Hashes de onboarding/convites/filtros confirmam alterações aplicadas.

### Limites
- Frontend não publicado; funções e alterações de dados já aplicadas no serviço partilhado.
- Não foram enviados convites/emails nem executadas assinaturas/importações reais. Entregas externas, Copilot real, todos os ramos de permissões e workflow num runner GitHub continuam sem certificação.
- A suite pgTAP completa não foi executada: foram executadas as cinco suites afetadas pela Parte 15, com replay completo e guardas aplicados.
- Pacote opcional permanece fora desta ronda, conforme o pedido exclusivo das Partes 3–15.

## Continuação 10:58 UTC — pacote opcional
- Aplicados os 29 diffs compatíveis das Partes opcionais 1–3 e criado sessionInviteOutcome.ts antes do seu import. Todos os contextos foram comparados; não houve secções com contexto divergente.
- Parte 1: FEF-11 notificações por pertença founder; DBP-04 seis helpers de conjunto e reescrita das políticas de oito tabelas; CRM-08 reset de lembretes; DBP-10/11/12 triggers updated_at, FKs e remoção do trigger Auth redundante; OPS-13 URL cron configurável; FEX-02 limpeza de draft antigo; FEX-20 tema inicial; E2E-13/SIGN-12 guarda repetida removida; CRM-09 notas nos lembretes; ED1-10 reclamação de job e validação de row_ids; ED2-13 primeiro aceite NDA preservado; ED2-14 reclamação de linhas HubSpot; ED2-15 token de convite validado.
- Parte 2: ED2-10/11/12 auth de survey antes da leitura, auditoria preservada e pesquisa de marco; ED1-08/SCH-17 agregação de marcos em atraso e prazo Teams; HRD-13 interseção de destinatários e aviso de falha parcial no diálogo; CRM-06 assuntos de intake/recipients JSON; SCH-10 nome do documento com workspace; SCH-13 insert Graph com dedupe; SCH-14 consultor atribuído nas tarefas; OPS-11 ordem de snapshots; SCH-17 URLs canónicos; ED1-09 permissões e repetição de playbook; ED2-09 exportação paginada; SCH-09 contexto financeiro por startup; ED3-15 revogação idempotente.
- Parte 3: teste de privilégios inclui purge_operational_logs; .env.example só documenta nomes; harness remove GUC PG17-only, preserva REVOKE e tolera SIGPIPE de diagnóstico.
- Cinco migrações aplicadas em drizzle/migrations/0032–0036. Hashes alojados FEF-11 e OPS-13 correspondem exatamente aos hashes pós-patch fornecidos. Restrição de suspensão permanece em todas as oito tabelas quentes. Os sete buckets já existem com as flags descritas: nenhum alterado, nenhuma escrita direta em storage.buckets.
- Adaptações obrigatórias: FK survey_writebacks.applied_by aponta public.profiles com SET NULL e NOT VALID, em vez de nova FK para auth.users; falta de segredo HMAC ou leitura da prova NDA recusa sucesso, sem segredo previsível nem timestamp inventado; valores validados estreitados sem novas asserções não nulas; configuração gerida não editada.

### Evidências opcionais
- 298 Vitest, 45 ficheiros; 202 Deno aprovados, cinco ignorados. 22 funções alteradas passam deno check com a configuração do projeto; 23 funções diretas/transitivas publicadas.
- 37 suites SQL na base descartável reutilizada, 373 asserções, zero falhas. Inclui 12 novas asserções concretas de lembretes, pertença, suspensão, notificações e privilégios; oito testes de resultado de convites, dois de isolamento de drafts e quatro de interseção de destinatários.
- Lint, i18n (702 ficheiros/zero problemas) e secret scan (1709 ficheiros) passaram. Compilação automática sem erros.
- Playwright autenticado abriu /my-workspaces na conta do requerente com portefólio real. Pedidos de teste inválidos às funções não chegaram por falha de rede: respostas HTTP 400 alojadas não certificadas. Não enviados emails, convites, assinaturas nem importações reais.
- Primeira execução Deno sem --config falhou com sete erros de import JSZip/Buffer; repetida com supabase/functions/deno.json, 202 testes e todas as verificações direcionadas passaram. Não foi alterada a biblioteca para contornar uma configuração ausente.

### Secções bloqueadas ou sem patch fornecido
- supabase/config.toml [db] major_version: não aplicado porque é configuração gerida. A versão usada pelo CLI externo continua por verificar.
- SCH-16 criação de buckets no replay: SQL direto em storage.buckets é proibido; buckets alojados verificados, restauro novo não certificado pelo pacote.
- E2E-05 teste de 18 asserções, FEX-21 testes citados sem conteúdo, HRD-10 createLogger.error, ED2-06/FEF-07 DataroomTab e OPS-14 documentos/runbooks: o anexo descreve ou remete para diffs que não inclui; não foram inventados. SCH-11 e i18n já corrigidos no essencial.
- Transporte de generate-financial-prefill não foi alterado: apenas a seleção/contexto solicitados. O modelo desse fluxo não foi substituído pelo modelo Copilot.
- Frontend não publicado. Entrega real de convites, assinatura, importações, recuperação de ativação e geração real Copilot mantêm os limites anteriores; suite SQL reutilizada não certifica reconstrução nova completa.

## 9 November 2026 — completion authorised from descriptions

The user authorised filling the absent material. No hosted data repair, real email/invitation/signature/import,
provider dispatch, bucket mutation or frontend publication was performed in this completion round.

### Delivered

- FEX-21: lazyWithRetry storage (4), viewer-scoped checklist storage (2), SessionTimeoutWarning (4),
  useAttentionCount (5), and actual ProtectedRoute (12): 27 new Vitest regressions.
- Real reproduced fixes: blocked storage cannot cause repeated chunk reload; checklist dismissal cannot carry
  across viewers; inactivity is the established eight hours, expiry signs out once, failed refresh does not reset
  inactivity; assigned-only attention excludes historical membership and overdue actions under archived milestones.
- Route guard extracted without duplicating its access logic; pending/suspended/NDA/auth errors, deep links,
  onboarding/claim and staff/admin gates covered by mocked server-loaded state.
- E2E-05/ED3-05/SCH-03/FEF-11/FEB-01/FES-08: complete 18-assertion transactional SQL suite for normalized NIF
  reuse/idempotence/no unsigned activation, Data Room insert/update containment, permitted shared mentor note,
  forbidden staff-private/suspended note, founder notification kill switch and dangerous URL schemes.
- OPS-14: fourteen executable read-only queries, weekly backup/checksum/restore review, failure response,
  current go-live/staging/release procedures and native seven-bucket bootstrap guidance. Existing private
  logos/avatar policy retained rather than following the attachment's superseded public-bucket proposal.
- Automation manifest matches 25 actual permanent schedules plus known dynamic activation recovery and three
  event endpoints; reconciler is read-only and checks exact schedules/targets/active state/registry cadence.
  Purge logs has no existing health expectation: explicitly declared, not silently invented. Twelve regressions pass.
- PostgreSQL 17 CI local replay configured; removed a CI reference to nonexistent check-drizzle-mirrored.mjs.
  Added verify-rc12-fresh.sh to explicitly replay the baseline, disposable legacy-table fixture and 37 approved
  additive migrations. It rejects reused clusters, ignored failures and non-17 engines, and removes hosted PG env.

### Verification results

- Vitest: 50 files, 325 tests passed. Manifest: 12 node tests passed. Lint, i18n parity/lint and secret scan passed.
- Clean PostgreSQL 17.11 initial baseline-only run failed, correctly identifying omitted additive migrations.
  Final verify-rc12-fresh.sh run used a NEW empty directory, replayed baseline + all approved additive migrations,
  and passed 38 SQL suites / 391 assertions, zero failures/errors. No production connections used.
- Fourteen operational SQL queries executed without syntax/runtime errors against that disposable database.
  Expected empty shim buckets/backup data are NOT a passing restore/backup certification.
- Read-only reconciler passed on the complete disposable catalogue: 29 manifest entries / 25 schedules.
  Initial local connection failed because inherited SSL was enabled; local socket retry with sslmode=disable passed.
- Browser restored requester's authenticated session, opened /my-workspaces, displayed the real dashboard
  (42 startups, portfolio health and onboarding pipeline), zero JavaScript errors; screenshot reviewed.
  This verifies the extracted guard's actual authenticated rendering, not every privileged branch or live provider flow.
- Automatic compilation latest signals: build OK. No edge function changes in this round, therefore no deployment needed.

### Remaining release gates (not missing patches)

Hosted CI execution and managed PostgreSQL configuration are not certified by editing CI. Native bootstrap/upload/access
on a NEW isolated managed stack, real sandbox Graph/email/invitation/signature/activation/import/Copilot flows and backup
restore require the isolated stack, test mailbox/provider identities and operational owner not supplied here.
Frontend remains unpublished. The absent DADOS-AFETADOS.sql is not fabricated or required to execute repairs:
read-only operational checks are supplied separately and no live records were changed.
Earlier claims that logger and Data Room patches were absent are corrected: both were supplied/applied in the essential package.
