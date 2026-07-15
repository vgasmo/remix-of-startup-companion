// reconciler-run
// Admin-only. Reconciles PHC-tagged funnel_items into startups + workspaces
// via the atomic public.reconcile_active_customer RPC.
// - dry_run=true  : zero writes, returns planned action per row.
// - dry_run=false : requires commit_authorized_ids allowlist. Writes atomically.
// Never creates users, memberships, invitations, notifications, or automations.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface RunBody {
  funnel_item_ids?: string[];         // explicit subset
  service_program_map?: Record<string, string | null>; // service_name -> program uuid
  service_classification_map?: Record<string, 'founder_journey' | 'domiciliacao' | 'mixed' | 'service_only'>;
  dry_run: boolean;
  commit_authorized_ids?: string[];   // required when dry_run=false
  limit?: number;
}

// Phase 1: NO hardcoded default service classification. Operators must supply
// `service_classification_map` for every distinct service_name observed;
// unmapped services are reported as conflicts and skipped.


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const sbSvc = createClient(url, svc);

    const { data: userData } = await sbUser.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const { data: roles } = await sbSvc.from('user_roles').select('role').eq('user_id', uid);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'admin');
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = await req.json() as RunBody;
    if (typeof body?.dry_run !== 'boolean') {
      return new Response(JSON.stringify({ error: 'invalid_input', message: 'dry_run required' }), { status: 400, headers: jsonHeaders });
    }
    const dryRun = body.dry_run;
    const authorized = new Set(body.commit_authorized_ids ?? []);

    // PHASE 0 FREEZE: writes require BOTH the env kill-switch AND the DB kill-switch.
    // Either off ⇒ 423 read-only. This eliminates the dual-source-of-truth risk noted
    // in the audit (P0-1 / P0-2).
    const writeModeEnv = (Deno.env.get('RECONCILER_WRITE_MODE') ?? '').toLowerCase();
    const envUnlocked = writeModeEnv === 'enabled';

    let dbUnlocked = false;
    let killSwitchError: string | null = null;
    {
      const { data: setting, error: settingErr } = await sbSvc
        .from('system_settings')
        .select('value')
        .eq('key', 'reconciler.write_mode')
        .maybeSingle();
      if (settingErr) {
        killSwitchError = settingErr.message;
      } else {
        const v = (setting?.value ?? {}) as { enabled?: boolean };
        dbUnlocked = v.enabled === true;
      }
    }
    const writesUnlocked = envUnlocked && dbUnlocked;
    if (!dryRun && (!writesUnlocked || killSwitchError)) {
      return new Response(
        JSON.stringify({
          error: 'writes_frozen',
          message: 'Reconciler is in read-only mode. Both RECONCILER_WRITE_MODE env AND system_settings.reconciler.write_mode.enabled must be true to authorize commits.',
          env_unlocked: envUnlocked,
          db_unlocked: dbUnlocked,
          kill_switch_error: killSwitchError,
        }),
        { status: 423, headers: jsonHeaders },
      );
    }
    if (!dryRun && authorized.size === 0) {
      return new Response(JSON.stringify({ error: 'commit_authorized_ids_required' }), { status: 400, headers: jsonHeaders });
    }

    // Fetch candidate funnel_items. Note: startups has NO hubspot_company_id column;
    // HubSpot associations are represented via funnel_items + external_entity_refs.
    let q = sbSvc.from('funnel_items')
      .select('id, phc_customer_id, hubspot_company_id, nif_normalized, organization_name, contact_name, contact_email, linked_startup_id, linked_workspace_id, stage, metadata_json')
      .not('phc_customer_id', 'is', null);

    if (body.funnel_item_ids?.length) q = q.in('id', body.funnel_item_ids);
    if (body.limit) q = q.limit(body.limit);

    const { data: items, error: fetchErr } = await q;
    if (fetchErr) throw fetchErr;

    const results: Array<Record<string, unknown>> = [];
    let planned_writes = 0;
    let noop = 0;
    let errors = 0;
    let conflicts = 0;

    for (const it of (items ?? [])) {
      // Correct path per plan: metadata_json.phc_service_hint takes precedence.
      const meta = (it.metadata_json ?? {}) as Record<string, unknown>;
      const serviceName =
        (meta.phc_service_hint as string) ??
        (meta.phc_service as string) ??
        (meta.service_hint as string) ??
        (meta.service_name as string) ??
        '';

      // Strict: unmapped service → conflict, no default.
      const svcClass = body.service_classification_map?.[serviceName];
      if (!svcClass || !['founder_journey', 'domiciliacao', 'mixed'].includes(svcClass)) {
        conflicts++;
        results.push({
          funnel_item_id: it.id,
          service_name: serviceName,
          status: 'conflict',
          reason: 'unmapped_service_classification',
        });
        continue;
      }

      const programId = body.service_program_map?.[serviceName] ?? null;

      // Programme required for founder_journey and mixed
      if ((svcClass === 'founder_journey' || svcClass === 'mixed') && !programId) {
        conflicts++;
        results.push({
          funnel_item_id: it.id,
          service_name: serviceName,
          status: 'conflict',
          reason: 'programme_id_required_for_' + svcClass,
        });
        continue;
      }

      const idempotencyKey = `reconciler-${it.phc_customer_id}-${svcClass}-${programId ?? 'none'}`;

      const willWrite = !dryRun && authorized.has(it.id);

      const payload = {
        funnel_item_id: it.id,
        phc_customer_id: it.phc_customer_id,
        hubspot_company_id: it.hubspot_company_id,
        nif_normalized: it.nif_normalized,
        organization_name: it.organization_name,
        contact_name: it.contact_name,
        contact_email: it.contact_email,
        service_classification: svcClass,
        program_id: programId,
        service_name: serviceName,
      };

      if (!dryRun && !willWrite) {
        results.push({ funnel_item_id: it.id, skipped: 'not_authorized' });
        continue;
      }

      try {
        const { data: rpcRes, error: rpcErr } = await sbSvc.rpc('reconcile_active_customer', {
          p_row: payload,
          p_idempotency_key: idempotencyKey,
          p_dry_run: dryRun || !willWrite,
        });
        if (rpcErr) throw rpcErr;
        const action = (rpcRes as { action?: string })?.action ?? 'unknown';
        if (action === 'noop' || action === 'already_current') noop++;
        else planned_writes++;
        results.push({ funnel_item_id: it.id, service_name: serviceName, result: rpcRes });
      } catch (e) {
        const msg = (e as Error).message;
        // Ambiguity / policy violations from RPC are conflicts, not internal errors.
        if (/^ambiguous_|_required$/.test(msg)) {
          conflicts++;
          results.push({ funnel_item_id: it.id, service_name: serviceName, status: 'conflict', reason: msg });
        } else {
          errors++;
          results.push({ funnel_item_id: it.id, error: msg });
        }
      }
    }

    return new Response(JSON.stringify({
      dry_run: dryRun,
      total_rows: items?.length ?? 0,
      planned_writes,
      noop,
      conflicts,
      errors,
      results,
    }, null, 2), { headers: jsonHeaders });
  } catch (e) {
    console.error('reconciler-run error', (e as Error).message);
    return new Response(JSON.stringify({ error: 'internal_error', message: (e as Error).message }), { status: 500, headers: jsonHeaders });
  }
});
