import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface KeyMetrics {
  runway_months: number | null;
  burn_rate_monthly: number | null;
  gross_margin_pct: number | null;
  cac: number | null;
  churn_monthly_pct: number | null;
  ltv: number | null;
  ltv_cac: number | null;
  payback_months: number | null;
  cash_end: number | null;
  treasury_need: number | null;
}

export interface AIReview {
  summary: string;
  questions: { q: string; why: string }[];
  risks: { risk: string; severity: 'low' | 'medium' | 'high'; mitigation: string }[];
  recommended_actions: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    due_in_days: number;
    owner_hint: 'founder' | 'staff';
  }[];
  next_session_agenda: string[];
  investor_narrative: string;
}

export interface FinancialModelVersion {
  id: string;
  workspace_id: string;
  document_id: string;
  scenario_name: string;
  uploaded_by: string | null;
  uploaded_at: string;
  status: 'uploaded' | 'parsing' | 'parsed' | 'failed';
  parse_error: string | null;
  key_metrics_json: KeyMetrics | null;
  ai_review_json: AIReview | null;
  ai_review_generated_at: string | null;
  ai_review_generated_by: string | null;
  created_at: string;
  document?: {
    id: string;
    name: string;
    file_path: string | null;
  };
  uploader?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface FinancialInsight {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  suggested_action?: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    due_in_days: number;
    owner_hint: 'founder' | 'staff';
  };
}

