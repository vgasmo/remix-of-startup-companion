import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { invokeWithAuth } from "@/lib/invokeWithAuth";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface SurveyQuestion {
  id: string;
  section: string;
  question: string;
  type: "text" | "number" | "date" | "select" | "multiselect" | "rating" | "textarea";
  options?: string[];
  required?: boolean;
  autoFillKey?: string;
  min?: number;
  max?: number;
}

/** Where a submitted answer is written in the canonical tables. */
export type WriteBackTarget = "kpi" | "startup" | "workspace" | "milestone";

export interface WriteBackMapping {
  target: WriteBackTarget;
  /** kpi_definition_id for `kpi`; column name for `startup` / `workspace`. */
  key?: string;
  /** Answer value -> stored value (e.g. "Validacao" -> "validation"). */
  valueMap?: Record<string, string>;
  /** Overwrite a field that already holds a value. Default: false. */
  overwrite?: boolean;
  /** For `milestone`: the question holding the target date. */
  dateQuestionId?: string;
}

/** Fields a survey answer may write on the startup profile. */
export const STARTUP_WRITE_BACK_FIELDS = [
  "description",
  "website",
  "founded_date",
  "main_contact_name",
  "main_contact_email",
  "main_contact_phone",
  "phone",
  "address",
  "nif",
] as const;

export interface SurveyWriteback {
  id: string;
  instance_id: string;
  workspace_id: string;
  question_id: string;
  target_type: WriteBackTarget;
  target_key: string | null;
  target_row_id: string | null;
  value_text: string | null;
  value_number: number | null;
  status: "applied" | "skipped" | "error";
  detail: string | null;
  created_at: string;
}

export interface SurveyDefinition {
  id: string;
  name: string;
  description: string | null;
  questions_json: SurveyQuestion[];
  auto_fill_mappings: Record<string, string>;
  write_back_mappings: Record<string, WriteBackMapping>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyCampaign {
  id: string;
  survey_definition_id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  reminder_days: number[];
  status: "draft" | "active" | "closed" | "archived";
  kind: "baseline" | "ecosystem" | "custom";
  auto_enroll: boolean;
  program_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  survey_definition?: SurveyDefinition;
}

export interface SurveyInstance {
  id: string;
  campaign_id: string;
  workspace_id: string;
  status: "pending" | "in_progress" | "submitted";
  auto_filled_data: Record<string, unknown>;
  submitted_at: string | null;
  submitted_by: string | null;
  last_reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
  campaign?: SurveyCampaign;
  workspace?: { id: string; startup_id: string; startups: { name: string } };
}

export interface SurveyResponse {
  id: string;
  instance_id: string;
  question_id: string;
  response_value: string | null;
  response_json: Json | null;
  is_auto_filled: boolean;
  created_at: string;
  updated_at: string;
}

// Admin hooks for survey definitions
export function useSurveyDefinitions() {
  return useQuery({
    queryKey: ["survey-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_definitions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as SurveyDefinition[];
    },
  });
}

export function useCreateSurveyDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (definition: {
      name: string;
      description?: string;
      questions_json: SurveyQuestion[];
      auto_fill_mappings?: Record<string, string>;
      write_back_mappings?: Record<string, WriteBackMapping>;
    }) => {
      const { data, error } = await supabase
        .from("survey_definitions")
        .insert({
          name: definition.name,
          description: definition.description,
          questions_json: definition.questions_json as unknown as Json,
          auto_fill_mappings: (definition.auto_fill_mappings || {}) as unknown as Json,
          write_back_mappings: (definition.write_back_mappings || {}) as unknown as Json,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-definitions"] });
      toast.success("Survey template created");
    },
    onError: (error) => {
      toast.error("Failed to create survey template");
      logger.error('operation_error', {}, error);
    },
  });
}

export function useUpdateSurveyDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<SurveyDefinition> & { id: string }) => {
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.questions_json !== undefined) updateData.questions_json = updates.questions_json as unknown as Json;
      if (updates.auto_fill_mappings !== undefined) updateData.auto_fill_mappings = updates.auto_fill_mappings as unknown as Json;
      if (updates.write_back_mappings !== undefined) updateData.write_back_mappings = updates.write_back_mappings as unknown as Json;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

      const { data, error } = await supabase
        .from("survey_definitions")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-definitions"] });
      toast.success("Survey template updated");
    },
    onError: (error) => {
      toast.error("Failed to update survey template");
      logger.error('operation_error', {}, error);
    },
  });
}

