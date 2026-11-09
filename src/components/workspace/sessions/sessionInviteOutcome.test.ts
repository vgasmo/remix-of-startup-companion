import { describe, expect, it } from 'vitest';
import { getSessionInviteOutcome } from './sessionInviteOutcome';

describe('session invitation delivery', () => {
  it('reports missing response as failed', () => expect(getSessionInviteOutcome(null)).toEqual({ kind: 'failed' }));
  it('reports invocation failure', () => expect(getSessionInviteOutcome({ error: new Error('offline') })).toEqual({ kind: 'failed' }));
  it('reports all deliveries failing', () => expect(getSessionInviteOutcome({ data: { results: [{ success: false }, { success: false }] } })).toEqual({ kind: 'failed' }));
  it('counts failed deliveries and skipped recipients', () => expect(getSessionInviteOutcome({ data: { skipped: 2, results: [{ success: true }, { success: false }] } })).toEqual({ kind: 'partial', notDelivered: 3 }));
  it('reports skipped recipients', () => expect(getSessionInviteOutcome({ data: { skipped: 1, results: [{ success: true }] } })).toEqual({ kind: 'partial', notDelivered: 1 }));
  it('reports successful delivery', () => expect(getSessionInviteOutcome({ data: { skipped: 0, results: [{ success: true }] } })).toEqual({ kind: 'ok' }));
  it('ignores invalid negative skip counts', () => expect(getSessionInviteOutcome({ data: { skipped: -2, results: [{ success: true }] } })).toEqual({ kind: 'ok' }));
  it('normalizes finite skip counts', () => expect(getSessionInviteOutcome({ data: { skipped: 2.8 } })).toEqual({ kind: 'partial', notDelivered: 2 }));
});