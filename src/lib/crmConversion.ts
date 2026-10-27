export const STARTUP_STAGES = ['ideation', 'validation', 'mvp', 'growth', 'scale'] as const;

export function inferLeadStage(metadata: Record<string, unknown> | null | undefined) {
  const stage = typeof metadata?.stage === 'string' ? metadata.stage.toLowerCase() : '';
  return STARTUP_STAGES.find(value => value === stage) ?? 'ideation';
}

export function needsContractedConversion(item: { stage?: string; linked_workspace_id?: string | null }) {
  return item.stage === 'contracted' && !item.linked_workspace_id;
}