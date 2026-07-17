// commit-hubspot-history-import
// Admin-only. Imports historical HubSpot activities (notes/calls/meetings/emails)
// into `communication_log`, keyed by (external_source='hubspot', external_id).
// Matching order: external_entity_refs → email exact → domain+name exact.
// Never fuzzy matches. Rollback via bulk_import_batches.id.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface HistoryEntry {
  external_id: string;
  kind: 'note' | 'call' | 'meeting' | 'email';
  direction?: 'inbound' | 'outbound' | null;
  subject?: string | null;
  summary?: string | null;
  body?: string | null;
  original_timestamp: string; // ISO
  contact_email?: string | null;
  contact_domain?: string | null;
  contact_name?: string | null;
  organization_name?: string | null;
}

interface Body {
  entries: HistoryEntry[];
  dry_run?: boolean;
  batch_label?: string;
}

async function matchFunnelItem(sb: any, e: HistoryEntry): Promise<string | null> {
  // 1. External refs
  if (e.external_id) {
    const { data } = await sb
      .from('external_entity_refs')
      .select('entity_id, entity_type')
      .eq('external_source', 'hubspot')
      .eq('external_id', e.external_id)
      .maybeSingle();
    if (data?.entity_type === 'funnel_item' && data.entity_id) return data.entity_id as string;
  }
  // 2. Email exact
  if (e.contact_email) {
    const { data } = await sb
      .from('funnel_items')
      .select('id')
      .ilike('contact_email', e.contact_email)
      .limit(1);
    if (data && data.length === 1) return data[0].id as string;
  }
  // 3. Domain + org name exact
  if (e.contact_domain && e.organization_name) {
    const { data } = await sb
      .from('funnel_items')
      .select('id, contact_email, organization_name')
      .ilike('organization_name', e.organization_name)
      .limit(5);
    const hit = (data ?? []).find((r: any) =>
      typeof r.contact_email === 'string' && r.contact_email.toLowerCase().endsWith('@' + e.contact_domain!.toLowerCase()),
    );
    if (hit) return hit.id as string;
  }
  return null;
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

    const body = await req.json() as Body;
    if (!Array.isArray(body?.entries) || body.entries.length === 0) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });
    }
    if (body.entries.length > 500) {
      return new Response(JSON.stringify({ error: 'batch_too_large', max: 500 }), { status: 400, headers: jsonHeaders });
    }

    const summary = { total: body.entries.length, matched: 0, inserted: 0, skipped_duplicate: 0, unmatched: 0, failed: 0 };
    const sample: any[] = [];
    let batchId: string | null = null;

    if (!body.dry_run) {
      const { data: batch, error: bErr } = await sbSvc
        .from('bulk_import_batches')
        .insert({
          source: 'hubspot_history',
          label: body.batch_label ?? `hubspot_history_${new Date().toISOString()}`,
          created_by: uid,
          status: 'processing',
          total_rows: body.entries.length,
        } as any)
        .select('id')
        .single();
      if (bErr) throw bErr;
      batchId = batch!.id as string;
    }

    for (const e of body.entries) {
      try {
        const funnelId = await matchFunnelItem(sbSvc, e);
        if (!funnelId) { summary.unmatched++; sample.push({ external_id: e.external_id, status: 'unmatched' }); continue; }
        summary.matched++;

        if (body.dry_run) {
          sample.push({ external_id: e.external_id, funnel_item_id: funnelId, status: 'would_insert' });
          continue;
        }

        // Insert; unique index on (external_source, external_id) prevents duplicates.
        const { error: insErr } = await sbSvc.from('communication_log').insert({
          funnel_item_id: funnelId,
          kind: e.kind,
          direction: e.direction ?? null,
          subject: e.subject ?? null,
          summary: e.summary ?? null,
          body: e.body ?? null,
          occurred_at: e.original_timestamp,
          original_timestamp: e.original_timestamp,
          external_source: 'hubspot',
          external_id: e.external_id,
          staff_only: true,
          metadata_json: { batch_id: batchId, provenance: 'hubspot_history' },
        } as any);

        if (insErr) {
          if ((insErr as any).code === '23505') { summary.skipped_duplicate++; continue; }
          throw insErr;
        }
        summary.inserted++;
      } catch (err: any) {
        summary.failed++;
        sample.push({ external_id: e.external_id, error: err?.message ?? String(err) });
      }
    }

    if (batchId) {
      await sbSvc.from('bulk_import_batches').update({
        status: summary.failed > 0 ? 'completed_with_errors' : 'completed',
        processed_rows: summary.inserted + summary.skipped_duplicate,
        error_rows: summary.failed,
        completed_at: new Date().toISOString(),
        summary_json: summary,
      } as any).eq('id', batchId);
    }

    return new Response(JSON.stringify({ success: true, dry_run: !!body.dry_run, batch_id: batchId, summary, sample: sample.slice(0, 50) }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error('commit-hubspot-history-import error', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'internal_error', message: e?.message ?? String(e) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