// Generate rule-based insights from metrics
export function generateInsights(metrics: KeyMetrics): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  // Runway analysis
  if (metrics.runway_months !== null) {
    if (metrics.runway_months < 3) {
      insights.push({
        title: 'Critical Runway Warning',
        description: `Only ${metrics.runway_months} months of runway remaining. Immediate action required.`,
        severity: 'critical',
        category: 'cash_management',
        suggested_action: {
          title: 'Activate emergency fundraising or cost reduction',
          description: 'Runway is critically low. Consider bridge financing, cutting non-essential costs, or accelerating revenue.',
          priority: 'urgent',
          due_in_days: 3,
          owner_hint: 'founder',
        },
      });
    } else if (metrics.runway_months < 6) {
      insights.push({
        title: 'Low Runway Alert',
        description: `${metrics.runway_months} months runway. Start fundraising preparations now.`,
        severity: 'warning',
        category: 'cash_management',
        suggested_action: {
          title: 'Begin fundraising preparation',
          description: 'Start updating pitch deck, financial projections, and investor outreach list.',
          priority: 'high',
          due_in_days: 7,
          owner_hint: 'founder',
        },
      });
    } else if (metrics.runway_months >= 18) {
      insights.push({
        title: 'Healthy Runway',
        description: `${metrics.runway_months} months runway provides good buffer for growth initiatives.`,
        severity: 'info',
        category: 'cash_management',
      });
    }
  }

  // LTV/CAC analysis
  if (metrics.ltv_cac !== null) {
    if (metrics.ltv_cac < 1) {
      insights.push({
        title: 'Negative Unit Economics',
        description: `LTV/CAC ratio of ${metrics.ltv_cac.toFixed(1)}x means you're losing money on each customer.`,
        severity: 'critical',
        category: 'unit_economics',
        suggested_action: {
          title: 'Fix unit economics urgently',
          description: 'Reduce CAC through better targeting/channels, or increase LTV through pricing/retention improvements.',
          priority: 'urgent',
          due_in_days: 7,
          owner_hint: 'founder',
        },
      });
    } else if (metrics.ltv_cac < 3) {
      insights.push({
        title: 'Unit Economics Need Improvement',
        description: `LTV/CAC of ${metrics.ltv_cac.toFixed(1)}x is below the 3x benchmark for sustainable growth.`,
        severity: 'warning',
        category: 'unit_economics',
        suggested_action: {
          title: 'Optimize CAC or improve retention',
          description: 'Target 3x LTV/CAC ratio. Analyze customer segments for higher-value opportunities.',
          priority: 'medium',
          due_in_days: 14,
          owner_hint: 'founder',
        },
      });
    } else {
      insights.push({
        title: 'Strong Unit Economics',
        description: `LTV/CAC of ${metrics.ltv_cac.toFixed(1)}x indicates healthy customer economics.`,
        severity: 'info',
        category: 'unit_economics',
      });
    }
  }

  // Gross margin analysis
  if (metrics.gross_margin_pct !== null) {
    if (metrics.gross_margin_pct < 40) {
      insights.push({
        title: 'Low Gross Margin',
        description: `${metrics.gross_margin_pct.toFixed(0)}% gross margin limits scalability and investment potential.`,
        severity: 'warning',
        category: 'profitability',
        suggested_action: {
          title: 'Improve gross margins',
          description: 'Review pricing strategy, reduce COGS, or pivot to higher-margin offerings.',
          priority: 'medium',
          due_in_days: 30,
          owner_hint: 'founder',
        },
      });
    } else if (metrics.gross_margin_pct >= 70) {
      insights.push({
        title: 'Excellent Gross Margin',
        description: `${metrics.gross_margin_pct.toFixed(0)}% gross margin provides strong foundation for scaling.`,
        severity: 'info',
        category: 'profitability',
      });
    }
  }

  // Payback period analysis
  if (metrics.payback_months !== null) {
    if (metrics.payback_months > 18) {
      insights.push({
        title: 'Long Payback Period',
        description: `${metrics.payback_months} month payback requires significant upfront capital.`,
        severity: 'warning',
        category: 'unit_economics',
        suggested_action: {
          title: 'Reduce CAC payback time',
          description: 'Aim for <12 month payback. Consider upfront payments, annual plans, or CAC reduction.',
          priority: 'medium',
          due_in_days: 21,
          owner_hint: 'founder',
        },
      });
    } else if (metrics.payback_months > 12) {
      insights.push({
        title: 'Payback Period Needs Attention',
        description: `${metrics.payback_months} month payback is acceptable but could be improved.`,
        severity: 'info',
        category: 'unit_economics',
      });
    }
  }

  // Churn analysis
  if (metrics.churn_monthly_pct !== null) {
    if (metrics.churn_monthly_pct > 10) {
      insights.push({
        title: 'High Monthly Churn',
        description: `${metrics.churn_monthly_pct.toFixed(1)}% monthly churn severely impacts LTV.`,
        severity: 'critical',
        category: 'retention',
        suggested_action: {
          title: 'Address churn immediately',
          description: 'Conduct churn analysis, implement retention programs, improve onboarding.',
          priority: 'urgent',
          due_in_days: 7,
          owner_hint: 'founder',
        },
      });
    } else if (metrics.churn_monthly_pct > 5) {
      insights.push({
        title: 'Elevated Churn Rate',
        description: `${metrics.churn_monthly_pct.toFixed(1)}% monthly churn needs improvement.`,
        severity: 'warning',
        category: 'retention',
        suggested_action: {
          title: 'Implement churn reduction program',
          description: 'Target <5% monthly churn through improved product, support, and engagement.',
          priority: 'high',
          due_in_days: 14,
          owner_hint: 'founder',
        },
      });
    }
  }

  // Burn rate context
  if (metrics.burn_rate_monthly !== null && metrics.burn_rate_monthly > 0) {
    insights.push({
      title: 'Monthly Burn Rate',
      description: `Current burn rate: €${metrics.burn_rate_monthly.toLocaleString()}/month`,
      severity: 'info',
      category: 'cash_management',
    });
  }

  return insights;
}

// Fetch versions for a workspace
export function useFinancialModelVersions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['financial-model-versions', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from('financial_model_versions')
        .select('*, documents(id, name, file_path)')
        .eq('workspace_id', workspaceId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      // Fetch uploader profiles
      const uploaderIds = [...new Set(data?.map(v => v.uploaded_by).filter(Boolean) as string[])];
      let uploaders: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {};

      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name, avatar_url')
          .in('id', uploaderIds);

        if (profiles) {
          uploaders = Object.fromEntries(profiles.map(p => [p.id, p]));
        }
      }

      return (data || []).map(v => ({
        ...v,
        key_metrics_json: v.key_metrics_json as unknown as KeyMetrics | null,
        ai_review_json: v.ai_review_json as unknown as AIReview | null,
        uploader: v.uploaded_by ? uploaders[v.uploaded_by] || null : null,
      })) as FinancialModelVersion[];
    },
    enabled: !!workspaceId,
  });
}

