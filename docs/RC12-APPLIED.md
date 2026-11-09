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
- Partes essenciais 3–15 e pacote opcional 1–3 ainda não foram aplicados.
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