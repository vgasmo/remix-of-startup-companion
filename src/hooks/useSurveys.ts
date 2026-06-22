import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { notify } from "@/lib/notify";
import { Json } from "@/integrations/supabase/types";
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface SurveyQuestion {
  id: string;
  section: string;
  question: string;
  type: "text" | "number" | "select" | "multiselect" | "rating" | "textarea";
  options?: string[];
  required?: boolean;
  autoFillKey?: string;
  min?: number;
  max?: number;
}

export interface SurveyDefinition {
  id: string;
  name: string;
  description: string | null;
  questions_json: SurveyQuestion[];
  auto_fill_mappings: Record<string, string>;
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
    }) => {
      const { data, error } = await supabase
        .from("survey_definitions")
        .insert({
          name: definition.name,
          description: definition.description,
          questions_json: definition.questions_json as unknown as Json,
          auto_fill_mappings: (definition.auto_fill_mappings || {}) as unknown as Json,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["survey-definitions"] });
      notify.success(t('surveys.templateCreated'));
    },
    onError: (error) => {
      notify.error(t('surveys.templateCreateFailed'));
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
      notify.success(t('surveys.templateUpdated'));
    },
    onError: (error) => {
      notify.error(t('surveys.templateUpdateFailed'));
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
      notify.success(t('surveys.campaignCreated'));
    },
    onError: (error) => {
      notify.error(t('surveys.campaignCreateFailed'));
      logger.error('operation_error', {}, error);
    },
  });
}

export function useLaunchCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      // Get campaign details
      const { data: campaign, error: campaignError } = await supabase
        .from("survey_campaigns")
        .select("*, survey_definition:survey_definitions(*)")
        .eq("id", campaignId)
        .single();

      if (campaignError) throw campaignError;

      // Get all active workspaces (optionally filtered by program)
      let query = supabase
        .from("workspaces")
        .select("id, startup_id, stage, startups(name, founded_date, description)")
        .eq("status", "active");

      if (campaign.program_id) {
        query = query.eq("program_id", campaign.program_id);
      }

      const { data: workspaces, error: workspacesError } = await query;
      if (workspacesError) throw workspacesError;

      // Create survey instances for each workspace with auto-filled data
      const instances = workspaces.map((ws) => {
        // Extract year from founded_date if available
        const foundedYear = ws.startups?.founded_date 
          ? new Date(ws.startups.founded_date).getFullYear() 
          : null;

        const autoFilledData: Json = {
          stage: ws.stage,
          startup_name: ws.startups?.name || null,
          founded_year: foundedYear,
        };

        return {
          campaign_id: campaignId,
          workspace_id: ws.id,
          auto_filled_data: autoFilledData,
          status: "pending" as const,
        };
      });

      if (instances.length > 0) {
        const { error: instancesError } = await supabase
          .from("survey_instances")
          .insert(instances);

        if (instancesError) throw instancesError;
      }

      // Update campaign status to active
      const { error: updateError } = await supabase
        .from("survey_campaigns")
        .update({ status: "active" })
        .eq("id", campaignId);

      if (updateError) throw updateError;

      return { instancesCreated: instances.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });
      notify.success(t('surveys.campaignLaunched', { instancesCreated: data.instancesCreated }));
    },
    onError: (error) => {
      notify.error(t('surveys.campaignLaunchFailed'));
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
      notify.success(t('surveys.campaignClosed'));
    },
    onError: (error) => {
      notify.error(t('surveys.campaignCloseFailed'));
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

// Save survey responses
export function useSaveSurveyResponses() {
  const queryClient = useQueryClient();

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
      }

      const { error: updateError } = await supabase
        .from("survey_instances")
        .update(updateData)
        .eq("id", instanceId);

      if (updateError) throw updateError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["survey-instance", variables.instanceId] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["survey-instances"] });

      if (variables.submit) {
        notify.success(t('surveys.submitted'));
      } else {
        notify.success(t('surveys.progressSaved'));
      }
    },
    onError: (error) => {
      notify.error(t('surveys.saveFailed'));
      logger.error('operation_error', {}, error);
    },
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
