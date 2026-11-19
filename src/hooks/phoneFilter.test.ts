import { describe, it, expect } from 'vitest';
import { phoneFilter } from './useGlobalSearch';
describe('phoneFilter', () => {
  it('matches typed digits regardless of spacing', () => {
    expect(phoneFilter('phone', '912 345 678')).toBe('phone.ilike.%9%1%2%3%4%5%6%7%8%');
  });
  it('ignores names and short numbers', () => {
    expect(phoneFilter('phone', 'Maria')).toBeNull();
    expect(phoneFilter('phone', '123')).toBeNull();
  });
});
