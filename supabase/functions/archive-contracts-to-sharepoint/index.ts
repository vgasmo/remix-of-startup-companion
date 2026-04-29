/**
 * Archive Contracts to SharePoint
 * 
 * Cron: daily at 02:00 UTC
 * Auth: x-cron-secret OR governance role (admin via requireCronOrGovernance) for manual triggers
 * 
 * Finds contracts eligible for archival (signed_at + 7 days, not yet archived,
 * attempts < 5) and uploads the canonical PDF to SharePoint via MS Graph API.
 * 
 * Writes archive metadata back to startup_contracts and logs to contract_lifecycle_events.
 * The app remains the canonical source of truth — SharePoint is a compliance archive.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronOrGovernance, createLogger, generateRequestId } from '../_shared/security.ts';
import { getGraphCredentials, getGraphAccessToken, callGraphWithRetry } from '../_shared/graphAuth.ts';

const FUNCTION_NAME = 'archive-contracts-to-sharepoint';
const MAX_ATTEMPTS = 5;
const ELIGIBILITY_DAYS = 7;

interface ArchiveResult {
  contractId: string;
  success: boolean;
  error?: string;
  archiveUrl?: string;
}

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

  // Auth: cron secret or staff
  const authResult = await requireCronOrGovernance(req, supabaseUser, supabaseAdmin);
  if ('error' in authResult) {
    log.warn('Unauthorized access attempt');
    return authResult.error;
  }

  // Optional: single contract ID for manual retry
  let singleContractId: string | null = null;
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      singleContractId = body.contract_id || null;
    }
  } catch { /* ignore */ }

  try {
    // Check Graph API configuration
    const driveId = Deno.env.get('MS_GRAPH_SHAREPOINT_DRIVE_ID');
    if (!driveId) {
      log.error('MS_GRAPH_SHAREPOINT_DRIVE_ID not configured');
      return corsJsonResponse({
        error: 'SharePoint drive not configured',
        archived: 0,
        failed: 0,
      }, req, 500);
    }

    const graphCreds = await getGraphCredentials(supabaseAdmin);
    if (!graphCreds) {
      log.error('MS Graph credentials not configured');
      return corsJsonResponse({
        error: 'MS Graph not configured',
        archived: 0,
        failed: 0,
      }, req, 500);
    }

    // Query eligible contracts
    let query = supabaseAdmin
      .from('startup_contracts')
      .select(`
        id, contract_number, organization_name, signed_at, document_url,
        contract_pdf_path, pricing_snapshot_json,
        workspace_id, archive_status, archive_attempt_count, archive_checksum
      `)
      .not('signed_at', 'is', null)
      .lt('archive_attempt_count', MAX_ATTEMPTS);

    if (singleContractId) {
      // Manual retry for specific contract
      query = query.eq('id', singleContractId);
    } else {
      // Scheduled run: only contracts past eligibility window
      const eligibilityDate = new Date(Date.now() - ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      query = query
        .lte('signed_at', eligibilityDate)
        .or('archive_status.is.null,archive_status.eq.failed,archive_status.eq.pending');
    }

    const { data: contracts, error: queryError } = await query.limit(20); // Process in batches of 20

    if (queryError) {
      log.error('Failed to query eligible contracts', queryError);
      return corsJsonResponse({ error: 'Query failed', archived: 0, failed: 0 }, req, 500);
    }

    if (!contracts || contracts.length === 0) {
      log.info('No contracts eligible for archival');
      return corsJsonResponse({ archived: 0, failed: 0, message: 'No eligible contracts' }, req);
    }

    log.info(`Found ${contracts.length} contracts eligible for archival`);

    // Get Graph API token
    const accessToken = await getGraphAccessToken(graphCreds);
    const results: ArchiveResult[] = [];

    for (const contract of contracts) {
      const result = await archiveContract(
        supabaseAdmin, accessToken, driveId, contract, log
      );
      results.push(result);
    }

    const archived = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    log.info(`Archival batch complete`, { archived, failed, total: contracts.length });

    return corsJsonResponse({ archived, failed, results }, req);
  } catch (error) {
    log.error('Fatal error in archive job', error);
    return corsJsonResponse({ error: 'Internal error', archived: 0, failed: 0 }, req, 500);
  }
});