export function useDeleteSurveyDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("survey_definitions")
        .delete()
        .eq("id", id);
      if (error) {
        if ((error as { code?: string }).code === '23503') {
          const err = new Error("Template has campaigns — archive it instead");
          (err as unknown as { code: string }).code = 'RESTRICT_CAMPAIGNS';
          throw err;
        }
        throw error;
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-definitions"] });
      toast.success("Template removido");
    },
    onError: (error) => {
      toast.error((error as Error)?.message || "Falha ao remover template");
      logger.error('operation_error', {}, error);
    },
  });
}

// Survey campaigns
export function useSurveyCampaigns() {
  return useQuery({
    queryKey: ["survey-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_campaigns")
        .select("*, survey_definition:survey_definitions(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as SurveyCampaign[];
    },
  });
}

export function useCreateSurveyCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: {
      survey_definition_id: string;
      name: string;
      description?: string;
      starts_at: string;
      ends_at: string;
      reminder_days?: number[];
      program_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("survey_campaigns")
        .insert({
          ...campaign,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      toast.success("Survey campaign created");
    },
    onError: (error) => {
      toast.error("Failed to create campaign");
      logger.error('operation_error', {}, error);
    },
  });
}

export function useLaunchCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      // Server-side launch: snapshots the questions, sets launched_at and is
      // idempotent (ON CONFLICT), so relaunching never leaves partial instances.
      const { data, error } = await supabase.rpc("launch_survey_campaign", {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { instancesCreated: row?.instances_created ?? 0 };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });
      toast.success(t('surveys.campaignLaunched', { instancesCreated: data.instancesCreated }));
    },
    onError: (error) => {
      toast.error("Failed to launch campaign");
      logger.error('operation_error', {}, error);
    },
  });
}

export function useCloseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from("survey_campaigns")
        .update({ status: "closed" })
        .eq("id", campaignId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      toast.success("Campaign closed");
    },
    onError: (error) => {
      toast.error("Failed to close campaign");
      logger.error('operation_error', {}, error);
    },
  });
}

/** Reopen a closed campaign so pending startups can submit again. */
export function useReopenCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from("survey_campaigns")
        .update({ status: "active" })
        .eq("id", campaignId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      toast.success(t("admin.surveys.reopened", "Campanha reaberta"));
    },
    onError: (error) => {
      toast.error(t("admin.surveys.reopenFailed", "Não foi possível reabrir a campanha"));
      logger.error('operation_error', {}, error);
    },
  });
}

/** Update the campaign end date. */
export function useUpdateCampaignEndDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, endsAt }: { campaignId: string; endsAt: string }) => {
      const { error } = await supabase
        .from("survey_campaigns")
        .update({ ends_at: endsAt })
        .eq("id", campaignId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      toast.success(t("admin.surveys.endDateUpdated", "Data de fim atualizada"));
    },
    onError: (error) => {
      toast.error(t("admin.surveys.endDateUpdateFailed", "Não foi possível atualizar a data de fim"));
      logger.error('operation_error', {}, error);
    },
  });
}

/**
 * Enroll every eligible active workspace that has no instance yet.
 * Idempotent: existing instances are left untouched.
 */
export function useSyncCampaignParticipants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data: campaign, error: campaignError } = await supabase
        .from("survey_campaigns")
        .select("id, program_id")
        .eq("id", campaignId)
        .single();

      if (campaignError) throw campaignError;

      let query = supabase
        .from("workspaces")
        .select("id, stage, startups(name, founded_date)")
        .eq("status", "active");

      if (campaign.program_id) {
        query = query.eq("program_id", campaign.program_id);
      }

      const { data: workspaces, error: workspacesError } = await query;
      if (workspacesError) throw workspacesError;

      const { data: existing, error: existingError } = await supabase
        .from("survey_instances")
        .select("workspace_id")
        .eq("campaign_id", campaignId);

      if (existingError) throw existingError;

      const enrolled = new Set((existing || []).map((i) => i.workspace_id));
      const missing = (workspaces || []).filter((ws) => !enrolled.has(ws.id));

      if (missing.length === 0) return { added: 0 };

      const { error: insertError } = await supabase.from("survey_instances").insert(
        missing.map((ws) => ({
          campaign_id: campaignId,
          workspace_id: ws.id,
          auto_filled_data: {
            stage: ws.stage,
            startup_name: ws.startups?.name || null,
            founded_year: ws.startups?.founded_date
              ? new Date(ws.startups.founded_date).getFullYear()
              : null,
          } as Json,
          status: "pending" as const,
        })),
      );

      if (insertError) throw insertError;
      return { added: missing.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });
      toast.success(
        data.added > 0
          ? t("admin.surveys.participantsAdded", { count: data.added, defaultValue: "{{count}} startups inscritas" })
          : t("admin.surveys.participantsUpToDate", "Todas as startups elegíveis já estão inscritas"),
      );
    },
    onError: (error) => {
      toast.error(t("admin.surveys.syncFailed", "Não foi possível inscrever as startups"));
      logger.error('operation_error', {}, error);
    },
  });
}

