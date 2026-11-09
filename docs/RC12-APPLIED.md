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
- Partes essenciais 2–15 e pacote opcional 1–3 não foram aplicados nesta ronda.
- Referências cruzadas da Parte 1 aos restantes domínios (widgets de contagem, páginas públicas de idioma e atributos de links) dependem das partes seguintes.
- A consulta de prova comportamental de has_role foi recusada pela identidade da ferramenta de leitura: `ERROR: 42501: permission denied for function has_role`. Não se alargaram grants para contornar essa proteção. A definição e políticas foram confirmadas, mas não se certificou o fluxo com uma conta suspensa.
- Nenhuma função de servidor alterada nesta ronda; não houve publicação de frontend.
- Não ocorreram erros de migração nem de compilação nas alterações aplicadas.

O RC12 completo e a release final não estão certificados por esta ronda.