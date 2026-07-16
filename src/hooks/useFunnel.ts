import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { type FunnelStage, type FunnelType } from '@/constants/funnelStages';
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
import { invokeWithAuth } from "@/lib/invokeWithAuth";
const t = i18n.t.bind(i18n);

// Re-export for backward compatibility
export type { FunnelStage, FunnelType };

export interface FunnelItem {
  id: string;
  stage: FunnelStage;
  type: FunnelType;
  owner_consultant_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  organization_name: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  linked_startup_id: string | null;
  linked_workspace_id: string | null;
  linked_contract_id: string | null;
  program_id: string | null;
  first_contact_at: string | null;
  qualified_at: string | null;
  converted_at: string | null;
  next_action_at: string | null;
  next_action_description: string | null;
  last_activity_at: string | null;
  deal_value: number | null;
  deal_currency: string | null;
  expected_close_date: string | null;
  win_probability: number | null;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
  owner?: { id: string; full_name: string | null; email: string } | null;
  program?: { id: string; name: string } | null;
  metadata_json?: Record<string, unknown> | null;
}

export function useFunnelItems(filters?: { stage?: FunnelStage; consultantId?: string }) {
  return useQuery({
    queryKey: ['funnel-items', filters],
    queryFn: async (): Promise<FunnelItem[]> => {
      let query = supabase
        .from('funnel_items')
        .select('id, type, stage, organization_name, contact_name, contact_email, contact_phone, source, notes, tags, owner_consultant_id, program_id, linked_startup_id, linked_workspace_id, linked_contract_id, first_contact_at, qualified_at, converted_at, next_action_at, next_action_description, last_activity_at, deal_value, deal_currency, expected_close_date, win_probability, loss_reason, metadata_json, created_at, updated_at')
        .order('updated_at', { ascending: false });

      if (filters?.stage) {
        query = query.eq('stage', filters.stage);
      }
      if (filters?.consultantId) {
        query = query.eq('owner_consultant_id', filters.consultantId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch owner profiles
      const ownerIds = [...new Set((data || []).filter(d => d.owner_consultant_id).map(d => d.owner_consultant_id))];
      let owners: Record<string, { id: string; full_name: string | null; email: string }> = {};
      
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name, email')
          .in('id', ownerIds as string[]);
        profiles?.forEach(p => { owners[p.id] = p; });
      }

      return (data || []).map(item => ({
        ...item,
        stage: item.stage as FunnelStage,
        type: item.type as FunnelType,
        tags: item.tags || [],
        owner: item.owner_consultant_id ? owners[item.owner_consultant_id] || null : null,
      })) as FunnelItem[];
    },
  });
}

export function useCreateFunnelItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: Partial<FunnelItem>) => {
      const { data, error } = await supabase
        .from('funnel_items')
        .insert(item as any)
        .select()
        .single();
      if (error) throw error;

      // Log event
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('funnel_events').insert({
        funnel_item_id: data.id,
        event_type: 'created',
        to_stage: item.stage || 'new',
        performed_by: user?.id,
      });

      return data;
    },
    onSuccess: () => {
      // B2: Inbox reads ['crm-inbox'] and Pipeline reads ['crm-pipeline'];
      // without invalidating them a newly created lead is invisible and users
      // re-submit, creating duplicates.
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
      notify.success(t('crm.leadCreated'));
    },
    onError: (e: Error) => notify.error(e.message),
  });
}