export interface CampaignCandidate {
  workspaceId: string;
  startupName: string;
  workspaceStatus: string;
  enrolled: boolean;
  instanceId: string | null;
  instanceStatus: string | null;
}

/** Every workspace that can take part in a campaign, with its enrollment state. */
export function useCampaignCandidates(campaignId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["survey-candidates", campaignId],
    enabled: !!campaignId && enabled,
    queryFn: async (): Promise<CampaignCandidate[]> => {
      if (!campaignId) return [];

      const { data: campaign, error: campaignError } = await supabase
        .from("survey_campaigns")
        .select("id, program_id")
        .eq("id", campaignId)
        .single();
      if (campaignError) throw campaignError;

      let query = supabase
        .from("workspaces")
        .select("id, status, startups(name)")
        .neq("status", "rejected");
      if (campaign.program_id) query = query.eq("program_id", campaign.program_id);

      const { data: workspaces, error: workspacesError } = await query;
      if (workspacesError) throw workspacesError;

      const { data: instances, error: instancesError } = await supabase
        .from("survey_instances")
        .select("id, workspace_id, status")
        .eq("campaign_id", campaignId);
      if (instancesError) throw instancesError;

      const byWorkspace = new Map(
        (instances || []).map((i) => [i.workspace_id, i]),
      );

      return (workspaces || [])
        .map((ws) => {
          const instance = byWorkspace.get(ws.id);
          return {
            workspaceId: ws.id,
            startupName: ws.startups?.name || "—",
            workspaceStatus: ws.status as string,
            enrolled: !!instance,
            instanceId: instance?.id ?? null,
            instanceStatus: (instance?.status as string) ?? null,
          };
        })
        .sort((a, b) => a.startupName.localeCompare(b.startupName));
    },
  });
}

/** Enroll or remove one workspace from a campaign. */
export function useToggleCampaignParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      workspaceId,
      enroll,
    }: { campaignId: string; workspaceId: string; enroll: boolean }) => {
      if (enroll) {
        const { data: ws, error: wsError } = await supabase
          .from("workspaces")
          .select("id, stage, startups(name, founded_date)")
          .eq("id", workspaceId)
          .single();
        if (wsError) throw wsError;

        const { error } = await supabase.from("survey_instances").insert({
          campaign_id: campaignId,
          workspace_id: workspaceId,
          status: "pending" as const,
          auto_filled_data: {
            stage: ws.stage,
            startup_name: ws.startups?.name || null,
            founded_year: ws.startups?.founded_date
              ? new Date(ws.startups.founded_date).getFullYear()
              : null,
          } as Json,
        });
        if (error) throw error;
        return { enrolled: true };
      }

      const { data: instance, error: fetchError } = await supabase
        .from("survey_instances")
        .select("id, status")
        .eq("campaign_id", campaignId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!instance) return { enrolled: false };

      if (instance.status === "submitted") {
        throw new Error("submitted");
      }

      const { error } = await supabase
        .from("survey_instances")
        .delete()
        .eq("id", instance.id);
      if (error) throw error;
      return { enrolled: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });
    },
    onError: (error: Error) => {
      if (error?.message === "submitted") {
        toast.error(
          t("admin.surveys.cannotRemoveSubmitted", "Esta startup já respondeu — não pode ser removida"),
        );
        return;
      }
      toast.error(t("admin.surveys.toggleParticipantFailed", "Não foi possível atualizar a inscrição"));
      logger.error('operation_error', {}, error);
    },
  });
}

