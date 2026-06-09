/**
 * Product analytics helper — GDPR-respecting, own-your-data.
 *
 * Fire-and-forget inserts into `analytics_events`. Never blocks UI, never
 * throws, never recurses. Use the typed `track()` helper rather than calling
 * supabase directly so the event taxonomy stays disciplined.
 *
 * Whitelisted events (Tier-0 high-signal only — do NOT over-instrument):
 *   login, claim_started, claim_completed, kpi_submitted,
 *   session_scheduled, contract_sent_for_signature, intake_submitted,
 *   mentor_session_logged
 */

import { supabase } from '@/lib/supabaseClient';

export type AnalyticsEvent =
  | 'login'
  | 'claim_started'
  | 'claim_completed'
  | 'kpi_submitted'
  | 'session_scheduled'
  | 'contract_sent_for_signature'
  | 'intake_submitted'
  | 'mentor_session_logged'
  // Founder help-nudge surface
  | 'founder_help_nudge_shown'
  | 'founder_help_nudge_ask_ai'
  | 'founder_help_nudge_search'
  | 'founder_help_nudge_book_session'
  | 'founder_help_nudge_dismissed';

export interface TrackOptions {
  workspaceId?: string;
  /** Optional explicit role; otherwise derived from user_roles. */
  role?: string;
  /** Free-form properties (kept small, no PII). */
  properties?: Record<string, unknown>;
}

let inFlight = 0;
const MAX_IN_FLIGHT = 8;

// Role cache so we don't hit user_roles on every event.
let cachedRole: { userId: string; role: string | null } | null = null;

async function resolveRole(userId: string): Promise<string | null> {
  if (cachedRole && cachedRole.userId === userId) return cachedRole.role;
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    const role = (data?.role as string | undefined) ?? null;
    cachedRole = { userId, role };
    return role;
  } catch {
    return null;
  }
}

export async function track(event: AnalyticsEvent, opts: TrackOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  if (inFlight >= MAX_IN_FLIGHT) return;
  inFlight++;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;
    const role = opts.role ?? (userId ? await resolveRole(userId) : null);
    const row = {
      event_name: event,
      role: role ?? undefined,
      user_id: userId ?? undefined,
      workspace_id: opts.workspaceId ?? undefined,
      properties: (opts.properties ?? {}) as Record<string, unknown>,
    };
    await supabase.from('analytics_events').insert([row as never]);
  } catch {
    // Swallow — analytics must never surface errors.
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
}
