import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import i18n from '@/i18n';
import {
  MasterDataset,
  MasterOrganization,
  ImportConfig,
  ImportResult,
  buildMasterDataset,
  DatasetBuildOptions,
  formatAttributesAsNotes,
} from '@/lib/masterDataset';

const t = i18n.t.bind(i18n);

export interface FileParseResult {
  fileName: string;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
  type: 'excel_clients' | 'hubspot_contacts' | 'hubspot_companies' | 'hubspot_deals';
}

export function useMasterDatasetImport() {
  const queryClient = useQueryClient();
  const [parsedFiles, setParsedFiles] = useState<FileParseResult[]>([]);
  const [masterDataset, setMasterDataset] = useState<MasterDataset | null>(null);
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);

  /**
   * Add a parsed file to the list
   */
  const addParsedFile = useCallback((result: FileParseResult) => {
    setParsedFiles(prev => {
      // Replace if same type exists
      const existing = prev.findIndex(f => f.type === result.type);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = result;
        return updated;
      }
      return [...prev, result];
    });
  }, []);

  /**
   * Remove a parsed file
   */
  const removeParsedFile = useCallback((type: FileParseResult['type']) => {
    setParsedFiles(prev => prev.filter(f => f.type !== type));
  }, []);

  /**
   * Clear all parsed files
   */
  const clearParsedFiles = useCallback(() => {
    setParsedFiles([]);
    setMasterDataset(null);
    setDryRunResult(null);
  }, []);

  /**
   * Build master dataset from parsed files
   */
  const buildDataset = useCallback(() => {
    const options: DatasetBuildOptions = {};

    parsedFiles.forEach(file => {
      switch (file.type) {
        case 'excel_clients':
          options.excelClientsRows = file.rows;
          break;
        case 'hubspot_contacts':
          options.hubspotContactsRows = file.rows;
          break;
        case 'hubspot_companies':
          options.hubspotCompaniesRows = file.rows;
          break;
        case 'hubspot_deals':
          options.hubspotDealsRows = file.rows;
          break;
      }
    });

    const dataset = buildMasterDataset(options);
    setMasterDataset(dataset);
    setDryRunResult(null);
    return dataset;
  }, [parsedFiles]);

  /**
   * Perform dry run import
   */
  const dryRunMutation = useMutation({
    mutationFn: async (config: ImportConfig) => {
      if (!masterDataset) throw new Error('No dataset to import');

      // For now, do client-side dry run
      const result = await performDryRun(masterDataset, config);
      return result;
    },
    onSuccess: (result) => {
      setDryRunResult(result);
      notify.success(t('common.dryRunCompleteResultsummarywould_insertTo', { would_update: result.summary.would_update }));
    },
    onError: (e: Error) => {
      notify.error(e.message);
    },
  });

  /**
   * Perform actual import
   */
  const importMutation = useMutation({
    mutationFn: async (config: ImportConfig) => {
      if (!masterDataset) throw new Error('No dataset to import');
      if (!dryRunResult) throw new Error('Please run dry run first');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Import organizations as funnel_items
      const orgsToImport = masterDataset.organizations.filter(o => !o._is_duplicate);
      const inserted: string[] = [];
      const updated: string[] = [];
      const errors: { id: string; error: string }[] = [];

      for (const org of orgsToImport) {
        try {
          // Check if exists by email or name
          let existingId: string | null = null;
          
          if (config.upsert_mode && org.email_main) {
            const { data: existing } = await supabase
              .from('funnel_items')
              .select('id')
              .eq('contact_email', org.email_main)
              .maybeSingle();
            
            if (existing) {
              existingId = existing.id;
            }
          }

          const funnelData = {
            organization_name: org.name,
            contact_email: org.email_main || null,
            contact_phone: org.phone_main || null,
            source: `import_${org.external_source}`,
            stage: config.default_stage,
            program_id: config.program_id,
            owner_consultant_id: config.owner_consultant_id || null,
            tags: [...(org.tags || []), 'master_import'],
            notes: formatAttributesAsNotes(org.attributes_json, org.vat_number, org.country),
            type: 'lead' as const,
          };

          if (existingId && config.upsert_mode) {
            const { error } = await supabase
              .from('funnel_items')
              .update(funnelData)
              .eq('id', existingId);

            if (error) throw error;
            updated.push(org.external_id);
          } else {
            const { error } = await supabase
              .from('funnel_items')
              .insert(funnelData);

            if (error) throw error;
            inserted.push(org.external_id);
          }
        } catch (e: any) {
          errors.push({ id: org.external_id, error: e.message });
        }
      }

      return {
        success: errors.length === 0,
        dry_run: false,
        summary: {
          would_insert: 0,
          would_update: 0,
          skipped: masterDataset.organizations.filter(o => o._is_duplicate).length,
          duplicates: masterDataset.organizations.filter(o => o._is_duplicate).length,
          errors: errors.length,
        },
        inserted: inserted.length,
        updated: updated.length,
        details: [],
        errors: errors.map(e => ({ row: 0, external_id: e.id, message: e.error })),
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      notify.success(t('common.importCompleteResultinsertedInserted', { updated: result.updated }));
    },
    onError: (e: Error) => {
      notify.error(e.message);
    },
  });

  return {
    parsedFiles,
    masterDataset,
    dryRunResult,
    addParsedFile,
    removeParsedFile,
    clearParsedFiles,
    buildDataset,
    dryRun: dryRunMutation.mutate,
    isDryRunning: dryRunMutation.isPending,
    performImport: importMutation.mutate,
    isImporting: importMutation.isPending,
  };
}

/**
 * Client-side dry run simulation
 */
async function performDryRun(
  dataset: MasterDataset,
  config: ImportConfig
): Promise<ImportResult> {
  const orgsToImport = dataset.organizations.filter(o => !o._is_duplicate);
  const duplicates = dataset.organizations.filter(o => o._is_duplicate);

  // Check for existing records by email
  const emails = orgsToImport
    .filter(o => o.email_main)
    .map(o => o.email_main!);

  let existingEmails: string[] = [];
  if (emails.length > 0 && config.upsert_mode) {
    const { data } = await supabase
      .from('funnel_items')
      .select('contact_email')
      .in('contact_email', emails);
    
    existingEmails = (data || []).map(d => d.contact_email).filter(Boolean) as string[];
  }

  const wouldInsert = orgsToImport.filter(
    o => !o.email_main || !existingEmails.includes(o.email_main)
  );
  const wouldUpdate = orgsToImport.filter(
    o => o.email_main && existingEmails.includes(o.email_main)
  );

  return {
    success: true,
    dry_run: true,
    summary: {
      would_insert: config.upsert_mode ? wouldInsert.length : orgsToImport.length,
      would_update: config.upsert_mode ? wouldUpdate.length : 0,
      skipped: duplicates.length,
      duplicates: duplicates.length,
      errors: 0,
    },
    details: [
      ...wouldInsert.slice(0, 10).map(o => ({
        external_id: o.external_id,
        name: o.name,
        action: 'insert' as const,
      })),
      ...wouldUpdate.slice(0, 10).map(o => ({
        external_id: o.external_id,
        name: o.name,
        action: 'update' as const,
        reason: 'Email already exists',
      })),
      ...duplicates.slice(0, 5).map(o => ({
        external_id: o.external_id,
        name: o.name,
        action: 'duplicate' as const,
        reason: `Duplicate of ${o._matched_with} (score: ${o._match_score})`,
      })),
    ],
    errors: [],
  };
}