/** Enroll every eligible workspace (any status except rejected). */
export function useEnrollAllCandidates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data: campaign, error: campaignError } = await supabase
        .from("survey_campaigns")
        .select("id, program_id")
        .eq("id", campaignId)
        .single();
      if (campaignError) throw campaignError;

      let query = supabase
        .from("workspaces")
        .select("id, stage, startups(name, founded_date)")
        .neq("status", "rejected");
      if (campaign.program_id) query = query.eq("program_id", campaign.program_id);

      const { data: workspaces, error: workspacesError } = await query;
      if (workspacesError) throw workspacesError;

      const { data: existing, error: existingError } = await supabase
        .from("survey_instances")
        .select("workspace_id")
        .eq("campaign_id", campaignId);
      if (existingError) throw existingError;

      const enrolled = new Set((existing || []).map((i) => i.workspace_id));
      const missing = (workspaces || []).filter((ws) => !enrolled.has(ws.id));
      if (missing.length === 0) return { added: 0 };

      const { error: insertError } = await supabase.from("survey_instances").insert(
        missing.map((ws) => ({
          campaign_id: campaignId,
          workspace_id: ws.id,
          status: "pending" as const,
          auto_filled_data: {
            stage: ws.stage,
            startup_name: ws.startups?.name || null,
            founded_year: ws.startups?.founded_date
              ? new Date(ws.startups.founded_date).getFullYear()
              : null,
          } as Json,
        })),
      );
      if (insertError) throw insertError;
      return { added: missing.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["survey-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });
      toast.success(
        data.added > 0
          ? t("admin.surveys.participantsAdded", { count: data.added, defaultValue: "{{count}} startups inscritas" })
          : t("admin.surveys.participantsUpToDate", "Todas as startups elegíveis já estão inscritas"),
      );
    },
    onError: (error) => {
      toast.error(t("admin.surveys.syncFailed", "Não foi possível inscrever as startups"));
      logger.error('operation_error', {}, error);
    },
  });
}



// Survey instances for a campaign
export function useCampaignInstances(campaignId: string | null) {
  return useQuery({
    queryKey: ["survey-instances", campaignId],
    queryFn: async () => {
      if (!campaignId) return [];

      const { data, error } = await supabase
        .from("survey_instances")
        .select("*, workspace:workspaces(id, startup_id, startups(name))")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as SurveyInstance[];
    },
    enabled: !!campaignId,
  });
}

// Founder hooks - their pending surveys
export function useMyPendingSurveys() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-pending-surveys", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get workspaces user is founder of
      const { data: workspaces, error: wsError } = await supabase
        .from("workspace_users")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("active", true)
        .eq("role", "founder");

      if (wsError) throw wsError;

      const workspaceIds = workspaces.map((w) => w.workspace_id);
      if (workspaceIds.length === 0) return [];

      const { data, error } = await supabase
        .from("survey_instances")
        .select(`
          *,
          campaign:survey_campaigns(
            *,
            survey_definition:survey_definitions(*)
          ),
          workspace:workspaces(id, startup_id, startups(name))
        `)
        .in("workspace_id", workspaceIds)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter to only active campaigns
      return (data as unknown as SurveyInstance[]).filter(
        (instance) => instance.campaign?.status === "active"
      );
    },
    enabled: !!user,
  });
}

// Get a specific survey instance with responses
export function useSurveyInstance(instanceId: string | null) {
  return useQuery({
    queryKey: ["survey-instance", instanceId],
    queryFn: async () => {
      if (!instanceId) return null;

      const { data: instance, error: instanceError } = await supabase
        .from("survey_instances")
        .select(`
          *,
          campaign:survey_campaigns(
            *,
            survey_definition:survey_definitions(*)
          ),
          workspace:workspaces(id, startup_id, startups(name))
        `)
        .eq("id", instanceId)
        .single();

      if (instanceError) throw instanceError;

      const { data: responses, error: responsesError } = await supabase
        .from("survey_responses")
        .select("*")
        .eq("instance_id", instanceId);

      if (responsesError) throw responsesError;

      return {
        instance: instance as unknown as SurveyInstance,
        responses: responses as SurveyResponse[],
      };
    },
    enabled: !!instanceId,
  });
}

export interface SurveyWriteBackSummary {
  applied: number;
  skipped: number;
  errors: number;
}

