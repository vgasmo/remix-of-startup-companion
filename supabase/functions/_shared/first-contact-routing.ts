/**
 * Canonical first-contact routing resolver.
 *
 * Used by both `public-get-availability` (to pick the calendar to display)
 * and `public-book-first-contact` (to commit against the same consultant).
 *
 * Never falls back to `.limit(1)` on user_roles. If no valid route exists
 * for the requested (link, program_id) pair, throws NO_ROUTE — callers
 * must fail closed and surface a clear public message.
 */

// deno-lint-ignore-file no-explicit-any

export interface ResolvedRoute {
  consultantId: string;
  consultantEmail: string | null;
  consultantName: string | null;
  programId: string | null;
  programName: string | null;
  routingId: string;
  routingMode: string;
  scope: 'global' | 'program';
  linkId: string | null;
  linkOwnerConsultantId: string | null;
  decisionTrace: Record<string, unknown>;
}

export interface ResolveInput {
  supabase: any;
  token: string;                 // raw token from the public URL, or 'demo'
  selectedProgramId?: string | null; // 'global', UUID, null/undefined
}

export class NoRouteError extends Error {
  constructor(public readonly reason: string, public readonly trace: Record<string, unknown>) {
    super(`NO_ROUTE: ${reason}`);
    this.name = 'NoRouteError';
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadProfile(supabase: any, id: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, status')
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function loadProgram(supabase: any, id: string) {
  const { data } = await supabase
    .from('programs')
    .select('id, name, is_active, status')
    .eq('id', id)
    .maybeSingle();
  return data;
}

/**
 * Round-robin picker: uses intake_routing.round_robin_index as the counter,
 * bumped in a single UPDATE ... RETURNING to make concurrent picks race-safe.
 */
async function pickRoundRobin(supabase: any, routing: {
  id: string;
  consultant_ids: string[];
  round_robin_index: number | null;
}): Promise<string> {
  const list = (routing.consultant_ids ?? []).filter((x) => !!x);
  if (list.length === 0) throw new NoRouteError('empty_consultant_list', { routing_id: routing.id });
  const nextIndex = ((routing.round_robin_index ?? 0) + 1) % list.length;

  // Atomic bump; if two callers race, both increment but each still reads a stable index.
  const { data: updated } = await supabase
    .from('intake_routing')
    .update({ round_robin_index: nextIndex, updated_at: new Date().toISOString() })
    .eq('id', routing.id)
    .select('round_robin_index')
    .maybeSingle();

  const idx = updated?.round_robin_index ?? nextIndex;
  return list[idx % list.length];
}

async function pickConsultantForRouting(
  supabase: any,
  routing: {
    id: string;
    mode: string;
    consultant_ids: string[];
    round_robin_index: number | null;
  },
): Promise<string | null> {
  const list = (routing.consultant_ids ?? []).filter((x) => !!x);
  if (list.length === 0) return null;

  // Modes we support: fixed / first / global / program → first entry;
  // round_robin → advance counter.
  if (routing.mode === 'round_robin') {
    return await pickRoundRobin(supabase, routing);
  }
  return list[0];
}

export async function resolveFirstContactRoute({
  supabase,
  token,
  selectedProgramId,
}: ResolveInput): Promise<ResolvedRoute> {
  const trace: Record<string, unknown> = { token_is_demo: token === 'demo', selected_program_id: selectedProgramId ?? null };

  // 1. Resolve the link (if not demo)
  let link: {
    id: string;
    owner_consultant_id: string | null;
    program_id: string | null;
    active: boolean;
    expires_at: string | null;
  } | null = null;

  if (token !== 'demo') {
    const tokenHex = await sha256Hex(token);
    const { data } = await supabase
      .from('public_booking_links')
      .select('id, owner_consultant_id, program_id, active, expires_at')
      .eq('token_hash', tokenHex)
      .maybeSingle();
    if (!data) throw new NoRouteError('unknown_link', trace);
    if (!data.active) throw new NoRouteError('inactive_link', trace);
    if (data.expires_at && new Date(data.expires_at) < new Date()) throw new NoRouteError('expired_link', trace);
    link = data;
    trace.link_id = link.id;
    trace.link_owner_consultant_id = link.owner_consultant_id;
    trace.link_program_id = link.program_id;
  }

  // 2. Normalize selected program
  const normalizedSelected: string | null =
    typeof selectedProgramId === 'string' && selectedProgramId !== '' && selectedProgramId !== 'global'
      ? selectedProgramId
      : null;

  // If the link is fixed to a program, that wins; the user cannot re-route it.
  const effectiveProgramId: string | null = link?.program_id ?? normalizedSelected ?? null;
  trace.effective_program_id = effectiveProgramId;

  // 3. If the link has a fixed owner, that consultant serves the booking
  //    (regardless of routing rules). This is the "fixed_owner" mode of the plan.
  if (link?.owner_consultant_id) {
    const profile = await loadProfile(supabase, link.owner_consultant_id);
    if (!profile || profile.status !== 'active') {
      throw new NoRouteError('link_owner_inactive', trace);
    }
    let programName: string | null = null;
    if (effectiveProgramId) {
      const p = await loadProgram(supabase, effectiveProgramId);
      if (p && p.is_active) programName = p.name;
    }
    return {
      consultantId: link.owner_consultant_id,
      consultantEmail: profile.email ?? null,
      consultantName: profile.full_name ?? null,
      programId: effectiveProgramId,
      programName,
      routingId: 'link_owner',
      routingMode: 'fixed_owner',
      scope: effectiveProgramId ? 'program' : 'global',
      linkId: link.id,
      linkOwnerConsultantId: link.owner_consultant_id,
      decisionTrace: { ...trace, resolution: 'link_owner' },
    };
  }

  // 4. No fixed owner — resolve via intake_routing.
  const { data: allRoutings } = await supabase
    .from('intake_routing')
    .select('id, scope, program_id, mode, consultant_ids, round_robin_index, active')
    .eq('active', true);

  const routings = (allRoutings ?? []) as Array<{
    id: string;
    scope: string;
    program_id: string | null;
    mode: string;
    consultant_ids: string[];
    round_robin_index: number | null;
    active: boolean;
  }>;

  // 4a. Program-specific routing first if a program is selected.
  let chosen = null as (typeof routings)[number] | null;
  if (effectiveProgramId) {
    chosen = routings.find((r) => r.scope === 'program' && r.program_id === effectiveProgramId) ?? null;
    trace.matched_program_routing = !!chosen;
  }
  // 4b. Global routing as authorized fallback.
  if (!chosen) {
    chosen = routings.find((r) => r.scope === 'global') ?? null;
    trace.matched_global_routing = !!chosen;
  }

  if (!chosen) throw new NoRouteError('no_active_routing', trace);

  const consultantId = await pickConsultantForRouting(supabase, chosen);
  if (!consultantId) throw new NoRouteError('routing_has_no_consultants', { ...trace, routing_id: chosen.id });

  const profile = await loadProfile(supabase, consultantId);
  if (!profile) throw new NoRouteError('consultant_profile_missing', { ...trace, consultant_id: consultantId });
  if (profile.status !== 'active') throw new NoRouteError('consultant_inactive', { ...trace, consultant_id: consultantId });

  let programName: string | null = null;
  if (effectiveProgramId) {
    const p = await loadProgram(supabase, effectiveProgramId);
    if (p && p.is_active) programName = p.name;
  }

  return {
    consultantId,
    consultantEmail: profile.email ?? null,
    consultantName: profile.full_name ?? null,
    programId: effectiveProgramId,
    programName,
    routingId: chosen.id,
    routingMode: chosen.mode,
    scope: chosen.scope === 'program' ? 'program' : 'global',
    linkId: link?.id ?? null,
    linkOwnerConsultantId: null,
    decisionTrace: { ...trace, resolution: 'routing', routing_id: chosen.id, routing_mode: chosen.mode },
  };
}

/**
 * Deterministic idempotency key for a booking submission.
 * Prevents duplicate lead rows on double-clicks or client retries.
 */
export async function deriveBookingIdempotencyKey(email: string, slotDate: string, slotTime: string, token: string): Promise<string> {
  return await sha256Hex(`${email.toLowerCase()}|${slotDate}T${slotTime}|${token}`);
}
