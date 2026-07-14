import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { startOfDay, endOfDay, addDays, subDays } from 'date-fns';
import type { FunnelStage } from '@/constants/funnelStages';

export interface CrmInboxItem {
  id: string;
  contact_name: string | null;
  organization_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  stage: FunnelStage;
  owner_consultant_id: string | null;
  program_id: string | null;
  next_action_at: string | null;
  next_action_description: string | null;
  last_activity_at: string | null;
  linked_workspace_id: string | null;
  notes: string | null;
  source: string | null;
  first_contact_at: string | null;
  metadata_json: unknown;
  deal_value: number | null;
  deal_currency: string | null;
  expected_close_date: string | null;
  win_probability: number | null;
  created_at: string;
  owner?: { id: string; full_name: string | null } | null;
  program?: { id: string; name: string } | null;
}

export interface CrmInboxGroups {
  overdue: CrmInboxItem[];
  today: CrmInboxItem[];
  upcoming: CrmInboxItem[];
  noNextAction: CrmInboxItem[];
  stale: CrmInboxItem[];
}

interface UseCrmInboxFilters {
  programId?: string;
  stage?: FunnelStage;
  /** Optional multi-stage filter (segment). Applied when set; overrides single `stage`. */
  stages?: FunnelStage[];
  assigneeId?: string;
  search?: string;
  myItemsOnly?: boolean;
  currentUserId?: string;
}

// Explicit select for funnel_items (P1.2 optimization)
// G0: include deal fields — the drawer opened from the Inbox was stripping
// deal_value/expected_close/win_probability, so Save nulled the existing deal.
const FUNNEL_ITEM_FIELDS = `
  id, stage, type, owner_consultant_id, program_id,
  contact_name, contact_email, organization_name,
  next_action_at, next_action_description, last_activity_at,
  linked_workspace_id, metadata_json, notes, contact_phone, source, first_contact_at,
  deal_value, deal_currency, expected_close_date, win_probability,
  created_at, updated_at
`;




/**
 * Operational (post-contracting) customer records must not appear in the
 * commercial "stale" / "no next action" buckets merely because historical
 * CRM activity is missing. They are only surfaced when they carry an
 * explicit next_action_at (overdue / today / upcoming).
 */
export function isOperationalCustomer(item: {
  stage: FunnelStage | string;
  type?: string | null;
}): boolean {
  if (item.stage === 'incubating' || item.stage === 'accelerating') return true;
  if (item.stage === 'contracted' && item.type === 'startup_active') return true;
  return false;
}


export function useCrmInbox(filters?: UseCrmInboxFilters) {
  return useQuery({
    queryKey: ['crm-inbox', filters],
    queryFn: async (): Promise<CrmInboxGroups> => {
      let query = supabase
        .from('funnel_items')
        .select(FUNNEL_ITEM_FIELDS)
        .not('stage', 'in', '(rejected,archived)')
        .order('next_action_at', { ascending: true, nullsFirst: false });

      if (filters?.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters?.stages && filters.stages.length > 0) {
        query = query.in('stage', filters.stages);
      } else if (filters?.stage) {
        query = query.eq('stage', filters.stage);
      }
      if (filters?.assigneeId) {
        query = query.eq('owner_consultant_id', filters.assigneeId);
      }
      if (filters?.myItemsOnly && filters?.currentUserId) {
        query = query.eq('owner_consultant_id', filters.currentUserId);
      }
      if (filters?.search) {
        const searchTerm = `%${filters.search}%`;
        query = query.or(`organization_name.ilike.${searchTerm},contact_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`);
      }

      const { data: items, error } = await query;
      if (error) throw error;

      // Fetch owners
      const ownerIds = [...new Set((items || []).filter(i => i.owner_consultant_id).map(i => i.owner_consultant_id))];
      let owners: Record<string, { id: string; full_name: string | null }> = {};
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name')
          .in('id', ownerIds as string[]);
        profiles?.forEach(p => { owners[p.id] = p; });
      }

      // Fetch programs
      const programIds = [...new Set((items || []).filter(i => i.program_id).map(i => i.program_id))];
      let programs: Record<string, { id: string; name: string }> = {};
      if (programIds.length > 0) {
        const { data: progs } = await supabase
          .from('programs')
          .select('id, name')
          .in('id', programIds as string[]);
        progs?.forEach(p => { programs[p.id] = p; });
      }

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const weekEnd = endOfDay(addDays(now, 7));
      const staleThreshold = subDays(now, 14);

      const enrichedItems: CrmInboxItem[] = (items || []).map(item => ({
        ...item,
        stage: item.stage as FunnelStage,
        owner: item.owner_consultant_id ? owners[item.owner_consultant_id] || null : null,
        program: item.program_id ? programs[item.program_id] || null : null,
      }));

      const groups: CrmInboxGroups = {
        overdue: [],
        today: [],
        upcoming: [],
        noNextAction: [],
        stale: [],
      };

      enrichedItems.forEach(item => {
        // Operational (post-contracting) customers are excluded from
        // commercial follow-up buckets unless they carry an explicit
        // next_action_at. Missing historical activity is not a signal.
        const operational = isOperationalCustomer(item);

        if (!item.next_action_at) {
          if (operational) return; // not commercial follow-up

          const lastActivity = item.last_activity_at ? new Date(item.last_activity_at) : null;
          const isStale = !lastActivity || lastActivity < staleThreshold;

          if (isStale) {
            groups.stale.push(item);
          } else {
            groups.noNextAction.push(item);
          }
        } else {
          const actionDate = new Date(item.next_action_at);
          if (actionDate < todayStart) {
            groups.overdue.push(item);
          } else if (actionDate >= todayStart && actionDate <= todayEnd) {
            groups.today.push(item);
          } else if (actionDate <= weekEnd) {
            groups.upcoming.push(item);
          } else {
            groups.upcoming.push(item);
          }
        }
      });

      // Sort stale by last_activity_at ascending (oldest first)
      groups.stale.sort((a, b) => {
        const aDate = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const bDate = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return aDate - bDate;
      });

      return groups;
    },
  });
}

export function useCrmTasksDue(filters?: UseCrmInboxFilters) {
  return useQuery({
    queryKey: ['crm-tasks-due', filters],
    queryFn: async () => {
      let query = supabase
        .from('communication_log')
        .select('*')
        .eq('activity_type', 'task')
        .eq('status', 'open')
        .not('due_at', 'is', null)
        .order('due_at', { ascending: true });

      if (filters?.assigneeId) {
        query = query.eq('assigned_to', filters.assigneeId);
      }
      if (filters?.myItemsOnly && filters?.currentUserId) {
        query = query.eq('assigned_to', filters.currentUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const weekEnd = endOfDay(addDays(now, 7));

      const groups = {
        overdue: [] as typeof data,
        today: [] as typeof data,
        upcoming: [] as typeof data,
      };

      (data || []).forEach(task => {
        if (!task.due_at) return;
        const dueDate = new Date(task.due_at);
        if (dueDate < todayStart) {
          groups.overdue.push(task);
        } else if (dueDate >= todayStart && dueDate <= todayEnd) {
          groups.today.push(task);
        } else if (dueDate <= weekEnd) {
          groups.upcoming.push(task);
        }
      });

      return groups;
    },
  });
}
