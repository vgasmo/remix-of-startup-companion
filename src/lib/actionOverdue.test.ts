import { describe, expect, it } from 'vitest';
import { isActionOverdue } from './actionOverdue';
const now = new Date('2026-10-30T14:50:00Z');
describe('overdue actions', () => {
  it.each(['pending', 'in_progress'])('counts past %s actions', status => {
    expect(isActionOverdue({ status, due_date: '2026-10-29' }, now)).toBe(true);
  });
  it.each(['awaiting_validation', 'completed', 'cancelled'])('does not count %s as overdue', status => {
    expect(isActionOverdue({ status, due_date: '2026-10-29' }, now)).toBe(false);
  });
  it('does not count actions due today or without a date', () => {
    expect(isActionOverdue({ status: 'pending', due_date: '2026-10-30' }, now)).toBe(false);
    expect(isActionOverdue({ status: 'pending', due_date: null }, now)).toBe(false);
  });
});