// Create a new version after document upload
export function useCreateFinancialModelVersion(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, scenarioName = 'Base' }: { documentId: string; scenarioName?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('financial_model_versions')
        .insert({
          workspace_id: workspaceId,
          document_id: documentId,
          scenario_name: scenarioName,
          uploaded_by: user.id,
          status: 'uploaded',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-model-versions', workspaceId] });
    },
    onError: (error) => {
      notify.error(t('financial.failedToCreateVersion', { message: error.message }));
    },
  });
}

// Parse financial model
export function useParseFinancialModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await invokeWithAuth('import-financial-model', {
        body: { version_id: versionId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error((data as any)?.error || 'Parse failed');
      return data;
    },
    onSuccess: (_, versionId) => {
      queryClient.invalidateQueries({ queryKey: ['financial-model-versions'] });
      notify.success(t('financial.financialModelParsedSuccessfully'));
    },
    onError: (error) => {
      notify.error(t('financial.failedToParse', { message: error.message }));
    },
  });
}

// Sync KPIs from parsed metrics
export function useSyncFinancialKpis(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await invokeWithAuth('sync-financial-kpis', {
        body: { version_id: versionId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Sync failed');
      return data.result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpi-values', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-kpis', workspaceId] });
      notify.success(t('financial.synced', { length: result.synced.length }));
    },
    onError: (error) => {
      notify.error(t('financial.failedToSync', { message: error.message }));
    },
  });
}

// Generate AI review
export function useGenerateFinancialModelReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ versionId, mode = 'full' }: { versionId: string; mode?: 'full' | 'investor' | 'mentor_prep' }) => {
      const { data, error } = await invokeWithAuth('generate-financial-model-coach', {
        body: { version_id: versionId, mode },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Review generation failed');
      return data.review as AIReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-model-versions'] });
      notify.success(t('financial.aiReviewGenerated'));
    },
    onError: (error) => {
      notify.error(t('financial.aiReviewFailed', { message: error.message }));
    },
  });
}

// Create actions from insights
export function useCreateActionsFromInsights(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insights: FinancialInsight[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const actionsToCreate = insights
        .filter(i => i.suggested_action)
        .map(i => {
          const action = i.suggested_action!;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + action.due_in_days);

          return {
            workspace_id: workspaceId,
            title: action.title,
            description: action.description,
            priority: action.priority,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pending' as const,
            created_by: user.id,
          };
        });

      if (actionsToCreate.length === 0) {
        return { count: 0 };
      }

      const { data, error } = await supabase
        .from('action_items')
        .insert(actionsToCreate)
        .select();

      if (error) throw error;
      return { count: data?.length || 0 };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      notify.success(t('financial.created', { count: result.count }));
    },
    onError: (error) => {
      notify.error(t('financial.failedToCreateActions', { message: error.message }));
    },
  });
}

// Create actions from AI review
export function useCreateActionsFromAIReview(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recommendedActions: AIReview['recommended_actions']) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const actionsToCreate = recommendedActions.map(action => {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + action.due_in_days);

        return {
          workspace_id: workspaceId,
          title: action.title,
          description: action.description,
          priority: action.priority,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending' as const,
          created_by: user.id,
        };
      });

      if (actionsToCreate.length === 0) {
        return { count: 0 };
      }

      const { data, error } = await supabase
        .from('action_items')
        .insert(actionsToCreate)
        .select();

      if (error) throw error;
      return { count: data?.length || 0 };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      notify.success(t('financial.created', { count: result.count }));
    },
    onError: (error) => {
      notify.error(t('financial.failedToCreateActions', { message: error.message }));
    },
  });
}

// Set active version
export function useSetActiveFinancialVersion(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string | null) => {
      const { error } = await supabase
        .from('workspaces')
        .update({ active_financial_model_version_id: versionId })
        .eq('id', workspaceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      notify.success(t('financial.activeVersionUpdated'));
    },
  });
}
