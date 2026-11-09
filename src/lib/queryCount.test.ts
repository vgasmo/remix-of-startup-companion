import { describe, expect, it } from 'vitest';
import { countOrNull, countOrThrow } from './queryCount';

describe('RC12 statistics', () => {
  it('preserves a verified zero', () => {
    expect(countOrThrow({ count: 0, error: null })).toBe(0);
  });
  it('throws instead of fabricating zero on errors', () => {
    const error = new Error('network');
    expect(() => countOrThrow({ count: 0, error })).toThrow(error);
  });
  it('rejects missing counts', () => {
    expect(() => countOrThrow({ count: null, error: null })).toThrow('count_unavailable');
  });
  it('keeps failed settled statistics unavailable', () => {
    expect(countOrNull({ status: 'rejected', reason: 'network' })).toBeNull();
    expect(countOrNull({ status: 'fulfilled', value: { count: 4, error: 'denied' } })).toBeNull();
    expect(countOrNull({ status: 'fulfilled', value: { count: null, error: null } })).toBeNull();
    expect(countOrNull({ status: 'fulfilled', value: { count: 4, error: null } })).toBe(4);
  });
});