import { describe, expect, it } from 'vitest';
import { isOperationalCustomer } from './useCrmInbox';

describe('useCrmInbox — operational vs commercial classification', () => {
  it('startup_active + incubating is operational (excluded from stale)', () => {
    expect(isOperationalCustomer({ stage: 'incubating', type: 'startup_active' })).toBe(true);
  });

  it('startup_active + accelerating is operational', () => {
    expect(isOperationalCustomer({ stage: 'accelerating', type: 'startup_active' })).toBe(true);
  });

  it('startup_active + contracted is operational', () => {
    expect(isOperationalCustomer({ stage: 'contracted', type: 'startup_active' })).toBe(true);
  });

  it('lead + qualified is commercial (not operational)', () => {
    expect(isOperationalCustomer({ stage: 'qualified', type: 'lead' })).toBe(false);
  });

  it('lead + new is commercial', () => {
    expect(isOperationalCustomer({ stage: 'new', type: 'lead' })).toBe(false);
  });

  it('lead + negotiating is commercial', () => {
    expect(isOperationalCustomer({ stage: 'negotiating', type: 'lead' })).toBe(false);
  });

  it('lead + sent_for_signature is commercial', () => {
    expect(isOperationalCustomer({ stage: 'sent_for_signature', type: 'lead' })).toBe(false);
  });

  it('incubating with any type is treated as operational (defensive)', () => {
    expect(isOperationalCustomer({ stage: 'incubating', type: 'lead' })).toBe(true);
  });
});

/**
 * Inbox classification contract (documented via isOperationalCustomer):
 *
 * - imported startup_active + incubating + null activity + null next_action  → NOT stale, excluded from Inbox commercial buckets
 * - startup_active + contracted + null activity + null next_action           → NOT stale, excluded
 * - operational customer WITH next_action_at                                 → appears in overdue/today/upcoming (never stale/noNextAction)
 * - commercial lead with last_activity_at > 14 days ago + no next action     → appears in `stale`
 * - commercial lead with recent activity + no next action                    → appears in `noNextAction`
 * - rejected / archived                                                      → excluded by query filter
 *
 * These rules are enforced in useCrmInbox() without mutating stage/type in the DB.
 */
