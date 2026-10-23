import { supabase } from '@/lib/supabaseClient';

export const ASSIGNMENT_PAGE_SIZE = 50;

/** Filter the joined startup on the server, not a capped preliminary ID list. */
export async function searchAssignmentWorkspaces(search: string, page = 0) {
  const offset = Math.max(0, Math.floor(page)) * ASSIGNMENT_PAGE_SIZE;
  let query = supabase.from('workspaces')
    .select('id, status, startup:startups!inner(id, name, main_contact_email)')
    .in('status', ['imported_unclaimed', 'active', 'claimed', 'pending'])
    .order('created_at', { ascending: false }).order('id')
    .range(offset, offset + ASSIGNMENT_PAGE_SIZE - 1);
  const term = search.trim().replace(/[%_",()\\]/g, '');
  if (term) {
    const pattern = `%${term}%`;
    query = query.or(`name.ilike."${pattern}",main_contact_email.ilike."${pattern}"`, { referencedTable: 'startup' });
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}