export function useUpdateFunnelItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FunnelItem> & { id: string }) => {
      // Get current item for event logging
      const { data: current } = await supabase
        .from('funnel_items')
        .select('stage')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('funnel_items')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      // Log stage change if applicable
      if (updates.stage && current?.stage !== updates.stage) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('funnel_events').insert({
          funnel_item_id: id,
          event_type: 'stage_changed',
          from_stage: current?.stage,
          to_stage: updates.stage,
          performed_by: user?.id,
        });

        // Trigger CRM stage transition email (fire-and-forget)
        invokeWithAuth('send-crm-stage-transition-email', {
          body: {
            funnel_item_id: id,
            from_stage: current?.stage,
            to_stage: updates.stage,
          },
        }).catch((err) => {
          logger.warn('crm_stage_email_trigger_failed', { error: String(err) });
        });
      }

      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      // Optimistic update: immediately reflect stage change in cache
      await queryClient.cancelQueries({ queryKey: ['funnel-items'] });
      await queryClient.cancelQueries({ queryKey: ['crm-pipeline'] });

      const previousFunnelItems = queryClient.getQueryData(['funnel-items']);
      const previousPipeline = queryClient.getQueryData(['crm-pipeline']);

      // Patch funnel-items cache
      queryClient.setQueriesData<FunnelItem[]>({ queryKey: ['funnel-items'] }, (old) => {
        if (!old) return old;
        return old.map((item) => (item.id === id ? { ...item, ...updates } : item));
      });

      // Patch crm-pipeline cache (array of arrays or flat)
      queryClient.setQueriesData<any>({ queryKey: ['crm-pipeline'] }, (old) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((item: any) => (item?.id === id ? { ...item, ...updates } : item));
        }
        return old;
      });

      return { previousFunnelItems, previousPipeline };
    },
    onError: (e: Error, _vars, context) => {
      // Rollback on error
      if (context?.previousFunnelItems) {
        queryClient.setQueryData(['funnel-items'], context.previousFunnelItems);
      }
      if (context?.previousPipeline) {
        queryClient.setQueryData(['crm-pipeline'], context.previousPipeline);
      }
      notify.error(e.message);
    },
    onSuccess: (_data, { id, ...updates }) => {
      notify.success(t('crm.updated'));
      
      // E1: Auto-suggest workspace creation when lead reaches "contracted"
      if (updates.stage === 'contracted') {
        // G1: caches are keyed ['funnel-items', filters] — exact getQueryData
        // never hit and the event never fired. Scan all matching caches.
        const caches = queryClient.getQueriesData<FunnelItem[]>({ queryKey: ['funnel-items'] });
        let current: FunnelItem | undefined;
        for (const [, data] of caches) {
          current = data?.find(i => i.id === id);
          if (current) break;
        }
        if (current && !current.linked_workspace_id) {
          window.dispatchEvent(new CustomEvent('crm:lead-contracted', {
            detail: { itemId: id, name: current.organization_name || current.contact_name || '' }
          }));
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
    },
  });
}

