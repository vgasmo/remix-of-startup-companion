export const STARTUP_STAGES = ['ideation', 'validation', 'mvp', 'growth', 'scale'] as const;

export function inferLeadStage(metadata: Record<string, unknown> | null | undefined) {
  const stage = typeof metadata?.stage === 'string' ? metadata.stage.toLowerCase() : '';
  return STARTUP_STAGES.find(value => value === stage) ?? 'ideation';
}

export function needsContractedConversion(item: { stage?: string; linked_workspace_id?: string | null }) {
  return item.stage === 'contracted' && !item.linked_workspace_id;
}

/**
 * True only when THIS update transitions the lead into 'contracted' without a
 * workspace. A lead already contracted must keep accepting normal edits
 * (owner, deal value, proposal) without re-triggering workspace creation.
 */
export function isContractedTransition(
  current: { stage?: string; linked_workspace_id?: string | null },
  updates: { stage?: string },
) {
  return (
    updates.stage === 'contracted' &&
    current.stage !== 'contracted' &&
    !current.linked_workspace_id
  );
}