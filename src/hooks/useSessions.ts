import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { syncOutlookCalendar, sendTeamsNotification, getAppUrl } from '@/hooks/useIntegrationTriggers';
import { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';
import { invokeWithAuth } from "@/lib/invokeWithAuth";
import { sessionEventKey } from "@/lib/notificationEventKey";

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

// Notify workspace participants (founder, consultor, mentors) on session
// create/reschedule/cancel — inbox notification for everyone, email for
// rescheduled/cancelled (create emails are triggered from CreateSessionDialog
// when the organizer opts in via "sendInvites").
type SessionEventKind = 'created' | 'rescheduled' | 'cancelled';

async function notifySessionEvent(
  kind: SessionEventKind,
  session: { id: string; title: string; scheduled_at: string; duration: number | null; agenda?: string | null },
  workspaceId: string,
  opts: { sendEmail?: boolean } = {},
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Recipients: all active workspace members. Exclude the actor so they
    // don't ping themselves. Fetch profile emails/preferred language too.
    const { data: members } = await supabase
      .from('workspace_users')
      .select('user_id, role, active')
      .eq('workspace_id', workspaceId)
      .eq('active', true);

    const memberIds = (members || []).map((m) => m.user_id).filter(Boolean);
    if (memberIds.length === 0) return;

    const { data: profiles } = await supabase
      .from('profiles_safe')
      .select('id, full_name, email')
      .in('id', memberIds);

    const workspaceInfo = await supabase
      .from('workspaces')
      .select('id, startup:startups(name)')
      .eq('id', workspaceId)
      .maybeSingle();
    const startupName = ((workspaceInfo.data as { startup?: { name?: string } } | null)?.startup?.name) || 'Startup';

    const scheduledDate = new Date(session.scheduled_at);
    const dateStr = Number.isFinite(scheduledDate.getTime())
      ? scheduledDate.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
      : session.scheduled_at;

    const titleByKind: Record<SessionEventKind, string> = {
      created: `Sessão agendada: ${session.title}`,
      rescheduled: `Sessão reagendada: ${session.title}`,
      cancelled: `Sessão cancelada: ${session.title}`,
    };
    const messageByKind: Record<SessionEventKind, string> = {
      created: `Nova sessão em ${dateStr}.`,
      rescheduled: `Nova data: ${dateStr}.`,
      cancelled: `Prevista para ${dateStr}.`,
    };
    const typeByKind: Record<SessionEventKind, string> = {
      created: 'session_scheduled',
      rescheduled: 'session_rescheduled',
      cancelled: 'session_cancelled',
    };

    const link = `/workspace/${workspaceId}?tab=agenda`;

    // Inbox notifications — one per recipient (skip the actor).
    // Keyed by (session, kind, recipient) so provider retries or a rapid
    // reschedule→reschedule sequence never spams the inbox.
    const inboxRows = memberIds
      .filter((id) => id !== user?.id)
      .map((id) => ({
        user_id: id,
        type: typeByKind[kind],
        title: titleByKind[kind],
        message: messageByKind[kind],
        link,
        entity_type: 'session',
        entity_id: session.id,
        read: false,
        event_key: sessionEventKey(session.id, kind, id),
      }));

    if (inboxRows.length > 0) {
      await supabase
        .from('notifications')
        .upsert(inboxRows, { onConflict: 'user_id,event_key', ignoreDuplicates: true });
    }

    // Email invites — always for rescheduled/cancelled, opt-in for created
    // (create is handled by CreateSessionDialog's sendInvites flow).
    if (opts.sendEmail !== false && (kind === 'rescheduled' || kind === 'cancelled')) {
      const recipientEmails = (profiles || [])
        .filter((p) => p.id !== user?.id && !!p.email)
        .map((p) => p.email as string);

      if (recipientEmails.length > 0) {
        const organizerProfile = (profiles || []).find((p) => p.id === user?.id);
        await invokeWithAuth('send-session-invite', {
          body: {
            sessionId: session.id,
            workspaceId,
            title: session.title,
            scheduledAt: session.scheduled_at,
            duration: session.duration || 60,
            agenda: session.agenda || undefined,
            recipientEmails,
            organizerName: organizerProfile?.full_name || organizerProfile?.email || 'Startup Leiria',
            startupName,
            eventType: kind,
          },
        });
      }
    }
  } catch (e) {
    logger.warn('session_event_notify_failed', { kind, error: String(e) });
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

      // Inbox notifications for all participants (email invites for "created"
      // are sent by CreateSessionDialog when the organizer keeps "sendInvites"
      // enabled — passing sendEmail: false avoids duplicates here).
      void notifySessionEvent('created', {
        id: data.id, title: data.title, scheduled_at: data.scheduled_at, duration: data.duration, agenda: data.agenda,
      }, workspaceId, { sendEmail: false });

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

// Phase 3: canonical write-side session completion.
// Captures the fields impact reporting depends on so we never again need to
// backfill fabricated completions. `actual_duration_minutes` MUST be provided
// (no silent copy from planned `duration`). Participant attendance is
// upserted per (session_id, user_id).
export interface SessionCompletionPayload {
  session_id: string;
  workspace_id: string;
  actual_duration_minutes: number;
  primary_consultant_id: string | null;
  session_template_id?: string | null;
  completed_at?: string; // ISO; defaults to now
  attendance: Array<{ user_id: string; attendance_status: 'attended' | 'absent' | 'excused' | 'unknown'; role?: string | null }>;
  notes?: string | null;
  decisions?: string | null;
}

export function useCompleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SessionCompletionPayload) => {
      if (!payload.session_id) throw new Error('session_id required');
      if (!payload.workspace_id) throw new Error('workspace_id required');
      if (typeof payload.actual_duration_minutes !== 'number' || payload.actual_duration_minutes <= 0) {
        throw new Error('actual_duration_minutes must be > 0');
      }
      if (!payload.primary_consultant_id) throw new Error('primary_consultant_id required');

      // Release-hardening P0: session completion is now atomic on the server.
      // A single SECURITY DEFINER RPC locks the session row, validates the
      // transition (scheduled → completed only), enforces workspace + role
      // access, upserts attendance in the same transaction, and is
      // idempotent per client-supplied key.
      const idempotencyKey =
        (globalThis.crypto?.randomUUID?.() ??
          `${payload.session_id}-${Date.now()}`);

      // Cast to `never` on the RPC name is required until Supabase types are
      // regenerated after the `complete_session_atomic` migration is applied.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'complete_session_atomic',
        {
          p_session_id: payload.session_id,
          p_workspace_id: payload.workspace_id,
          p_actual_duration_minutes: payload.actual_duration_minutes,
          p_primary_consultant_id: payload.primary_consultant_id,
          p_template_id: payload.session_template_id ?? null,
          p_notes: payload.notes ?? null,
          p_decisions: payload.decisions ?? null,
          p_participants: payload.attendance,
          p_idempotency_key: idempotencyKey,
        },
      );
      if (error) throw new Error(error.message);

      // Canonical tool usage event — powers Adoption tab.
      const { logToolUsage, TOOL_EVENTS } = await import('@/lib/toolUsage');
      await logToolUsage(TOOL_EVENTS.SESSION_COMPLETED, {
        workspaceId: payload.workspace_id,
        sessionId: payload.session_id,
        entityType: 'session',
        entityId: payload.session_id,
        metadata: {
          actual_duration_minutes: payload.actual_duration_minutes,
          participant_count: payload.attendance.length,
          attended_count: payload.attendance.filter(a => a.attendance_status === 'attended').length,
          has_template: !!payload.session_template_id,
        },
      });

      return data as { session_id: string; workspace_id: string };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', vars.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['calendar-sessions', vars.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['workspace-sessions', vars.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['impact-aggregates'] });
    },
  });
}

