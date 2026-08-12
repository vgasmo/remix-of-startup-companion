# Self-hosting runbook — sair do Lovable com o backend atual

Objetivo: correr o frontend no teu servidor e manter o backend (Postgres/Auth/Storage/Functions/cron)
a funcionar, com capacidade de o migrar para um projeto Supabase próprio quando quiseres.

Tudo o que precisas está neste repositório:

| Peça | Onde vive | Como sai |
| --- | --- | --- |
| Frontend (React/Vite) | `src/`, `index.html`, `vite.config.ts` | `bun run build` → `dist/` |
| Schema + RLS + cron | `supabase/migrations/` (456 ficheiros) | `supabase db push` |
| Edge functions | `supabase/functions/` (105 funções) | `supabase functions deploy` |
| Config de funções (verify_jwt) | `supabase/config.toml` | vai com o deploy |
| Dados | Postgres gerido | `pg_dump` (`scripts/selfhost/export-backend.sh`) |
| Ficheiros (Storage) | buckets do projeto | `supabase storage cp` (ver §3) |
| Secrets das funções | painel do backend | recriar à mão (§4) |

---

## 1. Pré-requisitos locais

```bash
# CLI Supabase + Deno (para as edge functions) + Bun (build)
brew install supabase/tap/supabase deno oven-sh/bun/bun    # macOS
# ou: curl -fsSL https://bun.sh/install | bash && curl -fsSL https://deno.land/install.sh | sh
```

Precisas de:
- **Access token** do Supabase (`supabase login`) e a **DB password** do projeto de destino.
- Se ficares no backend gerido pelo Lovable: pede a *service role key* e a *connection string* ao suporte
  Lovable — não são acessíveis a partir da app. Se não as obtiveres, segue o caminho §5 (projeto novo),
  que é 100% reproduzível a partir das migrations.

## 2. Exportar o backend

```bash
export SUPABASE_DB_URL='postgresql://postgres:<password>@<host>:5432/postgres'
./scripts/selfhost/export-backend.sh ./backend-export
```

Produz:
- `roles.sql`, `schema.sql`, `data.sql` — dump completo (schema + dados), pronto para `psql`.
- `functions.txt` — inventário das edge functions.
- `crons.csv`, `rls-policies.csv`, `buckets.csv` — estado atual para conferir depois da migração.

## 3. Storage

```bash
supabase login
supabase link --project-ref <ref-origem>
# por cada bucket em buckets.csv
supabase storage cp -r ss:///<bucket> ./backend-export/storage/<bucket>
# no destino
supabase link --project-ref <ref-destino>
supabase storage cp -r ./backend-export/storage/<bucket> ss:///<bucket>
```
As políticas dos buckets já estão nas migrations — não as recries à mão.

## 4. Secrets a recriar no destino

Nenhum destes valores está no repositório. Recria-os com
`supabase secrets set NOME=valor` (as `SUPABASE_*` são injetadas automaticamente):

- Infra: `CRON_SECRET`, `PUBLIC_APP_URL`, `APP_URL`, `SITE_URL`, `ALLOWED_ORIGINS`, `WEBHOOK_SECRET`
- IA: `LOVABLE_API_KEY` (se saíres do Lovable AI Gateway, troca por chave do provider e ajusta `_shared`)
- Email: `RESEND_API_KEY`
- Microsoft 365 / SharePoint: `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_SHAREPOINT_DRIVE_ID`
- Assinaturas: `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_BASE_URL`, `DOCUSIGN_RSA_PRIVATE_KEY`, `PANDADOC_API_KEY`, `PANDADOC_WEBHOOK_KEY`
- Outros: `TWILIO_API_KEY`, `TWILIO_PHONE_NUMBER`, `STRIPE_SECRET_KEY`, `RECONCILER_WRITE_MODE`

## 5. Recriar o backend num projeto Supabase próprio

```bash
supabase link --project-ref <ref-destino>
supabase db push                 # aplica as 456 migrations (schema, RLS, grants, cron)
psql "$DEST_DB_URL" -f ./backend-export/data.sql   # só dados, se estiveres a migrar conteúdo
supabase functions deploy        # todas as funções, respeitando config.toml
./scripts/selfhost/verify-backend.sh              # confere tabelas/policies/crons/funções
```

Depois, no painel de Auth do destino: URL do site + redirect URLs (`https://teu-dominio`,
`https://teu-dominio/**`), provider Google com o mesmo client id/secret, e templates de email.

## 6. Deploy do frontend no teu servidor

```bash
cp .env.selfhost.example .env.production   # preenche URL + publishable key do backend
./scripts/selfhost/deploy-frontend.sh root@teu-servidor /var/www/startup-leiria
```

O script faz build local, sincroniza `dist/` por `rsync` e recarrega o nginx.
Config de nginx pronta (SPA fallback + cache correto de `version.json`/`sw.js`) em
`scripts/selfhost/nginx.conf.example`. TLS: `certbot --nginx -d teu-dominio`.

## 7. Cortar o cordão — verificação final

- [ ] `dist/` servido do teu domínio e login a funcionar (Google + email)
- [ ] `select * from cron.job` no destino igual a `crons.csv`
- [ ] uma função de cada categoria testada: user-facing, cron (`x-cron-secret`), webhook público
- [ ] webhooks externos (DocuSign, PandaDoc, email inbound) apontados ao novo domínio de funções
- [ ] `PUBLIC_APP_URL` = novo domínio (todos os links absolutos dependem disto)
- [ ] backups: `pg_dump` diário do destino (o `export-backend.sh` serve como cron)
