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
import { withCronRunLogging } from '../_shared/cronRun.ts';

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

Deno.serve(withCronRunLogging('run-ecosystem-snapshot', async (req) => {
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
  // Release-hardening Phase 7: upload data files under a temporary prefix
  // first, verify counts + required domains, then publish the manifest at
  // the final path as the atomic "promotion" flag. If anything fails we
  // clean up the temp prefix so we never leave a half-baked snapshot
  // shadowing a valid one.
  const tmpPrefix = `${storagePath}/tmp`;

  log.info(`Starting ecosystem snapshot ${snapshotId}`, { storagePath, initiatedBy });

  const uploadedTmpPaths: string[] = [];

  const cleanupTmp = async () => {
    if (uploadedTmpPaths.length === 0) return;
    try {
      await supabaseAdmin.storage.from('ecosystem-backups').remove(uploadedTmpPaths);
    } catch (e) {
      log.warn('Failed to clean up temp snapshot files', e as Error);
    }
  };

  try {
    const recordCounts: Record<string, number> = {};
    const allChecksums: string[] = [];

    for (const domain of SNAPSHOT_DOMAINS) {
      log.info(`Exporting domain: ${domain.name}`);

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

      const jsonContent = JSON.stringify(allRows, null, 0);
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(jsonContent);

      const hashBuffer = await crypto.subtle.digest('SHA-256', contentBytes);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      allChecksums.push(hashHex);

      // Upload to the TEMP prefix. The final storage_path remains
      // canonical for the manifest.
      const tmpFilePath = `${tmpPrefix}/${domain.name}.json`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('ecosystem-backups')
        .upload(tmpFilePath, contentBytes, {
          contentType: 'application/json',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload ${domain.name}: ${uploadError.message}`);
      }
      uploadedTmpPaths.push(tmpFilePath);

      log.info(`Exported ${domain.name}: ${allRows.length} records`);
    }

    // Non-empty domain assertions.
    const REQUIRED_NONZERO: Record<string, number> = {
      profiles: 1,
      programs: 1,
    };
    for (const [domain, min] of Object.entries(REQUIRED_NONZERO)) {
      const actual = recordCounts[domain] ?? 0;
      if (actual < min) {
        throw new Error(
          `Domain ${domain} exported ${actual} rows (expected >= ${min}). Aborting snapshot.`,
        );
      }
    }
    // Every declared domain must have produced a temp file.
    const missing = SNAPSHOT_DOMAINS.filter(d => !uploadedTmpPaths.some(p => p.endsWith(`/${d.name}.json`)));
    if (missing.length > 0) {
      throw new Error(`Missing temp uploads for domains: ${missing.map(d => d.name).join(', ')}`);
    }

    const aggregateInput = allChecksums.join(':');
    const aggHashBuffer = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(aggregateInput)
    );
    const aggregateChecksum = Array.from(new Uint8Array(aggHashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Promotion step: publish the manifest to the FINAL storage_path. The
    // manifest references data files under `tmp/`; consumers must go
    // through the manifest to discover them, so the manifest is the
    // atomic "this snapshot is valid" marker.
    const manifest = {
      snapshot_id: snapshotId,
      timestamp,
      domains: SNAPSHOT_DOMAINS.map(d => d.name),
      data_prefix: tmpPrefix,
      record_counts: recordCounts,
      domain_checksums: Object.fromEntries(
        SNAPSHOT_DOMAINS.map((d, i) => [d.name, allChecksums[i]])
      ),
      aggregate_checksum: aggregateChecksum,
    };

    const { error: manifestErr } = await supabaseAdmin.storage
      .from('ecosystem-backups')
      .upload(`${storagePath}/manifest.json`, new TextEncoder().encode(JSON.stringify(manifest, null, 2)), {
        contentType: 'application/json',
        upsert: false,
      });
    if (manifestErr) {
      throw new Error(`Failed to publish manifest: ${manifestErr.message}`);
    }

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

    // Best-effort cleanup: never leave temp uploads hanging.
    await cleanupTmp();

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
}));
