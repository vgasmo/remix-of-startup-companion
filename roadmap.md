
## Aprovações de contas (14 Set)
- [x] Nome da startup já recolhido no registo e mostrado nas aprovações; confirmado no código nesta ronda.
- [x] Pesquisa por startup no servidor sem corte prévio de IDs, páginas de 50 com carregar mais; VYNHELIX encontrado na aplicação autenticada.
- [x] Agenda semanal acessível em Definições → Minha Agenda; separadores sem sobreposição, verificados na aplicação autenticada.

## 19 Out
- [ ] Papel "mentorado NDA" + onboarding de mentorado que cria lead no CRM (definir requisitos com o user)

## Auditoria completa — 23 Out 2026
- [x] Auditar código, testes, segurança, dados operacionais e navegação sem alterar dados reais.
- [x] Entregar relatório com problemas confirmados, prioridades e limites de verificação.
- [x] Incorporar o resultado da análise aprofundada de segurança.
- [x] Triar os 35 alertas de código e os 12 alertas restantes da base de dados; entregar relatório v2 com evidências, gravidade e limites.
- [x] Indicar as próximas melhorias prioritárias ao utilizador.

## Correções de segurança — 23 Out 2026
- [x] Corrigir causas de desaparecimento do resumo IA: não hidratar flags antigas; erros não substituem dados verificados por lista vazia. Regressão passou; Arete mantém resumo após 503 simulado, zero erros JS, build OK. Ausência original na conta da consultora e geração real não reproduzidas.
- [x] Incorporar rescan concluído: 16 código + 11 DB; PHC corrigido, testado e publicado; pedido alojado 400. Relatório v6 corrige contagens/conclusões provisórias e documenta os 27 alertas.
- [x] Rever os 47 alertas iniciais e novo rescan; relatório v6 com evidências e limites. 227 Vitest anteriores + 1 regressão cache, 108 Deno (2 ignorados), 15 SQL passaram; pedidos alojados confirmam destinatários/importação/intake bloqueados.
- [ ] Validar histórico assistant forjado com teste adversarial e política de histórico confiável; não certificado nesta ronda.
- [ ] Decidir destinatários extra de inquéritos admin e mailbox de testes Graph; fluxos existentes preservados, sem envios/eventos reais.
- [ ] Decidir propriedade de revogação Data Room, alteração de email de signatário público/staff e destinatários WhatsApp — quatro alertas error conservados; fluxos estabelecidos não alterados.
- [ ] Confirmar classificação/visibilidade dos sete catálogos e logos/avatares — nove avisos/notas conservados, incluindo conflito entre memória de privacidade e migrações/diretório; não restringir por inferência.
- [x] Reconciliar os cinco alertas bloqueantes de leitura ampla: políticas e revogações anónimas alojadas confirmadas, rescan sem esses erros, 10 testes SQL passaram e cinco alertas marcados corrigidos (não ignorados). Pré-visualização /login HTTP 200, sem erros JS/overlay; teste esbuild passou. Não reproduzida falha atual de build; configuração preservada.
- [x] Ronda de conclusão: erro de preparação corrigido, webhooks/replay/testes reparados, aprovações e agenda verificadas; inventário atual revisto sem certificar todos os ramos privilegiados.
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
- [x] Aviso braces eliminado retirando vite-plugin-pwa não usado; guardas de limpeza do antigo worker mantidas. Scanner atual: zero vulnerabilidades conhecidas em 67 dependências de produção.
- [ ] Certificar todos os ramos dos avisos privilegiados — inventário revisto: 117 funções, 142 grants + extensão = 143 avisos atuais; helpers de RLS/agenda preservados, duas divulgações de parent IDs e consulta anónima de suspensão corrigidas; falta prova positiva/negativa de todos os ramos.
- [x] Tornar metadados de uploads atómicos; 5 testes SQL passaram e função pública publicada.
- [x] Limitar cada consulta de portefólio, limitar páginas RPC, cancelar pedidos presos e não apresentar falhas estatísticas como zero.
- [ ] Separar consulta de lista/estatísticas mantendo contagens e filtros rápidos globais — necessita teste de volume num ambiente isolado antes de substituir o fluxo atual.
- [ ] Reconciliar os 23 avisos contratuais históricos — exige prova documental; não inferir assinaturas nem alterar contratos automaticamente.
- [x] Restaurar referência XLSM original (hash exato) e executar os três testes de preservação de macros.
- [ ] Teste de volume das notificações — execução apenas em base descartável explícita; não autorizado implicitamente contra ligação alojada.
- [ ] Privacidade de logos/avatares e restantes lookups de identidades — requer confirmar visibilidade pretendida; não restringir diretório/agenda por inferência.
- [ ] Configuração alojada de confirmação de email — sem leitura disponível nas ferramentas; não alterar configuração para tentar verificá-la.
- [ ] Marcação pública ponta a ponta — falta reserva real autorizada com link válido e confirmação no CRM; não certificada nesta ronda.