export function useConvertToStartup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      funnelItemId,
      programId,
      stage,
      incubationTypeId,
      buildingId,
      squareMeters,
      monthlyFee,
    }: {
      funnelItemId: string;
      programId: string;
      stage: string;
      incubationTypeId?: string;
      buildingId?: string;
      squareMeters?: number;
      monthlyFee?: number;
    }) => {
      // Load the lead once client-side to compose enriched name/description/notes.
      // The RPC does the transactional writes atomically — no client compensation needed.
      const { data: item, error: itemError } = await supabase
        .from('funnel_items')
        .select('*')
        .eq('id', funnelItemId)
        .single();
      if (itemError) throw itemError;

      if (item.linked_workspace_id) {
        throw new Error(
          'Este lead já foi convertido num workspace. Abra o workspace existente em vez de criar um novo.',
        );
      }

      const meta = (item.metadata_json as Record<string, unknown> | null) || {};
      const projectName =
        (typeof meta.project_name === 'string' ? meta.project_name : null) ||
        item.organization_name ||
        item.contact_name ||
        'New Startup';

      const descParts: string[] = [];
      if (item.notes) descParts.push(item.notes);
      if (typeof meta.vertical === 'string') descParts.push(`Vertical: ${meta.vertical}`);
      if (typeof meta.sector === 'string') descParts.push(`Setor: ${meta.sector}`);
      if (typeof meta.has_tech === 'boolean') descParts.push(`Componente tecnológica: ${meta.has_tech ? 'Sim' : 'Não'}`);
      if (typeof meta.is_iies === 'boolean') descParts.push(`IIES: ${meta.is_iies ? 'Sim' : 'Não'}`);
      if (typeof meta.help_expectation === 'string') descParts.push(`Expectativas: ${meta.help_expectation}`);
      if (typeof meta.personal_intro === 'string') descParts.push(`Apresentação: ${meta.personal_intro}`);
      if (typeof meta.referral_source === 'string') descParts.push(`Como nos conheceu: ${meta.referral_source}`);
      const description = descParts.filter(Boolean).join('\n\n') || null;

      const STAGE_MAP: Record<string, string> = {
        ideation: 'ideation',
        validation: 'validation',
        mvp: 'mvp',
        growth: 'growth',
        scale: 'scale',
      };
      const inferredStage =
        (typeof meta.stage === 'string' && STAGE_MAP[meta.stage.toLowerCase()]) || stage;

      const noteParts: string[] = [];
      noteParts.push('Workspace criado a partir de lead CRM.');
      if (item.contact_name) {
        noteParts.push(
          `Contacto: ${item.contact_name}${item.contact_email ? ` <${item.contact_email}>` : ''}${item.contact_phone ? ` (${item.contact_phone})` : ''}`,
        );
      }
      if (item.source) noteParts.push(`Origem: ${item.source}`);
      if (description) noteParts.push(description);
      const healthNotes = noteParts.join('\n\n');

      // Transactional RPC — creates startup + workspace + membership + optional
      // contract stub + funnel update + event in one atomic step. Any failure
      // rolls back the whole set on the server.
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'staff_convert_funnel_item_to_startup',
        {
          p_funnel_item_id: funnelItemId,
          p_program_id: programId,
          p_stage: stage,
          p_incubation_type_id: incubationTypeId ?? undefined,
          p_building_id: buildingId ?? undefined,
          p_square_meters: squareMeters ?? undefined,
          p_monthly_fee: monthlyFee ?? undefined,
          p_project_name: projectName,
          p_description: description,
          p_health_notes: healthNotes,
          p_inferred_stage: inferredStage,
        },
      );
      if (rpcError) throw rpcError;

      const result = rpcData as {
        startup_id: string;
        workspace_id: string;
        contract_id: string | null;
        was_existing: boolean;
      };

      // Best-effort: copy pitch deck from public booking storage into the workspace's documents.
      // Storage operations cannot live inside the DB transaction, so this stays client-side
      // and never rolls back a successful conversion.
      const pitchDeckPath = typeof meta.pitch_deck_path === 'string' ? meta.pitch_deck_path : null;
      if (pitchDeckPath && !result.was_existing) {
        try {
          const { data: deckBlob, error: dlErr } = await supabase.storage
            .from('booking-uploads')
            .download(pitchDeckPath);
          if (dlErr) throw dlErr;

          const originalName = pitchDeckPath.split('/').pop() || 'pitch-deck';
          const destPath = `${result.workspace_id}/${Date.now()}_${originalName}`;
          const { error: upErr } = await supabase.storage
            .from('workspace-documents')
            .upload(destPath, deckBlob, {
              contentType: deckBlob.type || 'application/octet-stream',
              upsert: false,
            });
          if (upErr) throw upErr;

          const { data: authUser } = await supabase.auth.getUser();
          const { error: docErr } = await supabase.from('documents').insert({
            workspace_id: result.workspace_id,
            name: `Pitch Deck — ${projectName}`,
            description: 'Importado automaticamente do formulário público de primeiro contacto.',
            document_type: 'file',
            file_path: destPath,
            mime_type: deckBlob.type || 'application/octet-stream',
            category: 'pitch_deck',
            visibility: 'shared_with_mentor',
            uploaded_by: authUser.user?.id ?? null,
          });
          if (docErr) throw docErr;
        } catch (err) {
          logger.warn('pitch_deck_import_failed', {
            error: String(err),
            workspaceId: result.workspace_id,
          });
        }
      }

      // Fetch the created startup + workspace so callers relying on prior shape keep working.
      const [{ data: startup }, { data: workspace }, { data: contract }] = await Promise.all([
        supabase.from('startups').select('*').eq('id', result.startup_id).single(),
        supabase.from('workspaces').select('*').eq('id', result.workspace_id).single(),
        result.contract_id
          ? supabase.from('startup_contracts').select('*').eq('id', result.contract_id).single()
          : Promise.resolve({ data: null }),
      ]);

      return { startup, workspace, contract, wasExisting: result.was_existing };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      notify.success(t('crm.convertedToStartup'));
    },
    onError: (e: Error) => notify.error(e.message),
  });
}

