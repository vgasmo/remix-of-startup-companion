import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

export interface DocumentReview {
  id: string;
  document_id: string;
  workspace_id: string;
  reviewer_id: string;
  score_problem_solution: number | null;
  score_market: number | null;
  score_business_model: number | null;
  score_team: number | null;
  score_traction: number | null;
  score_design_clarity: number | null;
  comments: string | null;
  ai_analysis_json: any;
  ai_analyzed_at: string | null;
  approval_status: 'pending' | 'needs_revision' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  reviewer?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function useDocumentReviews(documentId: string | undefined) {
  return useQuery({
    queryKey: ['document-reviews', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await supabase
        .from('document_reviews')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch reviewer profiles
      const reviewerIds = [...new Set((data || []).map(r => r.reviewer_id))];
      let reviewers: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {};
      if (reviewerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name, avatar_url')
          .in('id', reviewerIds);
        if (profiles) {
          reviewers = Object.fromEntries(profiles.map(p => [p.id, p]));
        }
      }

      return (data || []).map(r => ({
        ...r,
        reviewer: reviewers[r.reviewer_id] || null,
      })) as DocumentReview[];
    },
    enabled: !!documentId,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (review: {
      document_id: string;
      workspace_id: string;
      reviewer_id: string;
      score_problem_solution?: number;
      score_market?: number;
      score_business_model?: number;
      score_team?: number;
      score_traction?: number;
      score_design_clarity?: number;
      comments?: string;
      ai_analysis_json?: any;
      ai_analyzed_at?: string;
      approval_status?: string;
    }) => {
      const { data, error } = await supabase
        .from('document_reviews')
        .insert(review)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document-reviews', data.document_id] });
    },
  });
}

export function useUpdateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, documentId, ...updates }: {
      id: string;
      documentId: string;
      score_problem_solution?: number;
      score_market?: number;
      score_business_model?: number;
      score_team?: number;
      score_traction?: number;
      score_design_clarity?: number;
      comments?: string;
      ai_analysis_json?: any;
      ai_analyzed_at?: string;
      approval_status?: string;
    }) => {
      const { data, error } = await supabase
        .from('document_reviews')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['document-reviews', variables.documentId] });
    },
  });
}

export function useAnalyzePitchDeck() {
  return useMutation({
    mutationFn: async ({ documentId, workspaceId }: { documentId: string; workspaceId: string }) => {
      const { data, error } = await invokeWithAuth('analyze-pitch-deck', {
        body: { document_id: documentId, workspace_id: workspaceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.analysis;
    },
  });
}
