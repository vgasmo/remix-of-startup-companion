
## Aprovações de contas (14 Set)
- [ ] Pedir nome do projeto/startup no registo do founder e mostrá-lo nas Aprovações Pendentes
- [ ] Corrigir busca de workspaces no diálogo "Atribuir Workspace" (ex. VYNHELIX não aparece)
- [ ] Bloqueios de agenda ("Dias e horas sem reuniões") acessíveis e óbvios para consultores

## 19 Out
- [ ] Papel "mentorado NDA" + onboarding de mentorado que cria lead no CRM (definir requisitos com o user)

## Auditoria completa — 23 Out 2026
- [x] Auditar código, testes, segurança, dados operacionais e navegação sem alterar dados reais.
- [x] Entregar relatório com problemas confirmados, prioridades e limites de verificação.
- [x] Incorporar o resultado da análise aprofundada de segurança.
- [x] Triar os 35 alertas de código e os 12 alertas restantes da base de dados; entregar relatório v2 com evidências, gravidade e limites.
- [x] Indicar as próximas melhorias prioritárias ao utilizador.

## Correções de segurança — 23 Out 2026
- [ ] Ronda de conclusão: corrigir erro atual de preparação, reparar testes/replay de webhooks, verificar pendências de aprovações e reavaliar avisos atuais com evidência individual.
- [x] Corrigir importação financeira, permissões Data Room e mensagens de contas suspensas; funções publicadas e testes de guardas passaram.
- [x] Proteger os pontos de HTML, CSV e logs pessoais identificados na auditoria; 19 testes partilhados e 6 CSV passaram.
- [x] Reavaliar permissões condicionais e dependências; relatório v3 documenta correções e limites.
- [x] Restringir os cinco acessos amplos confirmados e revalidar políticas alojadas (teste positivo de todos os perfis não incluído).
- [x] Proteger termos assinados e impedir assinatura/ativação forjadas pelo editor ou API; preservar renovação explícita e automática.
- [x] Bloquear contas suspensas nas importações/atribuição/onboarding auditados e falhas de verificação NDA; WhatsApp corrigido e publicado nesta ronda.
- [x] Implementar recuperação persistente e guardas de ativação; 14 testes partilhados e 19 SQL isolados passaram.
- [x] Executar regressões e verificar permissões aplicadas; 210 testes da aplicação passaram.
- [ ] Validar assinatura/recuperação/mentor ponta a ponta — bloqueado por ambiente isolado e identidades/cenários externos não disponíveis.
- [ ] Decidir validade/renovação NDA e regra canónica de preços — aguarda decisão do utilizador.
- [ ] Corrigir aviso residual braces — versão superior a 3.0.3 indisponível; manter sem ocultar.
- [ ] Fechar revisão integral dos 142 avisos históricos — contagem atual e cobertura individual não certificadas; revisão parcial de funções não equivale a aprovação.
- [x] Tornar metadados de uploads atómicos; 5 testes SQL passaram e função pública publicada.
- [x] Limitar cada consulta de portefólio, limitar páginas RPC, cancelar pedidos presos e não apresentar falhas estatísticas como zero.
- [ ] Separar consulta de lista/estatísticas mantendo contagens e filtros rápidos globais — necessita teste de volume num ambiente isolado antes de substituir o fluxo atual.
- [ ] Reconciliar os 23 avisos contratuais históricos — exige prova documental; não inferir assinaturas nem alterar contratos automaticamente.
