# Estado de publicação (Publish Readiness)

**Última verificação:** 2026-09-08 (12:40 UTC)
**Veredicto:** ⚠️ **NO-GO** — todos os testes automáticos locais passam, falta a validação em ambiente de teste (staging).

Fonte de verdade: `docs/rc5/results.md` / `docs/rc5/results.json` (gerados por `bun run rc5:verify`)
e `docs/rc5/evidence-ledger.md`.

---

## 1. O que já está verificado (tudo passou)

| Verificação | Resultado |
|---|---|
| TypeScript (typecheck) | ✅ passa |
| Lint | ✅ passa |
| Build de produção | ✅ passa |
| Testes unitários (3 execuções seguidas) | ✅ passa — 3×, sem falhas intermitentes |
| Paridade de traduções PT/EN | ✅ passa |
| Lint de traduções | ✅ passa |
| Qualidade de traduções | ✅ passa |
| Análise de segredos no código | ✅ passa |
| Análise de migrações (só aditivas) | ✅ passa |
| Limite de tamanho dos ficheiros entregues | ✅ passa |
| Verificação das funções do servidor (132 ficheiros) | ✅ passa |
| Replay de todas as migrações numa base de dados vazia | ✅ passa — 0 ficheiros com erro (`scripts/rc5/local-pg-harness.sh`) |
| Suites de base de dados (pgTAP, inclui matriz de permissões) | ✅ passa — 23 suites, 210 verificações, 0 falhas |

---

## 2. O que falta para dar GO

| Em falta | Porquê | Quem |
|---|---|---|
| Testes de comportamento em staging (E2E por perfil, 4 tamanhos de ecrã) | Exigem um ambiente de teste separado com credenciais próprias | Responsável de release (ops) |
| Testes de falha de serviços externos (Graph / email) | Precisam de tenant e caixa de correio de teste | Responsável de release |

Comando único para fechar estes pontos (a correr por quem tem acesso a staging):

```bash
export RC5_ALLOW_STAGING_TESTS=true
bun run rc5:verify
```

Os testes manuais estão listados, um a um, em
`docs/rc5/manual-test-runsheet.md` (quem faz, o que clicar, o que deve acontecer).
São os únicos passos que exigem uma pessoa: dependem de contas reais, caixa de
correio e do tenant Microsoft, por isso não podem ser automatizados aqui.

Quando `docs/rc5/results.json` indicar `"overall": "pass"` e o smoke manual
(`docs/rc5/release-checklist.md`) estiver limpo, o veredicto passa a **GO**.

---

## 3. Documentos relacionados

- `docs/rc5/staging-setup-guide.md` — como montar o ambiente de teste separado
- `docs/rc5/results.md` — resultado da última execução automática
- `docs/rc5/evidence-ledger.md` — registo de provas por invariante
- `docs/rc5/staging-runbook.md` — como correr a validação em staging
- `docs/rc5/rollback-runbook.md` — como reverter
- `docs/rc5/release-checklist.md` — smoke manual de produção (<15 min)
- `docs/rc5/manual-test-runsheet.md` — lista final de testes manuais, com responsável e resultado esperado
