import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { resetSession } from './sessionReset';

describe('session draft isolation', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('removes legacy unscoped investor drafts on logout', () => {
    localStorage.setItem('investor_template_draft_123', 'private draft');
    resetSession(new QueryClient(), 'logout');
    expect(localStorage.getItem('investor_template_draft_123')).toBeNull();
  });
  it('preserves user-scoped unrelated drafts and theme', () => {
    localStorage.setItem('template-draft:user:123', 'unsaved');
    localStorage.setItem('theme', 'dark');
    resetSession(new QueryClient(), 'logout');
    expect(localStorage.getItem('template-draft:user:123')).toBe('unsaved');
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});