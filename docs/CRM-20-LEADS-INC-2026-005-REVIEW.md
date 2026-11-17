# Revisão das 20 leads e INC-2026-005 — 17 novembro 2026

## Resultado e limites

Investigação exclusivamente de leitura. Nenhum dos 20 registos tem contrato ligado nem contrato cuja referência `funnel_item_id` aponte para a lead. A fase comercial `contracted` não prova assinatura. Não foi encontrado um caso que permita inventar assinatura, preço histórico ou reativar um workspace arquivado.

As classificações abaixo distinguem erros estruturais confirmados de correspondências e decisões de negócio ainda não confirmadas. Ausência nas pesquisas por nome/email/contacto não é prova universal de inexistência: nomes alternativos e contratos externos continuam possíveis.

## Plano por caso

| Lead | Evidência | Correção proposta, sujeita a confirmação |
|---|---|---|
| Leiria Concierge | Workspace ativo com nome e contacto iguais; email diferente; sem contrato na plataforma | Confirmar identidade e associar ao workspace existente, preservando contactos e histórico |
| Maternah | Workspace ativo com nome igual; sem contactos para corroborar; sem contrato | Confirmar identidade antes de associar; não criar duplicado |
| METLIFE | Workspace ativo com nome igual; sem contactos para corroborar; sem contrato | Confirmar identidade antes de associar; não criar duplicado |
| MobIn | Workspace MobIN ativo com nome igual; sem contactos para corroborar; sem contrato | Confirmar identidade antes de associar; não criar duplicado |
| Airmonkey | Candidato Air Monkey arquivado no mesmo programa; programa LEIRIA EXPERIENCE LAB inativo; histórico rejected → contracted | Confirmar se é o mesmo projeto e se terminou; associar ao arquivado e alinhar CRM se encerrado, ou escolher programa ativo se é nova participação; nunca reativar automaticamente |
| AS2PLY | Candidato Astuply com um workspace ativo e outro arquivado; nome/contacto/email não coincidem exatamente; programa ausente | Confirmar identidade e workspace correto; não associar por semelhança |
| VEREEVERE | Candidato VEREECIA arquivado em programa diferente; lead em Domiciliação; dois intakes não concluídos | Não unir por semelhança; confirmar projeto, manter intake em curso e cancelar apenas a duplicação comprovada após decisão |
| Celle Concept | Sem candidato nas pesquisas; programa ausente | Escolher programa e etapa; converter para workspace pendente, não ativo |
| Startup Leiria | Registo de marcação pública; dois intakes solicitados, sem submissão/revisão; nome da entidade gestora não prova que seja teste | Confirmar se teste/interno ou cliente real; arquivar se teste confirmado, ou completar intake e converter se cliente real |
| Anatomia da Onda, Lda. | Programa Base ativo; sem candidato por nome/email/contacto | Confirmar contrato comercial externo/etapa; converter para workspace pendente no programa registado |
| Dexsel Digital Lda. | Programa Base ativo; Década Digital é apenas semelhança fraca com outro contacto | Não unir a Década Digital; converter para workspace pendente após confirmação |
| FAROL DE DADOS, LDA | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| Gleen | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| Imotransparente | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| LOBA / Globaz | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| Projeto SAM | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| RCM | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| Rotovedras / Iberpolymer | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| Sealg | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |
| tecnicoLink | Programa Base ativo; sem candidato nas pesquisas | Converter para workspace pendente após confirmação da etapa/identidade |

### Casos legítimos versus erros

- Um workspace arquivado pode ser legítimo; não deve ser reativado só para remover um aviso. Falta comprovar identidade e encerramento em Airmonkey/VEREEVERE.
- Um contrato externo pode justificar `contracted` sem assinatura nativa, mas não permite fabricar um contrato assinado nem dispensar a associação operacional definida para o CRM.
- Os quatro workspaces ativos existentes podem representar conversões feitas fora do vínculo CRM; a associação em falta é provável, identidade ainda sujeita a confirmação.
- Os 11 casos com Programa Base têm conversão operacional por concluir ou fase comercial incorreta; só o negócio confirma qual das duas situações se aplica.
- Programa ausente/inativo é um bloqueio real à conversão canónica, não motivo para selecionar outro programa silenciosamente.
- Intakes não concluídos e duplicados requerem reconciliação; não provam contratação.

## INC-2026-005 — Brisas do Lis

Evidência persistida:
- Contrato `active`, assinatura `pending`, founder/contra-signatário `pending`, fornecedor ausente.
- `signed_at` em 20 julho 2026 corresponde a um evento de mudança manual `pending_signature → active`, efetuado por staff. É prova de mudança de estado, **não** prova suficiente da assinatura.
- Sem eventos de assinatura, `signature_proof_json`, aceitação do Regulamento, PDF canónico, snapshot de preços ou versão de preços.
- Intake `intake_submitted`, sem revisão, documentos vazios; workspace ativo com um membro.
- Arquivo SharePoint falhou cinco vezes por falta de PDF. Não é apenas erro do fornecedor.
- Campos atuais: mensalidade 49 EUR, área 19,99 m², desconto 5% com fim em 24 agosto 2026. Não permitem inferir o preço-base histórico nem a aplicação correta do desconto. NIF `999999999` requer confirmação, não substituição inventada.

### Alternativas suportadas

1. **Existe assinatura presencial/externa:** staff confirma signatário, data e termos; registar pelo comando manual auditável existente (documento continua opcional segundo a regra vigente). Regularizar aprovação do intake e guardar condições históricas provenientes de fonte confirmada; gerar/arquivar documento canónico sem fingir que foi o documento original assinado. Não reescrever termos com a tabela de preços atual.
2. **Não existe assinatura:** propor regressar o contrato ao estado de preparação apropriado e o workspace a pendente, apenas após confirmação do impacto nos acessos. Rever intake e enviar assinatura nativa depois de confirmar dados e preços. Não enviar já um contrato real.
3. **Ainda não se sabe:** preservar estado e dados, tratar como pendência de prova e bloquear conclusão administrativa; não marcar como corrigido. Staff confirma a evidência antes de escolher 1 ou 2.

## Execução depois da aprovação

- Primeiro confirmar correspondências/etapas/programas e a realidade da assinatura de Brisas do Lis.
- Reutilizar conversão atómica staff para casos novos; associar existentes com autorização e auditoria, sem duplicar startup/workspace nem perder histórico.
- Operações idempotentes com verificação do estado esperado; validar cada resultado e as contagens finais. Não criar assinaturas/convites/emails durante reconciliação estrutural.
- Não apagar startups/workspaces; manter P05 bloqueado.
- Se os 11 casos confirmados forem convertidos e os quatro vínculos aprovados forem associados, 15 casos ficam estruturalmente resolvidos; os cinco restantes exigem as decisões explicitadas acima. Isso não certifica os contratos externos.