import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_MAP } from '@/lib/hubspotNormalize';
import { FUNNEL_STAGES, PIPELINE_STAGES, STAGE_TO_SIMPLE } from './funnelStages';

describe('CRM funnel stage constants', () => {
  it('PIPELINE_STAGES includes every visible active stage (incubating/accelerating regression)', () => {
    // Regression: prior versions omitted these and hid PHC/HubSpot records from the CRM Kanban.
    expect(PIPELINE_STAGES).toContain('incubating');
    expect(PIPELINE_STAGES).toContain('accelerating');
    expect(PIPELINE_STAGES).toContain('intake_changes_requested');
    expect(PIPELINE_STAGES).toContain('contracted');
  });

  it('every PIPELINE_STAGES entry is a canonical FUNNEL_STAGES value', () => {
    for (const s of PIPELINE_STAGES) {
      expect(FUNNEL_STAGES).toContain(s);
    }
  });

  it('incubating and accelerating both map to the contracted macro column', () => {
    expect(STAGE_TO_SIMPLE.incubating).toBe('contracted');
    expect(STAGE_TO_SIMPLE.accelerating).toBe('contracted');
    expect(STAGE_TO_SIMPLE.contracted).toBe('contracted');
  });

  it('archived and rejected go to the archived_or_lost macro column', () => {
    expect(STAGE_TO_SIMPLE.archived).toBe('archived_or_lost');
    expect(STAGE_TO_SIMPLE.rejected).toBe('archived_or_lost');
  });

  it('HubSpot stage map targets only canonical FUNNEL_STAGES values (no invalid "lost")', () => {
    // Regression: 'lost'/'perdido'/'closed lost' historically mapped to the invalid value 'lost'
    // which violated the funnel_items_stage_check constraint on write.
    for (const [key, mapped] of Object.entries(DEFAULT_STAGE_MAP)) {
      expect(
        (FUNNEL_STAGES as readonly string[]).includes(mapped),
        `mapping ${key} → ${mapped} must be a canonical FUNNEL_STAGES value`,
      ).toBe(true);
    }
    expect(DEFAULT_STAGE_MAP['lost']).toBe('rejected');
    expect(DEFAULT_STAGE_MAP['closed lost']).toBe('rejected');
    expect(DEFAULT_STAGE_MAP['perdido']).toBe('rejected');
    expect(DEFAULT_STAGE_MAP['meeting']).toBe('met');
    expect(DEFAULT_STAGE_MAP['proposal']).toBe('proposal_sent');
    expect(DEFAULT_STAGE_MAP['negotiation']).toBe('negotiating');
  });
});
