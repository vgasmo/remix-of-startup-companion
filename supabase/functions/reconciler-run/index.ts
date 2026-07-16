// reconciler-run — staged-commit protocol
// Admin-only. Two phases:
//   phase='stage'  (or legacy dry_run=true): zero writes to business tables;
//     stages candidates via reconcile_active_customer, seals the batch with a
//     plan_hash, returns per-row plan.
//   phase='commit' (or legacy dry_run=false): requires batch_id +
//     expected_plan_hash + commit_authorized_ids allowlist and BOTH kill-switches
//     enabled (env + system_settings). Applies rows atomically via
//     reconciler_commit_row(row_id, expected_plan_hash).
// Never creates users, memberships, invitations, notifications, or automations.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

type Phase = 'stage' | 'commit';

interface RunBody {
  phase?: Phase;
  dry_run?: boolean; // legacy
  funnel_item_ids?: string[];
  service_program_map?: Record<string, string | null>;
  service_classification_map?: Record<string, 'founder_journey' | 'domiciliacao' | 'mixed' | 'service_only'>;
  commit_authorized_ids?: string[];
  batch_id?: string;
  expected_plan_hash?: string;
  limit?: number;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canonicalStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify((v as Record<string, unknown>)[k])).join(',') + '}';
}

async function computePlanHash(rows: Array<{ id: string; after_snapshot: unknown }>): Promise<string> {
  const parts: string[] = [];
  for (const r of rows.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    const snapHash = await sha256Hex(canonicalStringify(r.after_snapshot));
    parts.push(`${r.id}:${snapHash}`);
  }
  return sha256Hex(parts.join('|'));
}

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

    const body = (await req.json()) as RunBody;
    const phase: Phase = body.phase ?? (body.dry_run === false ? 'commit' : 'stage');

    // ---- Server-side safety controls (fail-closed) ----
    async function control(key: string): Promise<Record<string, unknown>> {
      const { data } = await sbSvc.from('system_settings').select('value').eq('key', key).maybeSingle();
      return ((data as { value?: Record<string, unknown> } | null)?.value ?? {});
    }
    const emergency = await control('reconciler.emergency_stop');
    if ((emergency as { enabled?: boolean }).enabled === true) {
      return new Response(JSON.stringify({ error: 'emergency_stop', message: 'Reconciler emergency stop is engaged.' }),
        { status: 423, headers: jsonHeaders });
    }
    if (phase === 'stage') {
      const dryRun = await control('reconciler.dry_run_enabled');
      if ((dryRun as { enabled?: boolean }).enabled !== true) {
        return new Response(JSON.stringify({ error: 'dry_run_disabled', message: 'reconciler.dry_run_enabled must be true to stage.' }),
          { status: 423, headers: jsonHeaders });
      }
    }

    // Commit-phase kill-switches: env AND legacy write_mode AND new writes_enabled AND allowlist AND canary cap
    const envUnlocked = (Deno.env.get('RECONCILER_WRITE_MODE') ?? '').toLowerCase() === 'enabled';
    let dbUnlocked = false;
    let killSwitchError: string | null = null;
    {
      const { data: setting, error: settingErr } = await sbSvc
        .from('system_settings').select('value').eq('key', 'reconciler.write_mode').maybeSingle();
      if (settingErr) killSwitchError = settingErr.message;
      else dbUnlocked = ((setting?.value ?? {}) as { enabled?: boolean }).enabled === true;
    }
    const writesFlag = await control('reconciler.writes_enabled');
    const writesEnabled = (writesFlag as { enabled?: boolean }).enabled === true;
    const canaryCapRaw = await control('reconciler.canary_max_rows');
    const canaryCap = Number((canaryCapRaw as { value?: unknown }).value ?? 1);
    const allowlistRaw = await control('reconciler.batch_allowlist');
    const allowlist = new Set<string>(((allowlistRaw as { batch_ids?: unknown }).batch_ids as string[] | undefined) ?? []);
    const writesUnlocked = envUnlocked && dbUnlocked && writesEnabled;

    // ===== PHASE: COMMIT =====
    if (phase === 'commit') {
      if (!writesUnlocked || killSwitchError) {
        return new Response(JSON.stringify({
          error: 'writes_frozen',
          message: 'Both RECONCILER_WRITE_MODE env AND system_settings.reconciler.write_mode.enabled must be true.',
          env_unlocked: envUnlocked, db_unlocked: dbUnlocked, kill_switch_error: killSwitchError,
        }), { status: 423, headers: jsonHeaders });
      }
      if (!body.batch_id || !body.expected_plan_hash) {
        return new Response(JSON.stringify({ error: 'invalid_input', message: 'batch_id and expected_plan_hash required' }), { status: 400, headers: jsonHeaders });
      }
      if (allowlist.size > 0 && !allowlist.has(body.batch_id)) {
        return new Response(JSON.stringify({ error: 'batch_not_allowlisted', batch_id: body.batch_id }),
          { status: 423, headers: jsonHeaders });
      }
      const authorized = new Set(body.commit_authorized_ids ?? []);
      if (authorized.size === 0) {
        return new Response(JSON.stringify({ error: 'commit_authorized_ids_required' }), { status: 400, headers: jsonHeaders });
      }
      if (Number.isFinite(canaryCap) && authorized.size > canaryCap) {
        return new Response(JSON.stringify({
          error: 'canary_cap_exceeded', authorized: authorized.size, canary_max_rows: canaryCap,
        }), { status: 423, headers: jsonHeaders });
      }

      // Fetch all dry_run_ok rows in the batch, recompute plan_hash, compare.
      const { data: rows, error: rowsErr } = await sbSvc
        .from('bulk_import_rows')
        .select('id, status, after_snapshot')
        .eq('batch_id', body.batch_id)
        .eq('status', 'dry_run_ok');
      if (rowsErr) throw rowsErr;

      const recomputed = await computePlanHash((rows ?? []).map((r) => ({ id: r.id as string, after_snapshot: r.after_snapshot })));
      const { data: batch, error: batchErr } = await sbSvc
        .from('bulk_import_batches').select('plan_hash').eq('id', body.batch_id).maybeSingle();
      if (batchErr) throw batchErr;
      const sealedHash = (batch as { plan_hash: string | null } | null)?.plan_hash ?? null;

      if (!sealedHash || sealedHash !== body.expected_plan_hash || recomputed !== body.expected_plan_hash) {
        return new Response(JSON.stringify({
          error: 'plan_hash_mismatch', sealed: sealedHash, recomputed, expected: body.expected_plan_hash,
        }), { status: 409, headers: jsonHeaders });
      }

      const results: Array<Record<string, unknown>> = [];
      let committed = 0, skipped = 0, errored = 0;
      // Deterministic idempotency key per (batch, row, plan_hash) so retries replay.
      async function idemKey(rowId: string): Promise<string> {
        const h = await sha256Hex(`${body.batch_id}:${rowId}:${body.expected_plan_hash}`);
        // Format as UUID v4-ish from the hash
        return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
      }
      for (const r of rows ?? []) {
        if (!authorized.has(r.id as string)) { skipped++; results.push({ row_id: r.id, skipped: 'not_authorized' }); continue; }
        const key = await idemKey(r.id as string);
        const { data: outcome, error: rpcErr } = await sbSvc.rpc('reconciler_commit_row', {
          p_row_id: r.id, p_expected_plan_hash: body.expected_plan_hash, p_idempotency_key: key,
        });
        if (rpcErr) { errored++; results.push({ row_id: r.id, error: rpcErr.message }); continue; }
        committed++; results.push({ row_id: r.id, outcome });
      }
      if (errored > 0 && committed > 0) {
        // Partial failure — surface an alert
        await sbSvc.from('system_alerts').insert({
          kind: 'reconciler_partial_failure',
          severity: 'high',
          payload: { batch_id: body.batch_id, committed, errored, skipped },
        });
      }

      return new Response(JSON.stringify({
        phase: 'commit', batch_id: body.batch_id, total_rows: rows?.length ?? 0,
        committed, skipped, errored, results,
      }, null, 2), { headers: jsonHeaders });
    }

    // ===== PHASE: STAGE =====
    let q = sbSvc.from('funnel_items')
      .select('id, phc_customer_id, hubspot_company_id, nif_normalized, organization_name, contact_name, contact_email, linked_startup_id, linked_workspace_id, stage, metadata_json')
      .not('phc_customer_id', 'is', null);
    if (body.funnel_item_ids?.length) q = q.in('id', body.funnel_item_ids);
    if (body.limit) q = q.limit(body.limit);
    const { data: items, error: fetchErr } = await q;
    if (fetchErr) throw fetchErr;

    // Create a batch record for this staging run
    const { data: batchInsert, error: batchInsErr } = await sbSvc
      .from('bulk_import_batches')
      .insert({
        created_by: uid,
        status: 'staged',
        total_files: items?.length ?? 0,
        extracted_count: 0,
        committed_count: 0,
        failed_count: 0,
        mapping_mode: 'reconciler',
        service_program_map: body.service_program_map ?? {},
        package_kind: 'reconciler_active_customer',
        notes: `reconciler-run stage by ${uid}`,
      })
      .select('id').single();
    if (batchInsErr) throw batchInsErr;
    const batchId = (batchInsert as { id: string }).id;

    const results: Array<Record<string, unknown>> = [];
    let staged = 0, conflicts = 0, errors = 0;

    for (const it of items ?? []) {
      const meta = (it.metadata_json ?? {}) as Record<string, unknown>;
      const serviceName =
        (meta.phc_service_hint as string) ?? (meta.phc_service as string) ??
        (meta.service_hint as string) ?? (meta.service_name as string) ?? '';
      const svcClass = body.service_classification_map?.[serviceName];
      const programId = body.service_program_map?.[serviceName] ?? null;

      const rpcInput = {
        funnel_item_id: it.id,
        phc_customer_id: it.phc_customer_id,
        hubspot_company_id: it.hubspot_company_id,
        nif_normalized: it.nif_normalized,
        organization_name: it.organization_name,
        contact_name: it.contact_name,
        contact_email: it.contact_email,
        service_classification: svcClass ?? null,
        program_id: programId,
        service_name: serviceName,
      };

      const { data: staging, error: rpcErr } = await sbSvc.rpc('reconcile_active_customer', {
        p_batch_id: batchId,
        p_input: rpcInput,
        p_service_program_map: {},
        p_idempotency_key: null,
      });
      if (rpcErr) { errors++; results.push({ funnel_item_id: it.id, error: rpcErr.message }); continue; }
      const s = staging as { row_id: string; status: string; after_snapshot: unknown; error?: unknown };
      if (s.status === 'dry_run_ok') staged++;
      else if (s.status === 'conflict') conflicts++;
      results.push({ funnel_item_id: it.id, row_id: s.row_id, status: s.status, service_name: serviceName, after_snapshot: s.after_snapshot, error: s.error });
    }

    // Compute plan hash over dry_run_ok rows, seal batch
    const stageableRows = (results
      .filter((r) => r.status === 'dry_run_ok')
      .map((r) => ({ id: r.row_id as string, after_snapshot: r.after_snapshot }))) as Array<{ id: string; after_snapshot: unknown }>;
    const planHash = await computePlanHash(stageableRows);
    await sbSvc.from('bulk_import_batches')
      .update({ plan_hash: planHash, extracted_count: items?.length ?? 0 })
      .eq('id', batchId);

    return new Response(JSON.stringify({
      phase: 'stage',
      batch_id: batchId,
      plan_hash: planHash,
      total_rows: items?.length ?? 0,
      staged, conflicts, errors,
      results,
    }, null, 2), { headers: jsonHeaders });
  } catch (e) {
    console.error('reconciler-run error', (e as Error).message);
    return new Response(JSON.stringify({ error: 'internal_error', message: (e as Error).message }), { status: 500, headers: jsonHeaders });
  }
});
