// commit-hubspot-import
// Admin-only. Commits approved rows in bounded batches using an atomic RPC.
// Safe to resume. Never overwrites non-empty authoritative fields silently —
// merge semantics live in the RPC. Never creates startups / workspaces /
// contracts automatically; those are separate opt-in flows attached to rows.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface CommitBody {
  job_id: string;
  row_ids?: string[]; // optional subset; when omitted, all 'approved' rows
  batch_size?: number;
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

    // Admin ONLY for commit
    const { data: roles } = await sbSvc.from('user_roles').select('role').eq('user_id', uid);
    const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin');
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = await req.json() as CommitBody;
    if (!body?.job_id) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });

    const { data: job, error: jobErr } = await sbSvc.from('data_import_jobs').select('*').eq('id', body.job_id).single();
    if (jobErr || !job) return new Response(JSON.stringify({ error: 'job_not_found' }), { status: 404, headers: jsonHeaders });

    await sbSvc.from('data_import_jobs').update({ status: 'committing', approved_by: uid }).eq('id', job.id);

    let q = sbSvc.from('data_import_rows').select('*').eq('job_id', job.id).eq('approval_state', 'approved');
    if (body.row_ids?.length) q = q.in('id', body.row_ids);
    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) throw rowsErr;

    const config = job.config_json ?? {};
    const program_id = config.program_id ?? null;

    const summary = { committed: 0, updated: 0, inserted: 0, failed: 0, stale: 0, skipped: 0 };
    const results: any[] = [];
    const batch = Math.min(Math.max(body.batch_size ?? 50, 1), 200);

    for (let i = 0; i < (rows ?? []).length; i += batch) {
      const slice = (rows ?? []).slice(i, i + batch);
      await Promise.all(slice.map(async (row: any) => {
        try {
          const n = row.normalized_json ?? {};
          const toggles = row.approve_toggles_json ?? {};
          if (!toggles.crm) {
            await sbSvc.from('data_import_rows').update({ approval_state: 'committed', commit_result_json: { action: 'skip', reason: 'crm_toggle_off' } }).eq('id', row.id);
            summary.skipped++; return;
          }

          // finalStage: normalized_json.resolved_stage OR config.default_stage
          const finalStage = n.resolved_stage ?? config.default_stage ?? 'new';
          const tags: string[] = ['hubspot_import'];
          if (n.sector) tags.push(`sector:${n.sector}`);

          const payload = {
            organization_name: n.organization_name,
            contact_name: n.contact_name,
            contact_email: n.contact_email,
            phone: n.phone,
            program_id,
            owner_consultant_id: null, // resolved externally; unresolved stays for review
            notes: null,
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
            type: 'startup',
          };

          const external_ids: Record<string, string | null> = {};
          if (n.deal_id) external_ids['deal'] = n.deal_id;
          if (n.company_id) external_ids['company'] = n.company_id;
          if (n.contact_id) external_ids['contact'] = n.contact_id;

          const { data: rpcRes, error: rpcErr } = await sbSvc.rpc('commit_import_funnel_item', {
            p_job_id: row.job_id,
            p_row_id: row.id,
            p_match_entity_id: row.match_entity_id,
            p_expected_updated_at: row.match_snapshot_updated_at,
            p_payload: payload,
            p_external_ids: external_ids,
            p_final_stage: finalStage,
            p_tags: tags,
          });

          if (rpcErr) {
            const code = (rpcErr as any).code;
            if (code === 'P0003') {
              await sbSvc.from('data_import_rows').update({ approval_state: 'stale', commit_result_json: { error: 'stale_match' } }).eq('id', row.id);
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
      status: summary.failed > 0 ? 'committed' : 'committed', // keep single status; failures visible per row
      committed_at: new Date().toISOString(),
      counts_json: { ...(job.counts_json ?? {}), commit: summary },
    }).eq('id', job.id);

    return new Response(JSON.stringify({ success: true, summary, sample: results.slice(0, 20) }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error('commit-hubspot-import error', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'internal_error', message: e?.message ?? String(e) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
