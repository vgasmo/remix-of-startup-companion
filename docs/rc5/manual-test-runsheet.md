# Lista final de testes manuais (RC5)

Estes são os únicos testes que **não** podem ser automatizados neste ambiente:
dependem de contas reais, de uma caixa de correio e do tenant Microsoft. Tudo o
resto (TypeScript, lint, build, testes unitários, traduções, replay das
migrações e as 23 suites de base de dados) corre em automático e está verde —
ver `PUBLISH_READY.md` e `docs/rc5/evidence-ledger.md`.

Como registar: preencher **Resultado** com `OK` / `FALHA` + data e, em caso de
falha, o link do ecrã ou do erro. Um único `FALHA` mantém o veredicto NO-GO.

| # | Teste | Quem | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|---|---|
| 1 | Marcação pública (desktop) | Release | Abrir `/book` em janela privada, marcar uma reunião | Reunião criada uma única vez; sem token no endereço | |
| 2 | Marcação pública (telemóvel) | Release | Repetir em ecrã 390×844 | Formulário legível e submissível, sem cortes | |
| 3 | Marcação em duplicado | Release | Submeter o mesmo pedido duas vezes | Apenas uma reunião registada | |
| 4 | Falha do calendário Microsoft | Release (tenant de teste) | Forçar falha do serviço de calendário | Aviso honesto ao utilizador; nada gravado a meio | |
| 5 | Convite de founder | Consultor | Convidar um founder de teste e aceitar o convite | Entra no espaço de trabalho correto, uma só vez | |
| 6 | Onboarding do founder | Founder de teste | Preencher o formulário longo, recarregar a página | Todos os campos persistem | |
| 7 | Percurso do consultor | Consultor | Mover uma startup de etapa, concluir uma sessão | Métricas do painel atualizam sem recarregar | |
| 8 | Percurso do mentor | Mentor | Aceitar NDA, publicar disponibilidade, aceitar marcação | Sem NDA não há acesso; sem sobreposição de horários | |
| 9 | Inquérito do ecossistema | Admin | Reabrir campanha, incluir startups, ver respostas | Startups incluídas sem duplicados; respostas visíveis | |
| 10 | Notificações a founders desligadas | Admin | Confirmar o interruptor em Definições do Sistema | Founders não recebem email nem aviso; staff continua a receber | |
| 11 | Envio de proposta comercial | Backoffice | Enviar uma proposta para um endereço de teste | Email entregue e registado no histórico | |
| 12 | Saúde das automações | Admin | Abrir Saúde do Sistema | Nenhuma tarefa em `never_run` nem atrasada | |

## Depois dos manuais

1. Correr, com acesso ao ambiente de teste:
   ```bash
   export RC5_ALLOW_STAGING_TESTS=true
   bun run rc5:verify
   ```
2. Confirmar `"overall": "pass"` em `docs/rc5/results.json`.
3. Só então mudar o veredicto de `PUBLISH_READY.md` para **GO**.
