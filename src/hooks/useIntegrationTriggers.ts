/**
 * Hook for auto-triggering Microsoft 365 integrations (Outlook Calendar & Teams)
 * These triggers fire "gracefully" - they don't fail if integrations are not configured.
 * 
 * Teams notifications now use global fallback logic:
 * 1. Try workspace-specific settings first
 * 2. Fallback to global settings if no workspace row exists
 */

import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { useLogActivity } from '@/hooks/useActivityLog';
import { invokeWithAuth } from '@/lib/invokeWithAuth';

interface SyncOutlookParams {
  sessionId: string;
  action: 'create' | 'update' | 'delete';
  workspaceId?: string;
}

interface TeamsNotifyParams {
  workspaceId: string;
  eventType: 'checkin_submitted' | 'action_assigned' | 'action_overdue' | 'session_created' | 'session_rescheduled' | 'health_alert';
  payload: {
    title: string;
    summary: string;
    startup_name?: string;
    fields?: { name: string; value: string }[];
    link?: string;
    linkText?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface IntegrationResult {
  success: boolean;
  reason?: string;
  sent?: boolean;
  eventId?: string;
  teamsMeetingUrl?: string;
  settings_source?: 'workspace' | 'program' | 'global_fallback' | 'not_found';
}

/**
 * Sync session with Outlook calendar (fails gracefully if not configured)
 */
export async function syncOutlookCalendar(params: SyncOutlookParams): Promise<IntegrationResult> {
  try {
    const { data, error } = await invokeWithAuth('sync-outlook-calendar', {
      body: {
        session_id: params.sessionId,
        action: params.action,
      },
    });

    if (error) {
      logger.warn('outlook_sync_error', { message: error.message });
      return { success: false, reason: error.message };
    }

    return {
      success: data?.success ?? false,
      reason: data?.reason,
      eventId: data?.event_id,
      teamsMeetingUrl: data?.teams_meeting_url,
    };
  } catch (err) {
    logger.warn('outlook_sync_failed', { error: String(err) });
    return { success: false, reason: 'Network error' };
  }
}

/**
 * Send Teams notification (fails gracefully if not configured)
 * Uses global fallback logic in the edge function
 */
export async function sendTeamsNotification(params: TeamsNotifyParams): Promise<IntegrationResult> {
  try {
    const { data, error } = await invokeWithAuth('teams-notify', {
      body: {
        workspace_id: params.workspaceId,
        event_type: params.eventType,
        payload: {
          title: params.payload.title,
          summary: params.payload.summary,
          startup_name: params.payload.startup_name,
          fields: params.payload.fields,
          link: params.payload.link,
          link_text: params.payload.linkText,
          priority: params.payload.priority,
        },
      },
    });

    if (error) {
      logger.warn('teams_notify_error', { message: error.message });
      return { success: false, reason: error.message };
    }

    return {
      success: data?.success ?? false,
      sent: data?.sent ?? false,
      reason: data?.reason,
      settings_source: data?.settings_source,
    };
  } catch (err) {
    logger.warn('teams_notify_failed', { error: String(err) });
    return { success: false, reason: 'Network error' };
  }
}

/**
 * Hook providing integration trigger methods with activity logging
 */
export function useIntegrationTriggers() {
  const logActivity = useLogActivity();

  const triggerOutlookSync = async (params: SyncOutlookParams): Promise<IntegrationResult> => {
    const result = await syncOutlookCalendar(params);
    
    // Log the sync attempt if workspace is known
    if (params.workspaceId) {
      logActivity.mutate({
        workspaceId: params.workspaceId,
        entityType: 'integration',
        entityId: params.sessionId,
        action: `outlook_sync_${params.action}`,
        metadata: {
          success: result.success,
          reason: result.reason,
          eventId: result.eventId,
        },
      });
    }

    return result;
  };

  const triggerTeamsNotify = async (params: TeamsNotifyParams): Promise<IntegrationResult> => {
    const result = await sendTeamsNotification(params);

    // Log the notification attempt
    logActivity.mutate({
      workspaceId: params.workspaceId,
      entityType: 'integration',
      entityId: params.workspaceId,
      action: `teams_notify_${params.eventType}`,
      metadata: {
        success: result.success,
        reason: result.reason,
        sent: result.success && result.reason !== 'not_configured',
      },
    });

    return result;
  };

  return {
    triggerOutlookSync,
    triggerTeamsNotify,
  };
}

/**
 * Get APP_URL for links in notifications
 */
export function getAppUrl(): string {
  // In browser context, use window.location.origin
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://startupleiria.app';
}
