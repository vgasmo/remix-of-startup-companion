import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { syncOutlookCalendar, sendTeamsNotification, getAppUrl } from '@/hooks/useIntegrationTriggers';
import { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';

// P1.2: Helper to log activity
async function logActivity(action: string, entityType: string, entityId: string, workspaceId: string, metadata?: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('activity_log').insert({
      user_id: user.id,
      workspace_id: workspaceId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: (metadata || {}) as Json,
    });
  } catch (e) {
    logger.error('Failed to log activity', {}, e);
  }
}

export interface Session {
  id: string;
  workspace_id: string;
  title: string;
  scheduled_at: string;
  duration: number | null;
  agenda: string | null;
  notes: string | null;
  decisions: string | null;
  location: string | null;
  join_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // AI fields
  source: string | null;
  raw_transcript: string | null;
  ai_summary: string | null;
  ai_decisions: string[] | null;
  ai_risks: { risk: string; severity: string }[] | null;
  ai_action_suggestions: { title: string; description: string; priority: string; suggestedDueInDays?: number }[] | null;
  ai_kpi_prompts: { kpiName: string; reason: string; suggestedAction: string }[] | null;
  ai_generated_at: string | null;
  ai_generated_by: string | null;
  creator?: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

export interface SessionFormData {
  title: string;
  scheduled_at: string;
  duration: number;
  agenda: string | null;
  notes: string | null;
  decisions: string | null;
  location?: string | null;
  join_url?: string | null;
  session_type?: string | null;
  source?: string | null;
}

export function useSessions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['sessions', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id, workspace_id, title, scheduled_at, duration, agenda, notes, decisions, location, join_url, created_by, created_at, updated_at, source, ai_summary, ai_decisions, ai_risks, ai_action_suggestions, ai_kpi_prompts, ai_generated_at, ai_generated_by, raw_transcript, session_type')
        .eq('workspace_id', workspaceId)
        .order('scheduled_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      if (!sessions || sessions.length === 0) return [];

      // Fetch creator profiles separately
      const creatorIds = [...new Set(sessions.map(s => s.created_by).filter(Boolean))];
      let profiles: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
      
      if (creatorIds.length > 0) {
        const { data } = await supabase
          .from('profiles_safe')
          .select('id, full_name, avatar_url')
          .in('id', creatorIds);
        profiles = data || [];
      }

      return sessions.map(session => ({
        ...session,
        creator: profiles.find(p => p.id === session.created_by) || null,
      })) as unknown as Session[];
    },
    enabled: !!workspaceId,
  });
}

export function useCalendarSessions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['calendar-sessions', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return (sessions || []) as unknown as Session[];
    },
    enabled: !!workspaceId,
  });
}

export function useCreateSession(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: SessionFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          workspace_id: workspaceId,
          title: session.title,
          scheduled_at: session.scheduled_at,
          duration: session.duration,
          agenda: session.agenda,
          notes: session.notes,
          decisions: session.decisions,
          location: session.location || null,
          join_url: session.join_url || null,
          created_by: user?.id,
          source: session.source || null,
          outlook_sync_status: 'pending', // Mark for sync
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Session;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-sessions', workspaceId] });

      // P1.2: Log activity
      logActivity('created', 'session', data.id, workspaceId, { title: data.title });
      // Tier-0 analytics
      void track('session_scheduled', { workspaceId, properties: { sessionId: data.id } });

      // Skip Outlook/Teams notifications for sessions logged after the fact
      // (i.e. scheduled in the past). These are records of meetings that
      // already happened off-platform, not new invites to send out.
      const scheduledMs = new Date(data.scheduled_at).getTime();
      const isPast = Number.isFinite(scheduledMs) && scheduledMs < Date.now() - 5 * 60 * 1000;

      if (!isPast) {
        // P0.1: Auto-trigger Outlook sync (graceful fail)
        syncOutlookCalendar({
          sessionId: data.id,
          action: 'create',
          workspaceId,
        }).catch((err) => logger.warn('session_outlook_sync_failed', { error: String(err) }));

        // P0.1: Auto-trigger Teams notification (graceful fail)
        (async () => {
          let startupName: string | undefined;
          let ownerName: string | undefined;
          try {
            const { data: ws } = await supabase
              .from('workspaces')
              .select('startup:startups(name), owner_user_id')
              .eq('id', workspaceId)
              .maybeSingle();
            startupName = (ws as any)?.startup?.name || undefined;

            // Fetch owner/consultant name if available
            if ((ws as any)?.owner_user_id) {
              const { data: profile } = await supabase
                .from('profiles_safe')
                .select('full_name, email')
                .eq('id', (ws as any).owner_user_id)
                .maybeSingle();
              ownerName = profile?.full_name || profile?.email || undefined;
            }
          } catch {
            // ignore
          }

          sendTeamsNotification({
            workspaceId,
            eventType: 'session_created',
            payload: {
              title: 'New Session Scheduled',
              summary: `Session "${data.title}" has been scheduled`,
              startup_name: startupName,
              fields: [
                ...(ownerName ? [{ name: 'Owner', value: ownerName }] : []),
                { name: 'Date', value: new Date(data.scheduled_at).toLocaleDateString() },
                { name: 'Duration', value: `${data.duration || 60} min` },
              ],
              link: `${getAppUrl()}/workspace/${workspaceId}?tab=agenda`,
              linkText: 'View Session',
            },
          }).catch((err) => logger.warn('session_teams_notification_failed', { error: String(err) }));
        })().catch((err) => logger.warn('session_teams_wrapper_failed', { error: String(err) }));
      }

    },
  });
}