// Save survey responses
export function useSaveSurveyResponses() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      instanceId,
      responses,
      submit = false,
    }: {
      instanceId: string;
      responses: Array<{
        question_id: string;
        response_value?: string;
        response_json?: Json;
        is_auto_filled?: boolean;
      }>;
      submit?: boolean;
    }) => {
      // Upsert responses
      for (const response of responses) {
        const { error } = await supabase.from("survey_responses").upsert(
          {
            instance_id: instanceId,
            question_id: response.question_id,
            response_value: response.response_value,
            response_json: response.response_json,
            is_auto_filled: response.is_auto_filled || false,
          },
          { onConflict: "instance_id,question_id" }
        );

        if (error) throw error;
      }

      // Update instance status
      const updateData: Record<string, unknown> = {
        status: submit ? "submitted" : "in_progress",
      };

      if (submit) {
        updateData.submitted_at = new Date().toISOString();
        updateData.submitted_by = user?.id ?? null;
      }

      const { error: updateError } = await supabase
        .from("survey_instances")
        .update(updateData)
        .eq("id", instanceId);

      if (updateError) throw updateError;

      if (!submit) return { writeBack: null };

      // Feed the platform: answers become KPI values, profile fields and
      // milestones. A failure here must not lose the submitted survey.
      const { data, error: writeBackError } = await invokeWithAuth<SurveyWriteBackSummary>(
        "apply-survey-responses",
        { body: { instance_id: instanceId } }
      );

      if (writeBackError) {
        logger.error('survey_write_back_failed', { instanceId }, writeBackError);
        return { writeBack: null };
      }

      return { writeBack: data };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["survey-instance", variables.instanceId] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });

      if (!variables.submit) {
        toast.success(t('surveys.progressSaved', { defaultValue: 'Progresso guardado' }));
        return;
      }

      // Anything the survey wrote is now visible in the workspace.
      queryClient.invalidateQueries({ queryKey: ["kpi-values"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-kpi-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      queryClient.invalidateQueries({ queryKey: ["survey-writebacks"] });

      const applied = result?.writeBack?.applied ?? 0;
      if (applied > 0) {
        toast.success(t('surveys.submittedWithWriteBack', {
          count: applied,
          defaultValue: 'Inquérito submetido — {{count}} dados atualizados no workspace',
        }));
      } else {
        toast.success(t('surveys.surveySubmitted', { defaultValue: 'Inquérito submetido' }));
      }
    },
    onError: (error) => {
      toast.error("Failed to save survey");
      logger.error('operation_error', {}, error);
    },
  });
}

// What a submitted survey actually wrote into the workspace
export function useCampaignWritebacks(campaignId: string | null) {
  return useQuery({
    queryKey: ["survey-writebacks", campaignId],
    queryFn: async () => {
      if (!campaignId) return [];

      const { data, error } = await supabase
        .from("survey_writebacks")
        .select("*, instance:survey_instances!inner(campaign_id)")
        .eq("instance.campaign_id", campaignId);

      if (error) throw error;
      return (data || []) as unknown as SurveyWriteback[];
    },
    enabled: !!campaignId,
  });
}

// Campaign statistics
export function useCampaignStats(campaignId: string | null) {
  return useQuery({
    queryKey: ["campaign-stats", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;

      const { data, error } = await supabase
        .from("survey_instances")
        .select("status")
        .eq("campaign_id", campaignId);

      if (error) throw error;

      const total = data.length;
      const submitted = data.filter((i) => i.status === "submitted").length;
      const inProgress = data.filter((i) => i.status === "in_progress").length;
      const pending = data.filter((i) => i.status === "pending").length;

      return {
        total,
        submitted,
        inProgress,
        pending,
        completionRate: total > 0 ? Math.round((submitted / total) * 100) : 0,
      };
    },
    enabled: !!campaignId,
  });
}

/**
 * Sends the survey invitation email (in Vítor Ferreira's name) to every startup
 * enrolled in the campaign that has not submitted yet. Recipients without an
 * account get registration instructions and are added to the signup allowlist.
 * Pass `dryRun` to only count recipients.
 */
export function useSendSurveyInvites() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, dryRun }: { campaignId: string; dryRun?: boolean }) => {
      const { data, error } = await invokeWithAuth("send-survey-invites", {
        body: { campaign_id: campaignId, dry_run: dryRun === true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as {
        dry_run?: boolean;
        sent?: number;
        recipients: number;
        registered?: number;
        unregistered?: number;
        skipped: number;
        failures?: { email: string; error: string }[];
      };
    },
    onSuccess: (result, variables) => {
      if (variables.dryRun) return;
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });
      toast.success(
        t("admin.surveys.invitesSent", {
          count: result.sent ?? 0,
          defaultValue: "{{count}} convites enviados",
        }),
      );
      if (result.failures && result.failures.length > 0) {
        logger.warn("survey_invites_partial_failure", { failures: result.failures.length });
      }
    },
    onError: (error: Error) => {
      toast.error(t("admin.surveys.invitesFailed", "Não foi possível enviar os convites"));
      logger.error("survey_invites_error", error);
    },
  });
}
