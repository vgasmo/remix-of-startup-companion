import { describe, expect, it } from 'vitest';
import { buildUserWorkspaceIndex, matchesUserWorkspaceFilter } from './userWorkspaceFilter';

const workspaces = [
  { id: 'open', status: 'active', archived_at: null, blocked_at: null },
  { id: 'archived', status: 'active', archived_at: '2026-11-10', blocked_at: null },
  { id: 'rejected', status: 'rejected', archived_at: null, blocked_at: null },
  { id: 'blocked', status: 'active', archived_at: null, blocked_at: '2026-11-10' },
];
const assignments = [
  { user_id: 'active', workspace_id: 'open', active: true },
  { user_id: 'inactive', workspace_id: 'open', active: false },
  ...['archived', 'rejected', 'blocked'].map(id => ({ user_id: id, workspace_id: id, active: true })),
];
const index = buildUserWorkspaceIndex(assignments, workspaces);

describe('user workspace filters', () => {
  it('only includes users with no association in Sem workspace', () => {
    expect(['none', 'active', 'inactive', 'archived'].filter(id => matchesUserWorkspaceFilter(id, 'none', index))).toEqual(['none']);
  });
  it('includes missing and inactive associations in no active workspace', () => {
    expect(['none', 'active', 'inactive'].filter(id => matchesUserWorkspaceFilter(id, 'no_active', index))).toEqual(['none', 'inactive']);
  });
  it.each(['archived', 'rejected', 'blocked'])('excludes %s workspaces from active associations', id => {
    expect(matchesUserWorkspaceFilter(id, 'no_active', index)).toBe(true);
  });
  it('keeps users with at least one available active association out of no_active', () => {
    const multiple = buildUserWorkspaceIndex([...assignments, { user_id: 'blocked', workspace_id: 'open', active: true }], workspaces);
    expect(matchesUserWorkspaceFilter('blocked', 'no_active', multiple)).toBe(false);
    expect(matchesUserWorkspaceFilter('none', 'all', multiple)).toBe(true);
  });
});