/**
 * Canonical intake/contract lifecycle states.
 * SEPARATE from CRM pipeline stages — related but never the same field.
 */

export const INTAKE_STATES = [
  'draft_internal',
  'intake_requested',
  'intake_in_progress',
  'intake_submitted',
  'review_pending',
  'changes_requested',
  'approved_for_signature',
  'signature_sent',
  'signed',
  'activated',
  'cancelled',
] as const;

export type IntakeState = (typeof INTAKE_STATES)[number];

/** Allowed state transitions — key is FROM, values are TO */
export const INTAKE_TRANSITIONS: Record<IntakeState, IntakeState[]> = {
  draft_internal: ['intake_requested', 'cancelled'],
  intake_requested: ['intake_in_progress', 'cancelled'],
  intake_in_progress: ['intake_submitted', 'cancelled'],
  // Reviewers can approve or request changes directly from "submitted" without
  // an explicit "start review" step — the UI exposes both actions from this state.
  intake_submitted: ['review_pending', 'approved_for_signature', 'changes_requested', 'cancelled'],
  review_pending: ['changes_requested', 'approved_for_signature', 'cancelled'],
  changes_requested: ['intake_in_progress', 'intake_submitted', 'review_pending', 'cancelled'],
  approved_for_signature: ['signature_sent', 'cancelled'],
  signature_sent: ['signed', 'cancelled'],
  signed: ['activated'],
  activated: [],
  cancelled: [],
};

/**
 * CRM macro-stage that corresponds to each intake state.
 * These map to SIMPLIFIED pipeline stages, not fine-grained ones.
 * The pipeline view groups items by these macro-stages.
 */
export const INTAKE_TO_CRM_STAGE: Record<IntakeState, string> = {
  draft_internal: 'qualified',
  intake_requested: 'intake_requested',
  intake_in_progress: 'intake_filling',
  intake_submitted: 'intake_submitted',
  review_pending: 'intake_review',
  changes_requested: 'intake_changes_requested',
  approved_for_signature: 'approved_for_signature',
  signature_sent: 'sent_for_signature',
  signed: 'contracted',
  activated: 'contracted',
  cancelled: 'rejected',
};

/** Human-readable labels (PT) */
export const INTAKE_STATE_LABELS: Record<IntakeState, string> = {
  draft_internal: 'Rascunho Interno',
  intake_requested: 'Pedido Enviado',
  intake_in_progress: 'Em Preenchimento',
  intake_submitted: 'Submetido',
  review_pending: 'Em Revisão',
  changes_requested: 'Correções Pedidas',
  approved_for_signature: 'Aprovado p/ Assinatura',
  signature_sent: 'Enviado p/ Assinatura',
  signed: 'Assinado',
  activated: 'Ativado',
  cancelled: 'Cancelado',
};

/** Validate if a transition is allowed */
export function isValidIntakeTransition(from: IntakeState, to: IntakeState): boolean {
  return INTAKE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** States where staff can take review actions */
export const REVIEWABLE_STATES: IntakeState[] = ['intake_submitted', 'review_pending'];

/** States where customer form is still editable */
export const CUSTOMER_EDITABLE_STATES: IntakeState[] = [
  'intake_requested',
  'intake_in_progress',
  'changes_requested',
];

/** States visible in backoffice operational view, grouped */
export const BACKOFFICE_VIEW_GROUPS = {
  awaiting_fill: ['intake_requested', 'intake_in_progress'] as IntakeState[],
  submitted_for_review: ['intake_submitted', 'review_pending'] as IntakeState[],
  changes_requested: ['changes_requested'] as IntakeState[],
  ready_for_signature: ['approved_for_signature'] as IntakeState[],
  sent_for_signature: ['signature_sent'] as IntakeState[],
  signed_pending_activation: ['signed'] as IntakeState[],
};
