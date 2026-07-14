/**
 * Centralized funnel stage constants for CRM pipeline.
 * Single source of truth for stage values and labels.
 *
 * V3: Simplified commercial pipeline with 7 macro-stages.
 * Fine-grained DB values are preserved; the kanban groups them visually.
 */

export const FUNNEL_STAGES = [
  'new',
  'first_contact_booked',
  'met',
  'qualified',
  'proposal_sent',
  'negotiating',
  'intake_requested',
  'intake_filling',
  'intake_submitted',
  'intake_review',
  'intake_changes_requested',
  'approved_for_signature',
  'sent_for_signature',
  'contracted',
  'incubating',
  'accelerating',
  'rejected',
  'archived',
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_TYPES = [
  'lead',
  'contract',
  'startup_candidate',
  'startup_active',
] as const;

export type FunnelType = (typeof FUNNEL_TYPES)[number];

// ── Simplified pipeline (7 macro-columns for Kanban) ──────────────

export const SIMPLE_PIPELINE_STAGES = [
  'lead',
  'qualified',
  'proposal_negotiation',
  'contracting_in_progress',
  'signature_in_progress',
  'contracted',
  'archived_or_lost',
] as const;

export type SimplePipelineStage = (typeof SIMPLE_PIPELINE_STAGES)[number];

/** Map every fine-grained DB stage to its macro pipeline column */
export const STAGE_TO_SIMPLE: Record<FunnelStage, SimplePipelineStage> = {
  new: 'lead',
  first_contact_booked: 'lead',
  met: 'qualified',
  qualified: 'qualified',
  proposal_sent: 'proposal_negotiation',
  negotiating: 'proposal_negotiation',
  intake_requested: 'contracting_in_progress',
  intake_filling: 'contracting_in_progress',
  intake_submitted: 'contracting_in_progress',
  intake_review: 'contracting_in_progress',
  intake_changes_requested: 'contracting_in_progress',
  approved_for_signature: 'signature_in_progress',
  sent_for_signature: 'signature_in_progress',
  contracted: 'contracted',
  incubating: 'contracted',
  accelerating: 'contracted',
  rejected: 'archived_or_lost',
  archived: 'archived_or_lost',
};

/** PT labels for the simplified pipeline columns */
export const SIMPLE_STAGE_LABELS: Record<SimplePipelineStage, string> = {
  lead: 'Leads',
  qualified: 'Qualificados',
  proposal_negotiation: 'Proposta / Negociação',
  contracting_in_progress: 'Contratação em Curso',
  signature_in_progress: 'Em Assinatura',
  contracted: 'Contratado',
  archived_or_lost: 'Arquivo / Perdido',
};

/** Fine-grained stages that feed each simple column */
export const SIMPLE_STAGE_SOURCES: Record<SimplePipelineStage, FunnelStage[]> = {
  lead: ['new', 'first_contact_booked'],
  qualified: ['met', 'qualified'],
  proposal_negotiation: ['proposal_sent', 'negotiating'],
  contracting_in_progress: ['intake_requested', 'intake_filling', 'intake_submitted', 'intake_review', 'intake_changes_requested'],
  signature_in_progress: ['approved_for_signature', 'sent_for_signature'],
  contracted: ['contracted', 'incubating', 'accelerating'],
  archived_or_lost: ['rejected', 'archived'],
};

/** Stages visible in the main pipeline Kanban board (legacy compat) */
export const PIPELINE_STAGES: FunnelStage[] = [
  'new',
  'first_contact_booked',
  'met',
  'qualified',
  'proposal_sent',
  'negotiating',
  'intake_requested',
  'intake_filling',
  'intake_submitted',
  'intake_review',
  'intake_changes_requested',
  'approved_for_signature',
  'sent_for_signature',
  'contracted',
  'incubating',
  'accelerating',
  'rejected',
  'archived',
];

/** i18n label keys for each stage – resolve via t(STAGE_LABEL_KEYS[stage]) */
export const STAGE_LABEL_KEYS: Record<FunnelStage, string> = {
  new: 'pipeline.stages.new',
  first_contact_booked: 'pipeline.stages.first_contact_booked',
  met: 'pipeline.stages.met',
  qualified: 'pipeline.stages.qualified',
  proposal_sent: 'pipeline.stages.proposal_sent',
  negotiating: 'pipeline.stages.negotiating',
  intake_requested: 'pipeline.stages.intake_requested',
  intake_filling: 'pipeline.stages.intake_filling',
  intake_submitted: 'pipeline.stages.intake_submitted',
  intake_review: 'pipeline.stages.intake_review',
  intake_changes_requested: 'pipeline.stages.intake_changes_requested',
  approved_for_signature: 'pipeline.stages.approved_for_signature',
  sent_for_signature: 'pipeline.stages.sent_for_signature',
  contracted: 'pipeline.stages.contracted',
  incubating: 'pipeline.stages.incubating',
  accelerating: 'pipeline.stages.accelerating',
  rejected: 'pipeline.stages.rejected',
  archived: 'pipeline.stages.archived',
};

/** PT labels per fine-grained stage – fallback for non-i18n contexts */
export const STAGE_LABELS: Record<FunnelStage, string> = {
  new: 'Novo',
  first_contact_booked: 'Reunião Marcada',
  met: 'Reunião Realizada',
  qualified: 'Qualificado',
  proposal_sent: 'Proposta Enviada',
  negotiating: 'Negociação',
  intake_requested: 'Pedido Enviado',
  intake_filling: 'A Preencher',
  intake_submitted: 'Submetido',
  intake_review: 'Em Revisão',
  intake_changes_requested: 'Correções Pedidas',
  approved_for_signature: 'Aprovado p/ Assinatura',
  sent_for_signature: 'Enviado p/ Assinatura',
  contracted: 'Contratado',
  incubating: 'Em Incubação',
  accelerating: 'Em Aceleração',
  rejected: 'Rejeitado',
  archived: 'Arquivado',
};