async function archiveContract(
  supabase: any,
  accessToken: string,
  driveId: string,
  contract: any,
  log: ReturnType<typeof createLogger>,
): Promise<ArchiveResult> {
  const contractId = contract.id;

  try {
    // Mark as uploading
    await supabase
      .from('startup_contracts')
      .update({
        archive_status: 'uploading',
        archive_attempt_count: (contract.archive_attempt_count || 0) + 1,
      })
      .eq('id', contractId);

    // Get the canonical document. Bulk-imported contracts also fill
    // `contract_pdf_path`; fall back to it if `document_url` is missing.
    const canonicalPath: string | null = contract.document_url || contract.contract_pdf_path || null;
    if (!canonicalPath) {
      throw new Error('No document_url or contract_pdf_path — contract has no canonical PDF to archive');
    }

    // Determine which private bucket holds the file. Bulk imports tag this
    // in pricing_snapshot_json.pdf_bucket; manual contracts default to
    // `contract-documents`.
    const bucketFromSnapshot = contract.pricing_snapshot_json?.pdf_bucket;
    const bucketName: string = (typeof bucketFromSnapshot === 'string' && bucketFromSnapshot.length > 0)
      ? bucketFromSnapshot
      : 'contract-documents';

    // Resolve document URL — may be a relative Storage path or a full URL
    let documentUrl = canonicalPath;
    let pdfBytes: Uint8Array;
    if (documentUrl.startsWith('http')) {
      const pdfResponse = await fetch(documentUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download contract PDF: ${pdfResponse.status}`);
      }
      pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    } else {
      // Private storage path — download via service role from the appropriate bucket.
      log.info(`Downloading from private bucket ${bucketName}: ${documentUrl}`);
      const { data: fileData, error: dlError } = await supabase
        .storage
        .from(bucketName)
        .download(documentUrl);
      if (dlError || !fileData) {
        throw new Error(`Failed to download contract PDF from storage (${bucketName}): ${dlError?.message || 'unknown'}`);
      }
      pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    }

    // Compute SHA-256 checksum
    const hashBuffer = await crypto.subtle.digest('SHA-256', pdfBytes.buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Skip if already archived with same checksum (idempotency)
    if (contract.archive_status === 'completed' && contract.archive_checksum === checksum) {
      log.info(`Contract ${contractId} already archived with same checksum, skipping`);
      return { contractId, success: true, archiveUrl: '' };
    }

    // Build deterministic path
    const signedDate = new Date(contract.signed_at);
    const year = signedDate.getFullYear();
    const orgName = sanitizeFolderName(contract.organization_name || 'Sem_Nome');
    const contractNum = contract.contract_number || contractId.slice(0, 8);
    const dateStr = signedDate.toISOString().split('T')[0];
    const filename = `${contractNum}_signed_${dateStr}.pdf`;
    const archivePath = `/Contratos/${year}/${orgName}/${filename}`;

    // Upload to SharePoint via Graph API
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${archivePath}:/content`;

    const uploadResponse = await callGraphWithRetry(accessToken, uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBytes as BodyInit,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`SharePoint upload failed: ${uploadResponse.status} - ${errorText.slice(0, 200)}`);
    }

    const uploadData = await uploadResponse.json();
    const webUrl = uploadData.webUrl || uploadData['@microsoft.graph.downloadUrl'] || '';

    // Write archive metadata back to Product Truth
    await supabase
      .from('startup_contracts')
      .update({
        archive_status: 'completed',
        archived_at: new Date().toISOString(),
        archive_location_url: webUrl,
        archive_checksum: checksum,
        archive_filename: filename,
        archive_provider: 'sharepoint',
        last_archive_error: null,
      })
      .eq('id', contractId);

    // Log lifecycle event
    await supabase.from('contract_lifecycle_events').insert({
      contract_id: contractId,
      event_type: 'archived_to_sharepoint',
      event_date: new Date().toISOString().split('T')[0],
      performed_by: null, // system action
      details: {
        archive_path: archivePath,
        checksum,
        web_url: webUrl,
        file_size_bytes: pdfBytes.length,
      },
    });

    log.info(`Archived contract ${contractId} to ${archivePath}`);
    return { contractId, success: true, archiveUrl: webUrl };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to archive contract ${contractId}`, error);

    // Write failure metadata
    await supabase
      .from('startup_contracts')
      .update({
        archive_status: 'failed',
        last_archive_error: errorMsg.slice(0, 500),
      })
      .eq('id', contractId);

    return { contractId, success: false, error: errorMsg };
  }
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
}
