# Como criar o ambiente de teste (staging) da RC5

Objetivo: ter um ambiente separado, com dados e contas próprias, onde a
verificação automática possa provar o comportamento real da aplicação. Só depois
disso o `PUBLISH_READY.md` pode passar a **READY**.

## Recomendação

**Duplicar este projeto no Lovable** é a opção recomendada.

| | Projeto Lovable duplicado (recomendado) | Projeto de backend externo |
|---|---|---|
| Esforço | Baixo — backend criado automaticamente | Alto — conta, projeto e configuração manuais |
| Igualdade com produção | Idêntica (mesma plataforma, mesmas migrações) | Aproximada; risco de divergir |
| Chave de serviço para testes | Não é acessível na plataforma | Acessível |
| Custo | Incluído | Plano próprio do fornecedor |

Consequência importante: os passos que exigem a chave de serviço (criar as contas
de teste e apagar dados de teste) precisam dessa chave. Se optar pelo projeto
duplicado no Lovable, essa chave não é disponibilizada, e há duas saídas:

1. Criar as 5 contas de teste manualmente no ambiente duplicado (registo normal +
   aprovação por um administrador). Simples e suficiente para os testes de
   comportamento.
2. Usar um projeto de backend externo só para a validação, onde a chave existe e
   os scripts correm de ponta a ponta sem intervenção.

Se quiser a verificação totalmente automática, escolha a opção 2. Se quiser o
caminho mais curto para validar a aplicação, escolha a opção 1.

## Passo 1 — Criar o ambiente

**Projeto duplicado (recomendado):** na página do projeto, use "Remix"/duplicar
para criar `foundersbook-staging`. O novo projeto arranca com backend próprio e
as mesmas migrações. Guarde o endereço público dele.

**Projeto externo:** crie um projeto novo no fornecedor de backend, aplique as
migrações de `supabase/migrations/` por ordem de data e publique as funções de
`supabase/functions/`.

## Passo 2 — Guardar as credenciais de teste

Guarde estes valores como segredos (nunca em ficheiros do projeto):

| Nome | O que é |
|---|---|
| `STAGING_SUPABASE_URL` | Endereço do backend de teste |
| `STAGING_SUPABASE_ANON_KEY` | Chave pública do backend de teste |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (só no caso do projeto externo) |
| `STAGING_APP_URL` | Endereço da aplicação de teste |
| `STAGING_DATABASE_URL` | Ligação direta à base de teste (para a matriz de permissões) |
| `STAGING_CRON_SECRET` | Segredo das tarefas agendadas de teste |
| `RC5_ALLOW_STAGING_TESTS` | Tem de ser exatamente `true` |

As guardas de segurança recusam-se a correr se qualquer destes valores apontar
para produção.

## Passo 3 — Contas de teste fictícias

Cinco contas, uma por perfil. Emails sugeridos (domínio de teste, nunca reais):

| Perfil | Email | Segredos |
|---|---|---|
| Founder | `rc5-e2e-founder@example.test` | `RC5_TEST_FOUNDER_EMAIL` / `_PASSWORD` |
| Consultor | `rc5-e2e-consultor@example.test` | `RC5_TEST_CONSULTANT_EMAIL` / `_PASSWORD` |
| Mentor | `rc5-e2e-mentor@example.test` | `RC5_TEST_MENTOR_EMAIL` / `_PASSWORD` |
| Admin | `rc5-e2e-admin@example.test` | `RC5_TEST_ADMIN_EMAIL` / `_PASSWORD` |
| Backoffice | `rc5-e2e-backoffice@example.test` | `RC5_TEST_BACKOFFICE_EMAIL` / `_PASSWORD` |

Use senhas longas e aleatórias (por exemplo geradas por um gestor de senhas).

Com chave de serviço, as contas são criadas de uma vez:

```bash
RC5_ALLOW_STAGING_TESTS=true node scripts/rc5/seed-personas.mjs
```

O script é repetível: cria o que falta, atualiza o resto, atribui os perfis e
nunca escreve senhas no ecrã ou nos registos.

## Passo 4 — Caixa de correio e calendário de teste isolados

- Crie um tenant Microsoft de teste (ou um tenant separado do de produção) e uma
  aplicação registada só para testes. Guarde `STAGING_GRAPH_TENANT_ID`,
  `STAGING_GRAPH_CLIENT_ID`, `STAGING_GRAPH_CLIENT_SECRET`.
- Crie uma caixa de correio dedicada que não pertença a ninguém real e guarde-a
  em `STAGING_GRAPH_TEST_CALENDAR_UPN`.
- Para email, use um fornecedor em modo de teste (as mensagens ficam retidas e
  não chegam a ninguém) e guarde `STAGING_EMAIL_SANDBOX_API_KEY`.

Assim nenhum email ou convite de reunião sai para pessoas reais.

## Passo 5 — Correr a verificação completa

```bash
export RC5_ALLOW_STAGING_TESTS=true
bun run rc5:verify
```

Ordem de execução: verificações locais → guardas de segurança → migrações →
dados de teste → matriz de permissões → testes por perfil em 4 tamanhos de ecrã
→ testes de falha dos serviços externos → limpeza.

O resultado fica em `docs/rc5/results.md` e `docs/rc5/results.json`.

## Passo 6 — Passar para READY

Quando `docs/rc5/results.json` mostrar `"overall": "pass"` e o teste manual de
`docs/rc5/release-checklist.md` estiver limpo, atualize o `PUBLISH_READY.md`:
veredicto **READY**, data da execução e as quatro linhas de "o que falta"
passam a verificadas.

## Passo 7 — Limpar

```bash
RC5_ALLOW_STAGING_TESTS=true node scripts/rc5/cleanup.mjs
```

Apaga apenas linhas cujo identificador começa por `rc5-e2e-`.
