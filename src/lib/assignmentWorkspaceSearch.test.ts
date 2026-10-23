import { describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ calls: [] as Array<[string, ...unknown[]]> }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from(table: string) {
  fake.calls.push(['from', table]);
  const chain = {
    select: (s: string) => { fake.calls.push(['select', s]); return chain; },
    in: (s: string, v: string[]) => { fake.calls.push(['in', s, v]); return chain; },
    order: (s: string) => { fake.calls.push(['order', s]); return chain; },
    range: (a: number, b: number) => { fake.calls.push(['range', a, b]); return chain; },
    or: (s: string, options: unknown) => { fake.calls.push(['or', s, options]); return chain; },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'older-workspace' }], error: null }).then(resolve),
  };
  return chain;
} } }));
import { searchAssignmentWorkspaces } from './assignmentWorkspaceSearch';
describe('assignment workspace search', () => {
  it('searches joined startup fields without truncating a preliminary startup list', async () => {
    fake.calls = [];
    expect(await searchAssignmentWorkspaces('VYNHELIX')).toEqual([{ id: 'older-workspace' }]);
    expect(fake.calls.filter(c => c[0] === 'from')).toEqual([['from', 'workspaces']]);
    expect(fake.calls).toContainEqual(['or', 'name.ilike."%VYNHELIX%",main_contact_email.ilike."%VYNHELIX%"', { referencedTable: 'startup' }]);
  });
  it('loads additional bounded pages with a stable tie-breaker', async () => {
    fake.calls = [];
    await searchAssignmentWorkspaces('', 3);
    expect(fake.calls).toContainEqual(['range', 150, 199]);
    expect(fake.calls).toContainEqual(['order', 'id']);
  });
});