// commit-crm-import
// Source-agnostic CRM commit endpoint. Handles both `phc` and `hubspot` jobs
// via `commit_import_funnel_item_v2`. Admin-only. Strict `crm_only` guard —
// rejects the job if config declares any non-CRM side-effect toggle.
//
// Never creates workspaces, contracts, users, invitations, notifications, or
// automations. Only writes to `funnel_items`, `external_entity_refs`, and
// `data_import_rows`/`data_import_jobs` bookkeeping columns.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface CommitBody {
  job_id: string;
  row_ids?: string[];
  batch_size?: number;
}

const FORBIDDEN_TOGGLES = [
  'create_startups',
  'create_workspaces',
  'create_contract_proposals',
  'create_users',
  'create_invitations',
  'create_notifications',
  'run_automations',
];

function buildPhcPayload(row: any, config: any): { payload: any; external_ids: Record<string, string>; final_stage: string; tags: string[] } {
  const n = row.normalized_json ?? {};
  const tags: string[] = ['phc_import'];
  if (n.phc_department) tags.push(`phc_department:${n.phc_department}`);
  if (n.phc_building_hint) tags.push(`phc_building:${n.phc_building_hint}`);

  const payload = {
    organization_name: n.organization_name,
    contact_name: n.contact_name,
    contact_email: n.contact_email ?? n.organization_email,
    contact_phone: n.organization_phone,
    program_id: config.program_id ?? null,
    type: 'startup',
    phc_customer_id: n.phc_customer_id,
    nif_normalized: n.nif_normalized,
    source_updated_at: null,
    metadata_json: {
      phc_customer_id: n.phc_customer_id,
      organization_short_name: n.organization_short_name,
      nif_raw: n.nif_raw,
      nif_kind: n.nif_kind,
      country: n.country,
      phc_department: n.phc_department,
      phc_service_hint: n.phc_service_hint,
      phc_building_hint: n.phc_building_hint,
      phc_price_list_id: n.phc_price_list_id,
      organization_email: n.organization_email,
      contact_secondary_name: n.contact_secondary_name,
      contact_secondary_email: n.contact_secondary_email,
      provenance: 'phc_import',
      job_id: row.job_id,
      row_id: row.id,
    },
  };

  const external_ids: Record<string, string> = {};
  if (n.phc_customer_id) external_ids['phc/customer'] = n.phc_customer_id;

  const final_stage = config.default_stage ?? 'customer';
  return { payload, external_ids, final_stage, tags };
}

