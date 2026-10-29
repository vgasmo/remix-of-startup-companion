import { describe, expect, it } from 'vitest';
import { inferLeadStage, isContractedTransition, needsContractedConversion } from './crmConversion';

describe('Contracted CRM conversion', () => {
  it('requires workspace conversion for external contracted leads', () => {
    expect(needsContractedConversion({ stage: 'contracted', linked_workspace_id: null })).toBe(true);
  });
  it('does not duplicate an already linked workspace', () => {
    expect(needsContractedConversion({ stage: 'contracted', linked_workspace_id: 'existing-workspace' })).toBe(false);
  });
  it('leaves platform signature stages to the existing contract flow', () => {
    expect(needsContractedConversion({ stage: 'sent_for_signature', linked_workspace_id: null })).toBe(false);
  });
  it('preserves the recorded startup stage', () => {
    expect(inferLeadStage({ stage: 'Growth' })).toBe('growth');
  });
  it('defaults absent or invalid stages to ideation', () => {
    expect(inferLeadStage({ stage: 'contracted' })).toBe('ideation');
    expect(inferLeadStage(null)).toBe('ideation');
  });
});

describe('isContractedTransition', () => {
  it('triggers only when the update moves the lead into contracted', () => {
    expect(
      isContractedTransition({ stage: 'negotiation', linked_workspace_id: null }, { stage: 'contracted' }),
    ).toBe(true);
  });
  it('does not trigger for edits to a lead already contracted without workspace', () => {
    // Regression: owner/deal-value edits on legacy contracted leads must persist.
    expect(
      isContractedTransition({ stage: 'contracted', linked_workspace_id: null }, { deal_value: 500 } as never),
    ).toBe(false);
    expect(
      isContractedTransition({ stage: 'contracted', linked_workspace_id: null }, { stage: 'contracted' }),
    ).toBe(false);
  });
  it('does not trigger when a workspace already exists', () => {
    expect(
      isContractedTransition({ stage: 'negotiation', linked_workspace_id: 'ws-1' }, { stage: 'contracted' }),
    ).toBe(false);
  });
});