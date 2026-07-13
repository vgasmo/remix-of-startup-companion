import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireCronSecret } from '../_shared/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

interface WorkflowRule {
  id: string;
  program_id: string | null;
  trigger_type: string;
  conditions_json: Record<string, unknown>;
  actions_json: Record<string, unknown>;
  enabled: boolean;
}

interface Workspace {
  id: string;
  program_id: string | null;
  health_status: string | null;
  status: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Fail-closed timing-safe x-cron-secret check (cron-only).
    const authCheck = requireCronSecret(req);
    if ('error' in authCheck) {
      console.error('[run-workflow-rules] Unauthorized invocation');
      return authCheck.error;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting workflow rules evaluation...');

    // Get all enabled rules
    const { data: rules, error: rulesError } = await supabase
      .from('workflow_rules')
      .select('*')
      .eq('enabled', true);

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      throw rulesError;
    }

    console.log(`Found ${rules?.length || 0} enabled rules`);

    // Get all active workspaces
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('id, program_id, health_status, status')
      .eq('status', 'active');

    if (wsError) {
      console.error('Error fetching workspaces:', wsError);
      throw wsError;
    }

    console.log(`Found ${workspaces?.length || 0} active workspaces`);

    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);
    let executionsCreated = 0;

    for (const rule of (rules || []) as WorkflowRule[]) {
      for (const workspace of (workspaces || []) as Workspace[]) {
        // Skip if rule is program-specific and doesn't match
        if (rule.program_id && rule.program_id !== workspace.program_id) {
          continue;
        }

        const triggerEventId = `${rule.trigger_type}-${today}-${workspace.id}`;
        let shouldTrigger = false;
        let actionContext: Record<string, unknown> = {};

        // Evaluate trigger conditions
        switch (rule.trigger_type) {
          case 'kpi_missing_by_day': {
            const dayThreshold = (rule.conditions_json.days_threshold as number) || 5;
            const currentDay = new Date().getDate();
            
            if (currentDay >= dayThreshold) {
              // Check if KPIs exist for current month
              const { data: kpis } = await supabase
                .from('kpi_values')
                .select('id')
                .eq('workspace_id', workspace.id)
                .eq('period_month', `${currentMonth}-01`)
                .limit(1);

              if (!kpis || kpis.length === 0) {
                shouldTrigger = true;
                actionContext = { reason: 'kpi_missing', month: currentMonth };
              }
            }
            break;
          }

          case 'action_overdue_by_days': {
            const daysThreshold = (rule.conditions_json.days_threshold as number) || 7;
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

            const { data: overdueActions } = await supabase
              .from('action_items')
              .select('id, title')
              .eq('workspace_id', workspace.id)
              .in('status', ['pending', 'in_progress'])
              .lt('due_date', thresholdDate.toISOString().split('T')[0])
              .limit(5);

            if (overdueActions && overdueActions.length > 0) {
              shouldTrigger = true;
              actionContext = { 
                reason: 'overdue_actions', 
                count: overdueActions.length,
                actions: overdueActions 
              };
            }
            break;
          }

          case 'no_activity_for_days': {
            const daysThreshold = (rule.conditions_json.days_threshold as number) || 30;
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

            const { data: recentSessions } = await supabase
              .from('sessions')
              .select('id')
              .eq('workspace_id', workspace.id)
              .gte('scheduled_at', thresholdDate.toISOString())
              .limit(1);

            if (!recentSessions || recentSessions.length === 0) {
              shouldTrigger = true;
              actionContext = { reason: 'no_sessions', days: daysThreshold };
            }
            break;
          }

          case 'health_dropped_to_risk': {
            const targetStatuses = (rule.conditions_json.health_status as string[]) || ['at_risk', 'critical'];
            
            if (workspace.health_status && targetStatuses.includes(workspace.health_status)) {
              shouldTrigger = true;
              actionContext = { reason: 'health_drop', status: workspace.health_status };
            }
            break;
          }
        }

        if (shouldTrigger) {
          // Check idempotency - don't trigger if already executed
          const { data: existing } = await supabase
            .from('workflow_executions')
            .select('id')
            .eq('rule_id', rule.id)
            .eq('workspace_id', workspace.id)
            .eq('trigger_event_id', triggerEventId)
            .maybeSingle();

          if (existing) {
            console.log(`Skipping duplicate execution: ${triggerEventId}`);
            continue;
          }

          console.log(`Triggering rule ${rule.id} for workspace ${workspace.id}`);

          // Execute action
          const actionType = rule.actions_json.action as string;
          let actionResult: Record<string, unknown> = { executed: false };

          switch (actionType) {
            case 'create_staff_task': {
              const { data: task, error: taskError } = await supabase
                .from('staff_tasks')
                .insert({
                  workspace_id: workspace.id,
                  title: `[Auto] ${rule.actions_json.task_template || 'Follow-up required'}`,
                  description: `Triggered by workflow rule: ${rule.trigger_type}. Context: ${JSON.stringify(actionContext)}`,
                  priority: 'high',
                  source_rule_id: rule.id,
                })
                .select('id')
                .single();

              actionResult = { executed: true, task_id: task?.id, error: taskError?.message };
              break;
            }

            case 'send_inapp_message': {
              // Get workspace founder
              const { data: founder } = await supabase
                .from('workspace_users')
                .select('user_id')
                .eq('workspace_id', workspace.id)
                .eq('role', 'founder')
                .limit(1)
                .maybeSingle();

              if (founder) {
                const { error: notifError } = await supabase
                  .from('notifications')
                  .insert({
                    user_id: founder.user_id,
                    type: 'workflow_reminder',
                    title: rule.actions_json.message_template === 'kpi_reminder' 
                      ? 'KPI Update Reminder' 
                      : 'Action Required',
                    message: `Please update your ${rule.trigger_type === 'kpi_missing_by_day' ? 'KPIs' : 'actions'}`,
                    link: `/workspace/${workspace.id}`,
                  });
                actionResult = { executed: true, notified: founder.user_id, error: notifError?.message };
              }
              break;
            }

            case 'escalate_to_consultant':
            case 'send_email_digest_item': {
              // Get assigned consultant
              const { data: consultant } = await supabase
                .from('workspace_users')
                .select('user_id')
                .eq('workspace_id', workspace.id)
                .eq('role', 'consultor')
                .limit(1)
                .maybeSingle();

              if (consultant) {
                const { error: notifError } = await supabase
                  .from('notifications')
                  .insert({
                    user_id: consultant.user_id,
                    type: 'workflow_escalation',
                    title: 'Workspace Needs Attention',
                    message: `Triggered by: ${rule.trigger_type}`,
                    link: `/workspace/${workspace.id}`,
                    metadata: actionContext,
                  });
                actionResult = { executed: true, escalated_to: consultant.user_id, error: notifError?.message };
              }
              break;
            }
          }

          // Record execution
          const { error: execError } = await supabase
            .from('workflow_executions')
            .insert({
              rule_id: rule.id,
              workspace_id: workspace.id,
              trigger_event_id: triggerEventId,
              status: actionResult.executed ? 'completed' : 'failed',
              result_json: { action: actionType, context: actionContext, result: actionResult },
            });

          if (!execError) {
            executionsCreated++;
          }

          // Log activity
          await supabase.from('activity_log').insert({
            workspace_id: workspace.id,
            user_id: '00000000-0000-0000-0000-000000000000', // System user
            entity_type: 'workflow',
            entity_id: rule.id,
            action: 'rule_triggered',
            metadata: { rule_name: rule.trigger_type, action: actionType },
          });
        }
      }
    }

    console.log(`Workflow evaluation complete. Created ${executionsCreated} executions.`);

    return new Response(JSON.stringify({ 
      success: true, 
      rules_evaluated: rules?.length || 0,
      workspaces_checked: workspaces?.length || 0,
      executions_created: executionsCreated,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Workflow rules error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