function buildHubspotPayload(row: any, config: any): { payload: any; external_ids: Record<string, string>; final_stage: string; tags: string[] } {
  const n = row.normalized_json ?? {};
  const tags: string[] = ['hubspot_import'];
  if (n.sector) tags.push(`sector:${n.sector}`);

  const payload = {
    organization_name: n.organization_name,
    contact_name: n.contact_name,
    contact_email: n.contact_email,
    contact_phone: n.phone,
    program_id: config.program_id ?? null,
    type: 'startup',
    hubspot_deal_id: n.deal_id,
    hubspot_company_id: n.company_id,
    nif_normalized: n.nif ?? null,
    source_updated_at: null,
    metadata_json: {
      hubspot_deal_id: n.deal_id,
      hubspot_company_id: n.company_id,
      hubspot_contact_id: n.contact_id,
      hubspot_owner_id: n.owner_id,
      nif: n.nif,
      sector: n.sector,
      building_hint: n.building,
      service_hint: n.service,
      activity_description: n.activity_description,
      provenance: 'hubspot_import',
      job_id: row.job_id,
      row_id: row.id,
    },
  };

  const external_ids: Record<string, string> = {};
  if (n.deal_id) external_ids['hubspot/deal'] = n.deal_id;
  if (n.company_id) external_ids['hubspot/company'] = n.company_id;
  if (n.contact_id) external_ids['hubspot/contact'] = n.contact_id;

  const final_stage = n.resolved_stage ?? config.default_stage ?? 'new';
  return { payload, external_ids, final_stage, tags };
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
    const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin');
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = await req.json() as CommitBody;
    if (!body?.job_id) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });

    const { data: job, error: jobErr } = await sbSvc.from('data_import_jobs').select('*').eq('id', body.job_id).single();
    if (jobErr || !job) return new Response(JSON.stringify({ error: 'job_not_found' }), { status: 404, headers: jsonHeaders });

    const source: string = job.source;
    if (source !== 'phc' && source !== 'hubspot') {
      return new Response(JSON.stringify({ error: 'unsupported_source', source }), { status: 400, headers: jsonHeaders });
    }

    const config = job.config_json ?? {};

    // Strict CRM-only guard: any forbidden toggle set truthy → refuse.
    for (const key of FORBIDDEN_TOGGLES) {
      if (config[key]) {
        return new Response(JSON.stringify({ error: 'non_crm_side_effect_declared', toggle: key }), { status: 400, headers: jsonHeaders });
      }
    }

    await sbSvc.from('data_import_jobs').update({ status: 'committing', approved_by: uid }).eq('id', job.id);

    let q = sbSvc.from('data_import_rows').select('*').eq('job_id', job.id).eq('approval_state', 'approved');
    if (body.row_ids?.length) q = q.in('id', body.row_ids);
    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) throw rowsErr;

    const summary = { committed: 0, updated: 0, inserted: 0, failed: 0, stale: 0, skipped: 0 };
    const results: any[] = [];
    const batch = Math.min(Math.max(body.batch_size ?? 50, 1), 200);

    for (let i = 0; i < (rows ?? []).length; i += batch) {
      const slice = (rows ?? []).slice(i, i + batch);
      await Promise.all(slice.map(async (row: any) => {
        try {
          const toggles = row.approve_toggles_json ?? {};
          // Side-effect toggles must all be false at row-level too.
          if (toggles.workspace || toggles.startup || toggles.contract_proposal) {
            await sbSvc.from('data_import_rows').update({
              approval_state: 'failed',
              commit_result_json: { error: 'row_declares_side_effect', toggles },
            }).eq('id', row.id);
            summary.failed++; return;
          }
          if (!toggles.crm) {
            await sbSvc.from('data_import_rows').update({
              approval_state: 'committed',
              commit_result_json: { action: 'skip', reason: 'crm_toggle_off' },
            }).eq('id', row.id);
            summary.skipped++; return;
          }

          const built = source === 'phc' ? buildPhcPayload(row, config) : buildHubspotPayload(row, config);
          const verified_fields = row.verified_fields_json ?? {};

          const { data: rpcRes, error: rpcErr } = await sbSvc.rpc('commit_import_funnel_item_v2', {
            p_job_id: row.job_id,
            p_row_id: row.id,
            p_match_entity_id: row.match_entity_id,
            p_expected_updated_at: row.match_snapshot_updated_at,
            p_source: source,
            p_payload: built.payload,
            p_external_ids: built.external_ids,
            p_verified_fields: verified_fields,
            p_final_stage: built.final_stage,
            p_tags: built.tags,
          });

          if (rpcErr) {
            const code = (rpcErr as any).code;
            if (code === 'P0003') {
              await sbSvc.from('data_import_rows').update({
                approval_state: 'stale',
                commit_result_json: { error: 'stale_match' },
              }).eq('id', row.id);
              summary.stale++; return;
            }
            throw rpcErr;
          }

          const commitResult = rpcRes as any;
          await sbSvc.from('data_import_rows').update({
            approval_state: 'committed',
            commit_result_json: commitResult,
          }).eq('id', row.id);
          summary.committed++;
          if (commitResult?.action === 'update') summary.updated++;
          else if (commitResult?.action === 'insert') summary.inserted++;
          results.push({ row_id: row.id, ...commitResult });
        } catch (e: any) {
          await sbSvc.from('data_import_rows').update({
            approval_state: 'failed',
            commit_result_json: { error: e?.message ?? String(e), code: (e as any)?.code },
          }).eq('id', row.id);
          summary.failed++;
        }
      }));
    }

    await sbSvc.from('data_import_jobs').update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      counts_json: { ...(job.counts_json ?? {}), commit: summary },
    }).eq('id', job.id);

    return new Response(JSON.stringify({ success: true, source, summary, sample: results.slice(0, 20) }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error('commit-crm-import error', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'internal_error', message: e?.message ?? String(e) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
