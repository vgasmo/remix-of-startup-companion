/**
 * Run Ecosystem Snapshot
 * 
 * Cron: daily at 03:00 UTC
 * Auth: x-cron-secret OR governance role (admin via requireCronOrGovernance) for manual triggers
 * 
 * Creates a periodic snapshot/export of critical ecosystem domains to
 * the private 'ecosystem-backups' storage bucket. Tracks metadata in
 * the ecosystem_snapshots table for auditability and admin visibility.
 * 
 * This is a product-level backup strategy, complementary to infrastructure PITR.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronOrGovernance, createLogger, generateRequestId } from '../_shared/security.ts';

const FUNCTION_NAME = 'run-ecosystem-snapshot';

// Domains to include in the snapshot — uses safe views where available to mask PII
const SNAPSHOT_DOMAINS: { name: string; table: string; safe?: boolean }[] = [
  { name: 'startups', table: 'startups' },
  { name: 'workspaces', table: 'workspaces' },
  { name: 'workspace_users', table: 'workspace_users' },
  // profiles_export is a service-role only view that bypasses profiles_safe's
  // auth.uid() filter (which returned zero rows for the service client and
  // caused silent-empty snapshots).
  { name: 'profiles', table: 'profiles_export', safe: true },
  { name: 'mentor_connections', table: 'mentor_connections' },
  { name: 'funnel_items', table: 'funnel_items' },
  { name: 'contract_intakes', table: 'contract_intakes' },
  { name: 'startup_contracts', table: 'startup_contracts_safe', safe: true },
  { name: 'contract_lifecycle_events', table: 'contract_lifecycle_events' },
  { name: 'programs', table: 'programs' },
];

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  });

  // Auth
  const authResult = await requireCronOrGovernance(req, supabaseUser, supabaseAdmin);
  if ('error' in authResult) {
    log.warn('Unauthorized access attempt');
    return authResult.error;
  }

  const initiatedBy = authResult.userId || null;
  const isScheduled = !authResult.userId;

  // Create snapshot record
  const { data: snapshot, error: insertError } = await supabaseAdmin
    .from('ecosystem_snapshots')
    .insert({
      snapshot_type: 'full',
      status: 'running',
      initiated_by: initiatedBy,
      is_scheduled: isScheduled,
    })
    .select('id')
    .single();

  if (insertError || !snapshot) {
    log.error('Failed to create snapshot record', insertError);
    return corsJsonResponse({ error: 'Failed to start snapshot' }, req, 500);
  }

  const snapshotId = snapshot.id;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const storagePath = `snapshots/${timestamp}`;

  log.info(`Starting ecosystem snapshot ${snapshotId}`, { storagePath, initiatedBy });

  try {
    const recordCounts: Record<string, number> = {};
    const allChecksums: string[] = [];

    for (const domain of SNAPSHOT_DOMAINS) {
      log.info(`Exporting domain: ${domain.name}`);

      // Paginate through all records (handle >1000 row limit)
      let allRows: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabaseAdmin
          .from(domain.table)
          .select('*')
          .range(from, to);

        if (error) {
          throw new Error(`Failed to query ${domain.table}: ${error.message}`);
        }

        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      recordCounts[domain.name] = allRows.length;

      // Serialize to JSON
      const jsonContent = JSON.stringify(allRows, null, 0); // compact for storage
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(jsonContent);

      // Compute checksum for this domain
      const hashBuffer = await crypto.subtle.digest('SHA-256', contentBytes);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      allChecksums.push(hashHex);

      // Upload to storage
      const filePath = `${storagePath}/${domain.name}.json`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('ecosystem-backups')
        .upload(filePath, contentBytes, {
          contentType: 'application/json',
          upsert: false, // No overwrite — new path each run
        });

      if (uploadError) {
        throw new Error(`Failed to upload ${domain.name}: ${uploadError.message}`);
      }

      log.info(`Exported ${domain.name}: ${allRows.length} records`);
    }

    // Compute aggregate checksum
    const aggregateInput = allChecksums.join(':');
    const aggHashBuffer = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(aggregateInput)
    );
    const aggregateChecksum = Array.from(new Uint8Array(aggHashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Upload manifest
    const manifest = {
      snapshot_id: snapshotId,
      timestamp,
      domains: SNAPSHOT_DOMAINS.map(d => d.name),
      record_counts: recordCounts,
      domain_checksums: Object.fromEntries(
        SNAPSHOT_DOMAINS.map((d, i) => [d.name, allChecksums[i]])
      ),
      aggregate_checksum: aggregateChecksum,
    };

    await supabaseAdmin.storage
      .from('ecosystem-backups')
      .upload(`${storagePath}/manifest.json`, new TextEncoder().encode(JSON.stringify(manifest, null, 2)), {
        contentType: 'application/json',
        upsert: false,
      });

    // Update snapshot record: success
    await supabaseAdmin
      .from('ecosystem_snapshots')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        storage_path: storagePath,
        checksum: aggregateChecksum,
        record_counts: recordCounts,
        last_error: null,
      })
      .eq('id', snapshotId);

    const totalRecords = Object.values(recordCounts).reduce((a, b) => a + b, 0);
    log.info(`Snapshot completed`, { snapshotId, totalRecords, domains: SNAPSHOT_DOMAINS.length });

    return corsJsonResponse({
      snapshot_id: snapshotId,
      status: 'completed',
      storage_path: storagePath,
      record_counts: recordCounts,
      total_records: totalRecords,
    }, req);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error('Snapshot failed', error);

    // Update snapshot record: failure
    await supabaseAdmin
      .from('ecosystem_snapshots')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        last_error: errorMsg.slice(0, 1000),
      })
      .eq('id', snapshotId);

    return corsJsonResponse({
      snapshot_id: snapshotId,
      status: 'failed',
      error: errorMsg.slice(0, 200),
    }, req, 500);
  }
});
