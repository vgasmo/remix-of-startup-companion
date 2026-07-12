import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronSecret, generateRequestId, createLogger } from '../_shared/security.ts';

const FUNCTION_NAME = 'check-missed-milestones';

/**
 * Helper to send Teams notification (non-blocking)
 */
async function sendTeamsNotification(
  supabaseUrl: string,
  supabaseKey: string,
  workspaceId: string,
  eventType: string,
  payload: Record<string, unknown>,
  log?: { warn: (msg: string, ctx?: unknown) => void },
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/teams-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'x-cron-secret': Deno.env.get('CRON_SECRET') || '',
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        event_type: eventType,
        payload,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log?.warn('teams_notify_failed', { workspaceId, eventType, status: response.status, body });
    }
    return response.ok;
  } catch (err) {
    log?.warn('teams_notify_threw', { workspaceId, eventType, error: String(err) });
    return false;
  }
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    // SECURITY: Require cron secret for system-initiated calls
    const authResult = requireCronSecret(req);
    if ('error' in authResult) {
      log.warn('Unauthorized access attempt');
      return authResult.error;
    }

    log.info('Starting missed milestones check');

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split('T')[0];

    // Find milestones that are past due and not completed/delayed
    const { data: missedMilestones, error: milestonesError } = await supabase
      .from('milestones')
      .select(`
        id,
        title,
        target_date,
        workspace_id,
        status,
        workspace:workspaces!inner(
          id,
          startup:startups(name)
        )
      `)
      .lt('target_date', today)
      .in('status', ['not_started', 'in_progress'])
      .is('completed_at', null);

    if (milestonesError) {
      log.error('Error fetching milestones', milestonesError);
      throw milestonesError;
    }

    log.info('Found missed milestones', { count: missedMilestones?.length || 0 });

    const createdActions: string[] = [];
    const createdAlerts: string[] = [];
    const teamsNotifications: string[] = [];

    for (const milestone of missedMilestones || []) {
      const startupName = (milestone.workspace as any)?.startup?.name || 'Unknown Startup';

      // Check if we already created an action for this missed milestone
      const { data: existingAction } = await supabase
        .from('action_items')
        .select('id')
        .eq('milestone_id', milestone.id)
        .ilike('title', '%missed%')
        .limit(1);

      if (existingAction && existingAction.length > 0) {
        log.info('Action already exists for milestone', { milestoneId: milestone.id });
        continue;
      }

      // Create action item for missed milestone
      const { data: actionData, error: actionError } = await supabase
        .from('action_items')
        .insert({
          workspace_id: milestone.workspace_id,
          milestone_id: milestone.id,
          title: `Review missed milestone: ${milestone.title}`,
          description: `This milestone was due on ${milestone.target_date} but has not been completed. Please review and update the status or reschedule.`,
          priority: 'high',
          status: 'pending',
        })
        .select()
        .single();

      if (actionError) {
        log.error('Error creating action for milestone', actionError, { milestoneId: milestone.id });
        continue;
      }

      createdActions.push(actionData.id);

      // Mark milestone as delayed
      await supabase
        .from('milestones')
        .update({ status: 'delayed' })
        .eq('id', milestone.id);

      // Create workspace alert
      const { data: alertData, error: alertError } = await supabase
        .from('staff_work_queue_items')
        .insert({
          workspace_id: milestone.workspace_id,
          type: 'milestone_missed',
          title: `Milestone missed: ${milestone.title}`,
          description: `Target date ${milestone.target_date} has passed`,
          priority: 'high',
          status: 'open',
          related_milestone_id: milestone.id,
        })
        .select()
        .single();

      if (!alertError && alertData) {
        createdAlerts.push(alertData.id);
      }

      // Send Teams notification for action overdue
      const appUrl = Deno.env.get('APP_URL') || 'https://startupleiria.app';
      const teamsSent = await sendTeamsNotification(
        supabaseUrl,
        supabaseKey,
        milestone.workspace_id,
        'action_overdue',
        {
          title: 'Milestone Overdue',
          summary: `Milestone "${milestone.title}" was due on ${milestone.target_date} and has not been completed.`,
          startup_name: startupName,
          fields: [
            { name: 'Milestone', value: milestone.title },
            { name: 'Due Date', value: milestone.target_date },
            { name: 'Status', value: 'Marked as Delayed' },
          ],
          link: `${appUrl}/workspace/${milestone.workspace_id}?tab=milestones-actions`,
          link_text: 'View Milestone',
          priority: 'high',
        }
      );
      
      if (teamsSent) {
        teamsNotifications.push(milestone.id);
      }

      // Log activity
      await supabase
        .from('activity_log')
        .insert({
          workspace_id: milestone.workspace_id,
          entity_type: 'milestone',
          entity_id: milestone.id,
          action: 'auto_missed_alert',
          user_id: '00000000-0000-0000-0000-000000000000', // System user
          metadata: { milestone_title: milestone.title, target_date: milestone.target_date },
        });
    }

    log.info('Check complete', { 
      checked: missedMilestones?.length || 0,
      actionsCreated: createdActions.length,
      alertsCreated: createdAlerts.length,
      teamsNotified: teamsNotifications.length,
    });

    return corsJsonResponse({ 
      success: true,
      checked: missedMilestones?.length || 0,
      actionsCreated: createdActions.length,
      alertsCreated: createdAlerts.length,
      teamsNotified: teamsNotifications.length,
    }, req);

  } catch (error) {
    log.error('Fatal error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return corsJsonResponse({ error: message, code: 'INTERNAL_ERROR' }, req, 500);
  }
});
