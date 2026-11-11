import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
import { isIntakeBlockingSignature } from './ContractDetailDrawer';

describe('RC13 L1-10 intake approval gate before signature', () => {
  it.each(['draft_internal', 'intake_requested', 'intake_in_progress', 'intake_submitted', 'review_pending', 'changes_requested'])(
    'blocks signature while intake is %s', (s) => expect(isIntakeBlockingSignature(s)).toBe(true));
  it.each(['approved_for_signature', 'signature_sent', 'signed', 'activated', 'cancelled', 'rejected'])(
    'allows signature when intake is %s', (s) => expect(isIntakeBlockingSignature(s)).toBe(false));
  it('allows contracts without an intake', () => expect(isIntakeBlockingSignature(null)).toBe(false));
});
