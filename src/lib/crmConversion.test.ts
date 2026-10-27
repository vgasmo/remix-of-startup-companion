import { describe, expect, it } from 'vitest';
import { inferLeadStage, needsContractedConversion } from './crmConversion';

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