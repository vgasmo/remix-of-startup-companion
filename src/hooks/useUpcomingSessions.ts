import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { addDays } from 'date-fns';

export interface UpcomingSession {
  id: string;
  title: string;
  scheduled_at: string;
  duration: number | null;
  location: string | null;
  join_url: string | null;
  teams_meeting_url: string | null;
  agenda: string | null;
  workspace_id: string;
  startup_name: string;
}

const SESSION_SELECT = `
  id,
  title,
  scheduled_at,
  duration,
  location,
  join_url,
  teams_meeting_url,
  agenda,
  workspace_id,
  status,
  workspace:workspaces(
    startup:startups(name)
  )
` as const;

type SessionRow = {
  id: string;
  title: string;
  scheduled_at: string;
  duration: number | null;
  location: string | null;
  join_url: string | null;
  teams_meeting_url: string | null;
  agenda: string | null;
  workspace_id: string;
  status: string | null;
  workspace: { startup: { name: string } | null } | null;
};

const shape = (rows: SessionRow[]): UpcomingSession[] =>
  rows.map((s) => ({
    id: s.id,
    title: s.title,
    scheduled_at: s.scheduled_at,
    duration: s.duration,
    location: s.location,
    join_url: s.join_url,
    teams_meeting_url: s.teams_meeting_url,
    agenda: s.agenda,
    workspace_id: s.workspace_id,
    startup_name: s.workspace?.startup?.name || 'Unknown',
  }));

export function useUpcomingSessions() {
  return useQuery({
    queryKey: ['upcoming-sessions'],
    queryFn: async (): Promise<UpcomingSession[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const now = new Date().toISOString();
      const weekFromNow = addDays(new Date(), 7).toISOString();

      const { data: workspaceIds } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('active', true);

      // Hide cancelled/no_show sessions from every "upcoming" surface.
      const notCancelled = 'not.in.(cancelled,no_show)';

      if (!workspaceIds || workspaceIds.length === 0) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        const isStaff = roles?.some(
          (r) => r.role === 'admin' || r.role === 'consultor' || r.role === 'backoffice',
        );
        if (!isStaff) return [];

        const { data, error } = await supabase
          .from('sessions')
          .select(SESSION_SELECT)
          .gte('scheduled_at', now)
          .lte('scheduled_at', weekFromNow)
          .or(`status.is.null,status.${notCancelled}`)
          .order('scheduled_at', { ascending: true })
          .limit(20);
        if (error) throw error;
        return shape((data ?? []) as unknown as SessionRow[]);
      }

      const ids = workspaceIds.map((w) => w.workspace_id);
      const { data, error } = await supabase
        .from('sessions')
        .select(SESSION_SELECT)
        .in('workspace_id', ids)
        .gte('scheduled_at', now)
        .lte('scheduled_at', weekFromNow)
        .or(`status.is.null,status.${notCancelled}`)
        .order('scheduled_at', { ascending: true })
        .limit(20);
      if (error) throw error;
      return shape((data ?? []) as unknown as SessionRow[]);
    },
  });
}