export function useUpdateSession(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SessionFormData> & { id: string }) => {
      // Track which fields changed for conditional sync
      const syncTriggerFields = ['scheduled_at', 'duration', 'title', 'location', 'join_url'];
      const needsSync = syncTriggerFields.some(field => field in updates);

      const { data, error } = await supabase
        .from('sessions')
        .update({
          ...updates,
          ...(needsSync && { outlook_sync_status: 'pending' }), // Mark for re-sync if relevant fields changed
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { session: data as unknown as Session, needsSync };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-sessions', workspaceId] });

      // P1.2: Log activity
      logActivity('updated', 'session', result.session.id, workspaceId, { title: result.session.title });

      // Auto-recompute health score after session update (fire-and-forget)
      supabase.functions.invoke('recompute-health-scores', {
        body: { workspaceId },
      }).catch(() => {});

      // P0.1: Auto-trigger Outlook sync if date/time/duration changed
      if (result.needsSync) {
        syncOutlookCalendar({
          sessionId: result.session.id,
          action: 'update',
          workspaceId,
        }).catch(() => {}); // Silent fail - non-blocking

        // Send reschedule notification
        (async () => {
          let startupName: string | undefined;
          let ownerName: string | undefined;
          try {
            const { data: ws } = await supabase
              .from('workspaces')
              .select('startup:startups(name), owner_user_id')
              .eq('id', workspaceId)
              .maybeSingle();
            startupName = (ws as any)?.startup?.name || undefined;
            
            if ((ws as any)?.owner_user_id) {
              const { data: profile } = await supabase
                .from('profiles_safe')
                .select('full_name, email')
                .eq('id', (ws as any).owner_user_id)
                .maybeSingle();
              ownerName = profile?.full_name || profile?.email || undefined;
            }
          } catch {
            // ignore
          }

          sendTeamsNotification({
            workspaceId,
            eventType: 'session_rescheduled',
            payload: {
              title: 'Session Updated',
              summary: `Session "${result.session.title}" has been updated`,
              startup_name: startupName,
              fields: [
                ...(ownerName ? [{ name: 'Owner', value: ownerName }] : []),
                { name: 'New Date', value: new Date(result.session.scheduled_at).toLocaleDateString() },
              ],
              link: `${getAppUrl()}/workspace/${workspaceId}?tab=agenda`,
              linkText: 'View Session',
            },
          }).catch(() => {});
        })().catch(() => {});
      }
    },
  });
}

export function useDeleteSession(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      // P0.1: First, trigger Outlook delete BEFORE removing from DB
      // This ensures we still have the outlook_event_id
      await syncOutlookCalendar({
        sessionId,
        action: 'delete',
        workspaceId,
      }).catch(() => {}); // Silent fail - non-blocking

      // P1.2: Log activity before delete
      await logActivity('deleted', 'session', sessionId, workspaceId);

      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-sessions', workspaceId] });
    },
  });
}

export function useSessionActionItems(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-action-items', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      
      const { data, error } = await supabase
        .from('action_items')
        .select(`
          *,
          owner:profiles!action_items_owner_user_id_fkey(id, full_name, avatar_url)
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });
}

export function useCreateActionItem(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (actionItem: {
      title: string;
      description?: string;
      due_date?: string;
      priority?: string;
      session_id?: string;
      owner_user_id?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('action_items')
        .insert({
          workspace_id: workspaceId,
          title: actionItem.title,
          description: actionItem.description || null,
          due_date: actionItem.due_date || null,
          priority: actionItem.priority || 'medium',
          session_id: actionItem.session_id || null,
          owner_user_id: actionItem.owner_user_id || null,
          created_by: user?.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      if (variables.session_id) {
        queryClient.invalidateQueries({ queryKey: ['session-action-items', variables.session_id] });
      }
    },
  });
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data: members, error } = await supabase
        .from('workspace_users')
        .select('id, user_id, role, active')
        .eq('workspace_id', workspaceId)
        .eq('active', true);

      if (error) throw error;
      if (!members) return [];

      // Fetch profiles separately
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

      // Combine data
      return members.map(member => ({
        ...member,
        profile: profiles?.find(p => p.id === member.user_id) || null,
      }));
    },
    enabled: !!workspaceId,
  });
}
