# Pedidos de alteração de dados da startup

Fluxo: founder edita campos sensíveis (IBAN, morada, sócios/cap table, nome legal, NIF, etc.) → gera um **pedido pendente** → admin valida no backoffice → ao aprovar, o valor é aplicado à startup/workspace. Founder vê o estado ("A aguardar validação / Aprovado / Rejeitado") no seu perfil de startup.

## 1. Base de dados

Nova tabela `startup_change_requests`:
- `workspace_id`, `startup_id` (uma das duas obrigatória)
- `requested_by` (auth.uid)
- `field_key` (enum-like string: `iban`, `legal_name`, `nif`, `address`, `postal_code`, `city`, `country`, `phone`, `website`, `shareholders`, `cap_table`, `bank_name`, `swift_bic`, `legal_representative`, `other`)
- `field_label` (texto legível)
- `current_value_json`, `requested_value_json` (JSONB — suporta strings simples e arrays como sócios)
- `justification` (texto opcional do founder)
- `status`: `pending` | `approved` | `rejected` | `cancelled`
- `reviewed_by`, `reviewed_at`, `review_notes`
- `applied_at` (quando o valor foi efectivamente escrito na tabela alvo)
- timestamps + trigger de updated_at

GRANTs + RLS:
- Founder (membro do workspace via `has_workspace_access`): INSERT dos próprios pedidos, SELECT dos pedidos do seu workspace, UPDATE só para `cancelled` enquanto `pending`.
- Staff (`has_role admin`/`consultant`): SELECT all, UPDATE para aprovar/rejeitar (admin only na policy, conforme pedido).
- Mentor externo: sem acesso.

## 2. Aplicação da alteração (aprovação)

Função `apply_startup_change_request(request_id)` (SECURITY DEFINER, admin-only):
- Lê o pedido, valida `status=pending`.
- Faz `UPDATE` no campo correspondente em `startups` (ou `workspaces`, ou `cap_table_entries` para sócios) baseado em `field_key`.
- Marca `status=approved`, preenche `reviewed_by/at`, `applied_at`.
- Loga em `activity_log`.

Rejeição: RPC `reject_startup_change_request(request_id, notes)` — apenas actualiza estado, sem escrever no alvo.

## 3. UI Founder

Novo componente `StartupDataEditor` na página do perfil da startup:
- Campos editáveis (IBAN, morada, NIF, sócios, etc.) pré-preenchidos com o valor actual.
- Ao guardar, cria um `startup_change_request` por campo alterado (não aplica logo).
- Toast: "Pedido enviado para validação."
- Painel "Alterações pendentes" mostra lista com status badges.
- Botão "Cancelar pedido" enquanto `pending`.

## 4. UI Backoffice

Novo separador em Ecosystem (ou na Work Queue existente):
- Lista `startup_change_requests` com `status=pending`, agrupados por workspace.
- Cada linha: campo, valor actual → novo valor (diff visual), justificação, quem pediu, quando.
- Acções admin: **Aprovar** (chama `apply_startup_change_request`) / **Rejeitar** com nota.
- Notificação in-app para o founder ao aprovar/rejeitar (via `notifications` table já existente).

## 5. Detalhes técnicos

- Hook `useStartupChangeRequests(workspaceId)` — lista + counts pendente.
- Hook `useSubmitStartupChangeRequest()` — mutation com invalidate.
- Hooks admin `useApproveStartupChangeRequest`, `useRejectStartupChangeRequest`.
- i18n PT/EN completa: labels de campos, estados, toasts, diff.
- Sem realtime (segue política de privacy hardening — pedidos podem ter IBAN).
- `activity_log` recebe entrada `startup_change_request.created/approved/rejected`.

## 6. Fora de scope (para depois)

- Email automático ao admin quando novo pedido chega (podemos ligar a `send-email-digest` ou criar edge function dedicada).
- Histórico completo de alterações (audit trail já fica no próprio registo aprovado + activity_log).

Confirmas para eu implementar?