export function useUpdateSession(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SessionFormData> & { id: string }) => {
      // Outlook re-sync covers anything that changes the event card
      // (subject / when / where). Reschedule email + Teams ping only fire
      // when the *time* actually moved — a rename must not spam attendees.
      const outlookSyncFields = ['scheduled_at', 'duration', 'title', 'location', 'join_url'];
      const rescheduleFields = ['scheduled_at', 'duration'];
      const needsSync = outlookSyncFields.some(field => field in updates);
      const isReschedule = rescheduleFields.some(field => field in updates);

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
      return { session: data as unknown as Session, needsSync, isReschedule };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-sessions', workspaceId] });

      // P1.2: Log activity
      logActivity('updated', 'session', result.session.id, workspaceId, { title: result.session.title });

      // Inbox + email notifications for all participants — only on real reschedule
      if (result.isReschedule) {
        void notifySessionEvent('rescheduled', {
          id: result.session.id,
          title: result.session.title,
          scheduled_at: result.session.scheduled_at,
          duration: result.session.duration,
          agenda: result.session.agenda,
        }, workspaceId);
      }

      // Auto-recompute health score after session update (fire-and-forget)
      invokeWithAuth('recompute-health-scores', {
        body: { workspaceId },
      }).catch((err) => logger.warn('recompute_health_score_failed', { workspaceId, error: String(err) }));

      // P0.1: Auto-trigger Outlook sync if any card-visible field changed
      if (result.needsSync) {
        syncOutlookCalendar({
          sessionId: result.session.id,
          action: 'update',
          workspaceId,
        }).catch((err) => logger.warn('outlook_sync_update_failed', { workspaceId, sessionId: result.session.id, error: String(err) }));
      }

      // Teams ping — only when the meeting time moved
      if (result.isReschedule) {
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
          } catch (err) {
            logger.warn('session_reschedule_lookup_failed', { workspaceId, error: String(err) });
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
          }).catch((err) => logger.warn('teams_notify_reschedule_failed', { workspaceId, error: String(err) }));
        })().catch((err) => logger.warn('session_reschedule_notify_wrapper_failed', { workspaceId, error: String(err) }));
      }
    },
  });
}

export function useDeleteSession(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      // Snapshot session details BEFORE the delete so we can still notify
      // participants (inbox + email) once the row is gone.
      const { data: sessionSnapshot } = await supabase
        .from('sessions')
        .select('id, title, scheduled_at, duration, agenda')
        .eq('id', sessionId)
        .maybeSingle();

      // P0.1: First, trigger Outlook delete BEFORE removing from DB
      // This ensures we still have the outlook_event_id
      await syncOutlookCalendar({
        sessionId,
        action: 'delete',
        workspaceId,
      }).catch((err) => logger.warn('outlook_sync_delete_failed', { workspaceId, sessionId, error: String(err) }));

      // Inbox + email cancellation notice while session data is still available
      if (sessionSnapshot) {
        await notifySessionEvent('cancelled', sessionSnapshot as {
          id: string; title: string; scheduled_at: string; duration: number | null; agenda?: string | null;
        }, workspaceId);
      }

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
