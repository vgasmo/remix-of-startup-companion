// Canonical tool usage instrumentation.
// Writes to public.tool_usage_events with a fixed taxonomy so impact
// reporting is bounded and auditable. Never trust free-form event names.

import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

// Canonical tool event names. Adding a new value here is deliberate — it is
// the surface `get_impact_aggregates` and the Adoption tab report on.
export const TOOL_EVENTS = {
  PLAYBOOK_STEP_COMPLETED: 'playbook_step_completed',
  TEMPLATE_GENERATED: 'template_generated',
  CHECKIN_SUBMITTED: 'checkin_submitted',
  KPI_UPDATED: 'kpi_updated',
  MILESTONE_COMPLETED: 'milestone_completed',
  ACTION_COMPLETED: 'action_completed',
  DOCUMENT_UPLOADED: 'document_uploaded',
  SESSION_COMPLETED: 'session_completed',
  SESSION_AI_SUMMARY: 'session_ai_summary',
  MENTOR_BOOKING_CREATED: 'mentor_booking_created',
  FINANCIAL_PLAN_UPDATED: 'financial_plan_updated',
  RITUAL_COMPLETED: 'ritual_completed',
} as const;

export type ToolEvent = typeof TOOL_EVENTS[keyof typeof TOOL_EVENTS];

interface LogArgs {
  workspaceId?: string | null;
  sessionId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget. Failures are logged but never bubble — instrumentation
// must not disrupt the user-facing action.
export async function logToolUsage(tool: ToolEvent, args: LogArgs = {}): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { error } = await supabase.from('tool_usage_events').insert({
      tool,
      user_id: userId,
      workspace_id: args.workspaceId ?? null,
      session_id: args.sessionId ?? null,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      metadata: args.metadata ?? {},
    });
    if (error) logger.warn('tool_usage_insert_failed', { tool, error: error.message });
  } catch (e) {
    logger.warn('tool_usage_exception', { tool, error: (e as Error).message });
  }
}
