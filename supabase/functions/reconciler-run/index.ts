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

const DEFAULT_SERVICE_CLASS: Record<string, string> = {
  'Incubação Física': 'founder_journey',
  'Incubação Virtual': 'founder_journey',
  'Incubação de Ideias': 'founder_journey',
  'Incubação Visa': 'founder_journey',
  'Domiciliação': 'domiciliacao',
};

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
    if (!dryRun && authorized.size === 0) {
      return new Response(JSON.stringify({ error: 'commit_authorized_ids_required' }), { status: 400, headers: jsonHeaders });
    }

    // Fetch candidate funnel_items
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

    for (const it of (items ?? [])) {
      const serviceName = (it.metadata_json?.phc_service as string) ?? (it.metadata_json?.service_hint as string) ?? (it.metadata_json?.service_name as string) ?? '';
      const svcClass = body.service_classification_map?.[serviceName]
        ?? (DEFAULT_SERVICE_CLASS[serviceName] as 'founder_journey' | 'domiciliacao' | 'service_only' | undefined)
        ?? 'founder_journey';
      // service_only rows still map to a workspace row for tracking; use domiciliacao class if unmapped
      const effectiveClass = svcClass === 'service_only' ? 'domiciliacao' : svcClass;

      const programId = body.service_program_map?.[serviceName] ?? null;
      const idempotencyKey = `reconciler-${it.phc_customer_id}-${effectiveClass}`;

      const willWrite = !dryRun && authorized.has(it.id);

      const payload = {
        funnel_item_id: it.id,
        phc_customer_id: it.phc_customer_id,
        hubspot_company_id: it.hubspot_company_id,
        nif_normalized: it.nif_normalized,
        organization_name: it.organization_name,
        contact_name: it.contact_name,
        contact_email: it.contact_email,
        service_classification: effectiveClass,
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
        if (action === 'noop') noop++;
        else planned_writes++;
        results.push({ funnel_item_id: it.id, service_name: serviceName, result: rpcRes });
      } catch (e) {
        errors++;
        results.push({ funnel_item_id: it.id, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({
      dry_run: dryRun,
      total_rows: items?.length ?? 0,
      planned_writes,
      noop,
      errors,
      results,
    }, null, 2), { headers: jsonHeaders });
  } catch (e) {
    console.error('reconciler-run error', (e as Error).message);
    return new Response(JSON.stringify({ error: 'internal_error', message: (e as Error).message }), { status: 500, headers: jsonHeaders });
  }
});
