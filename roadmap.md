
## Revogação ao suspender — 14 Nov 2026
- [ ] Confirmar APIs suportadas, tornar falhas de banimento seguras, testar e documentar limites; manter P05, ProtectedRoute e localStorage intactos.

## RC13 Lote 2
- [x] Pedido 00:55: botão de primeira reunião visível no login móvel; verificado a 390px.
- [ ] P05: remover backup e regenerar tipos — bloqueado pela permissão de migrações destrutivas.
- [x] Invalidar fila após conclusão de sessão.
- [x] Recusar updates/deletes sem linhas afetadas em ações e marcos; sete regressões.
- [x] Banir/desbanir contas no servidor por administrador aprovado; função publicada, quatro testes isolados. Não termina JWT já emitido; suspensão real não exercida.
- [x] Registar falhas HTTP dos crons a cada hora; expectativa confirmada, limites 200–299 e deduplicação verificados em PG17 descartável.

## RC12 — 9 Nov 2026
- [x] Pedido 23:32 UTC: completar testes FEX-21/ProtectedRoute e suite de 18 asserções; corrigir documentação OPS-14, manifesto/reconciliador e procedimento de restauro SCH-16 a partir das descrições; verificar localmente sem executar reparações ou envios reais. Concluído: 325 Vitest, 12 testes manifesto, reconstrução nova PG17 com 391 asserções/38 suites, lint/i18n/secret scan/build OK; aplicação autenticada abre sem erros.
- [x] Pedido 10:58 UTC: 29 diffs opcionais compatíveis e cinco migrações aplicadas; 23 funções publicadas; 298 Vitest, 202 Deno e 373 asserções SQL passam. Limites e secções sem patch em docs/RC12-APPLIED.md; frontend não publicado.
- [x] Pedido 10:37 UTC: Partes 3–15 aplicadas; 288 Vitest, 198 Deno (5 ignorados) e 61 asserções pgTAP passam; 45 funções publicadas, 10 migrações e reparações de dados aplicadas. Navegação autenticada Espaços/Contratos confirmada; lint/i18n/build OK. Limites e adaptações em docs/RC12-APPLIED.md.
- [x] Aplicar anexo i18n exato e validar os dois gates antes das correções: 9379 chaves em paridade, zero problemas.
- [x] Aplicar pacote essencial: Partes 1–15 aplicadas; evidências e limites de certificação registados em docs/RC12-APPLIED.md.
- [x] Concluir secções opcionais sem patch: E2E-05/FEX-21 testes e OPS-14 documentos; autorização recebida para implementar pelas descrições. HRD-10 logger e ED2-06/FEF-07 Data Room já aplicados no essencial; config gerida não alterada; CI local PG17 e sequência explícita de replay preparados.
- [x] Parte 2 aplicada: nove diffs, 71 funções afetadas publicadas, 282 Vitest e 56 Deno passam; lint/gates i18n e cinco verificações Deno limpos, build OK. Modelo preservado pelo SDK obrigatório. Copilot autenticado abriu e enviou pedido, mas resposta real excedeu inatividade; não certificado. Partes 3–15 concluídas abaixo; opcional pendente.

- [ ] Certificação RC12 externa e publicação: bloqueada por ambiente gerido novo/isolado, mailbox Graph e identidades sandbox, execução do CI alojado e aprovação de publicação; restauro de backups e fluxos reais continuam não certificados.

## Validação externa da release — 2 Nov 2026
- [ ] Retomar verificações externas seguras, recolher evidências atuais e entregar relatório atualizado com acessos bloqueantes, sem alterar regras nem enviar convites externos não autorizados.

## Correções reportadas — 30 Out 2026
- [x] Corrigir ligações de email para conversas, incluindo links antigos e destino preservado após login; função publicada, conversa real aberta sem 404 nem erros JS.
- [x] Portefólio atribuído usa responsável principal; contagens e ações excluem marcos arquivados sem alterar histórico. Flourishmode verificada na UI: 0 atrasos e 29/29 ações. 14 regressões novas, SQL descartável e lint aprovados; build OK. Brisas do Lis permanece como workspace ativo não atribuído na vista global, sem alteração automática dos dados. Frontend ainda não publicado.

## Conversão CRM — 27 Out 2026
- [x] Conversão contratada atómica e escolha de programa na página; notas/contactos preservados, histórico ligado, sem ativação/assinatura forjada. Lead de teste convertida e workspace aberto; registos de teste arquivados. 238 testes da app, regressões SQL isoladas e lint passaram; build OK. Não publicado o frontend; assinaturas externas não repetidas nesta ronda.

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
- [x] Aplicar decisões de 13:28 UTC: destinatários de emails/propostas/inquéritos/SMS associados no servidor; preservar email alternativo de assinatura, claim sem aprovação e catálogos/imagens autenticados; 26 novas regressões, quatro funções publicadas, relatório v8.
- [x] Concluir análise aprofundada anterior e validar alertas: 4 guardas de conta corrigidas/publicadas, histórico IA isolado, 24 novas regressões, relatório v7; 19 alertas ativos separados por decisão/configuração/limite.
- [x] Incorporar análise automática concluída às 11:20 UTC: 19 código + 9 DB; após esta ronda, 3 corrigidos, 9 avisos de visibilidade aceites por decisão explícita, 16 código continuam ativos.
- [x] Corrigir causas de desaparecimento do resumo IA: não hidratar flags antigas; erros não substituem dados verificados por lista vazia. Regressão passou; Arete mantém resumo após 503 simulado, zero erros JS, build OK. Ausência original na conta da consultora e geração real não reproduzidas.
- [x] Incorporar rescan concluído: 16 código + 11 DB; PHC corrigido, testado e publicado; pedido alojado 400. Relatório v6 corrige contagens/conclusões provisórias e documenta os 27 alertas.
- [x] Rever os 47 alertas iniciais e novo rescan; relatório v6 com evidências e limites. 227 Vitest anteriores + 1 regressão cache, 108 Deno (2 ignorados), 15 SQL passaram; pedidos alojados confirmam destinatários/importação/intake bloqueados.
- [x] Validar histórico assistant forjado: convertido em contexto user explicitamente não confiável, campos adicionais removidos; testes adversariais e conversa autenticada de 2 turnos passaram. Não certifica resistência universal a prompt injection.
- [x] Inquéritos/WhatsApp limitados a contactos associados; alternativas de signatário preservadas por decisão explícita, sem certificar identidade/entrega externa.
- [ ] Decidir mailbox dedicada para testes Graph e propriedade de revogação Data Room — perguntas anteriores não respondidas.
- [x] Catálogos/logos/avatares: visibilidade autenticada aprovada; nove avisos/notas ignorados com motivo documentado, sem alargar escritas ou relações privadas.
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
- [x] Privacidade de logos/avatares: leitura autenticada aprovada. Outros campos pessoais continuam sujeitos às regras de isolamento existentes.
- [ ] Configuração alojada de confirmação de email — sem leitura disponível nas ferramentas; não alterar configuração para tentar verificá-la.
- [ ] Marcação pública ponta a ponta — falta reserva real autorizada com link válido e confirmação no CRM; não certificada nesta ronda.

- [x] RC13 Lote 1 (dez correções) — aplicado
- [x] Auditoria CRM e pipeline de contratos — relatório entregue
- [ ] Correções da auditoria CRM/contratos — aguarda decisão do utilizador (prioridades, assinatura manual, dados INC-2026-004)
