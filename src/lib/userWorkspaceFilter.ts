export type UserWorkspaceFilter = 'all' | 'none' | 'no_active';

type Assignment = { user_id: string; workspace_id: string; active: boolean };
type Workspace = { id: string; status: string; archived_at: string | null; blocked_at: string | null };

export function buildUserWorkspaceIndex(assignments: Assignment[], workspaces: Workspace[]) {
  const available = new Set(workspaces.filter(w => !w.archived_at && !w.blocked_at && !['archived', 'rejected', 'blocked'].includes(w.status)).map(w => w.id));
  return {
    assigned: new Set(assignments.map(a => a.user_id)),
    active: new Set(assignments.filter(a => a.active && available.has(a.workspace_id)).map(a => a.user_id)),
  };
}

export function matchesUserWorkspaceFilter(userId: string, filter: UserWorkspaceFilter, index: ReturnType<typeof buildUserWorkspaceIndex>) {
  if (filter === 'none') return !index.assigned.has(userId);
  if (filter === 'no_active') return !index.active.has(userId);
  return true;
}