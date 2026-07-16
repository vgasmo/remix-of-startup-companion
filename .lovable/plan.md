
## Objetivo

Adicionar ao drawer de uma lead no CRM um botão **"Enviar proposta comercial"** que envia um email personalizado ao contacto com os dados da proposta no corpo do email e links de descarga para a minuta de contrato + regulamento (configuráveis por programa). Ao enviar, a lead avança para uma nova etapa **"Proposta Enviada"** e é criado um follow-up a 7 dias.

## Comportamento

1. Staff abre a lead no CRM → botão **Enviar Proposta**.
2. Abre um dialog com:
   - **Assunto** (editável, pré-preenchido: `Proposta comercial — {{programa}} — Startup Leiria`).
   - **Programa** (dropdown; por defeito o programa da lead, se existir).
   - **Corpo do email** (rich-text, pré-preenchido com um template branded que inclui: saudação com nome do contacto, resumo do programa, tabela simples de pricing do programa e link para agendar próximos passos).
   - **Anexos como links** — lista de documentos configurados no admin para aquele programa, cada linha com toggle. Staff pode desmarcar antes de enviar.
   - Preview.
3. Ao enviar:
   - Envio via Lovable Emails (`send-transactional-email` com template `commercial-proposal`).
   - Cada documento marcado gera **link assinado (7 dias)** para o ficheiro em Storage — anexos reais não são suportados pelo sistema de emails.
   - `funnel_items.stage = 'proposal_sent'`, guarda `metadata_json.proposal_sent_at`, `proposal_program_id`, `proposal_document_ids`, `proposal_subject`.
   - Cria `funnel_event` (`event_type: 'proposal_sent'`).
   - Cria `staff_task` de follow-up (due em 7 dias) para o `owner_consultant_id` da lead.
   - Regista em `communication_log` (para o histórico da lead).

## Alterações no schema (migration)

- **`funnel_items.stage`**: adicionar `proposal_sent` ao conjunto permitido (é `text` — apenas actualizar constantes no frontend e stage helpers).
- **`support_materials`**: adicionar coluna `attach_to_proposal boolean default false`. Já é per-program → reutilizamos para os anexos.
- **`funnel_items`**: nenhum novo campo (guardamos tudo em `metadata_json.proposal.*`).

## Frontend

- `src/constants/funnelStages.ts` — adicionar `proposal_sent` entre `first_contact_booked` e `contract_sent`, com label PT/EN, ordem, cor.
- `src/lib/crmUtils.ts` — actualizar mapas de stage macro (fica em "Proposta").
- `src/components/crm/drawer/OverviewTab.tsx` — botão **Enviar Proposta** visível se a lead tem `contact_email`.
- **Novo** `src/components/crm/SendProposalDialog.tsx` — dialog descrito acima; chama edge function.
- **Novo** `src/hooks/useProposalAttachments.ts` — carrega `support_materials` do programa com `attach_to_proposal = true`.
- Admin: em `AdminProgramsManager` / gestão de support materials, mostrar checkbox **"Anexar à proposta comercial"** por material.
- Traduções PT/EN adicionadas em `src/i18n/locales/*.json`.

## Backend

- **Novo template** `supabase/functions/_shared/transactional-email-templates/commercial-proposal.tsx`
  - Props: `contactName`, `programName`, `bodyHtml` (parágrafos do consultor, escapados via React), `pricingLines` (opcional), `attachments: {name, url}[]`, `consultantName`, `consultantEmail`.
  - Cabeçalho branded Startup Leiria, tabela de pricing, secção "Documentos anexos" com botões para cada link, assinatura do consultor.
- **Novo** `supabase/functions/send-commercial-proposal/index.ts`
  - Auth via `verify_jwt = false` + validação manual (staff-only via `has_role`).
  - Input Zod: `funnel_item_id`, `program_id`, `subject`, `body_text`, `support_material_ids[]`.
  - Gera signed URLs (`supabase.storage.from(bucket).createSignedUrl(path, 7*24*3600)`).
  - Chama `send-transactional-email` com `templateName: 'commercial-proposal'`.
  - Actualiza `funnel_items`, cria `funnel_event`, `staff_task`, `communication_log`.
- Registar template em `_shared/transactional-email-templates/registry.ts`.

## Fora do âmbito

- Sem geração de PDF da proposta.
- Sem anexos reais (impossível no sistema de emails Lovable — usamos links assinados).
- Sem alteração da lógica de contratos ou pricing.
- Sem envio de proposta a múltiplos destinatários.

## Notas técnicas

- Se o programa não tiver documentos com `attach_to_proposal = true`, o dialog mostra "Nenhum documento configurado" com CTA para o admin adicionar.
- Follow-up 7 dias reutiliza `staff_tasks` (não `reminder_jobs`) para aparecer no Work Queue do consultor.
- `metadata_json.proposal.subject/body/attachments/sent_at` permite reenviar/auditar.
