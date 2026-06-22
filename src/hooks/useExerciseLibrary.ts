import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface Exercise {
  id: string;
  title: string;
  purpose: string | null;
  startup_context_tags: string[];
  duration_minutes: number;
  group_size: '1:1' | 'small_group' | 'cohort';
  materials_needed: string[];
  step_by_step: Array<{ step: number; title: string; description: string; duration?: number }>;
  facilitator_tips: string | null;
  success_criteria: string | null;
  common_pitfalls: string | null;
  variations: string | null;
  status: 'draft' | 'approved';
  owner_user_id: string | null;
  program_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  order_index: number;
  notes: string | null;
  created_at: string;
  exercise?: Exercise;
}

export function useExerciseLibrary(filters?: { tags?: string[]; groupSize?: string; status?: string }) {
  return useQuery({
    queryKey: ['exercise-library', filters],
    queryFn: async () => {
      let query = supabase
        .from('exercise_library')
        .select('*')
        .order('title');

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.groupSize) {
        query = query.eq('group_size', filters.groupSize);
      }

      const { data, error } = await query;
      if (error) throw error;

      let exercises = data as Exercise[];

      // Filter by tags if provided
      if (filters?.tags && filters.tags.length > 0) {
        exercises = exercises.filter(ex =>
          filters.tags!.some(tag => ex.startup_context_tags.includes(tag))
        );
      }

      return exercises;
    },
  });
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: ['exercise', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('exercise_library')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Exercise | null;
    },
    enabled: !!id,
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (exercise: Partial<Exercise>) => {
      const insertData = {
        title: exercise.title || '',
        purpose: exercise.purpose,
        startup_context_tags: exercise.startup_context_tags,
        duration_minutes: exercise.duration_minutes,
        group_size: exercise.group_size,
        materials_needed: exercise.materials_needed,
        step_by_step: exercise.step_by_step as unknown as Record<string, unknown>[],
        facilitator_tips: exercise.facilitator_tips,
        success_criteria: exercise.success_criteria,
        common_pitfalls: exercise.common_pitfalls,
        variations: exercise.variations,
        status: exercise.status,
        owner_user_id: user?.id,
        program_id: exercise.program_id,
      };
      const { data, error } = await supabase
        .from('exercise_library')
        .insert(insertData as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Exercise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-library'] });
    },
  });
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Exercise> & { id: string }) => {
      const updateData: Record<string, unknown> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.purpose !== undefined) updateData.purpose = updates.purpose;
      if (updates.startup_context_tags !== undefined) updateData.startup_context_tags = updates.startup_context_tags;
      if (updates.duration_minutes !== undefined) updateData.duration_minutes = updates.duration_minutes;
      if (updates.group_size !== undefined) updateData.group_size = updates.group_size;
      if (updates.materials_needed !== undefined) updateData.materials_needed = updates.materials_needed;
      if (updates.step_by_step !== undefined) updateData.step_by_step = updates.step_by_step as unknown as Record<string, unknown>[];
      if (updates.facilitator_tips !== undefined) updateData.facilitator_tips = updates.facilitator_tips;
      if (updates.success_criteria !== undefined) updateData.success_criteria = updates.success_criteria;
      if (updates.common_pitfalls !== undefined) updateData.common_pitfalls = updates.common_pitfalls;
      if (updates.variations !== undefined) updateData.variations = updates.variations;
      if (updates.status !== undefined) updateData.status = updates.status;

      const { data, error } = await supabase
        .from('exercise_library')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Exercise;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['exercise-library'] });
      queryClient.invalidateQueries({ queryKey: ['exercise', variables.id] });
    },
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('exercise_library')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise-library'] });
    },
  });
}

// Session exercises
export function useSessionExercises(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-exercises', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from('session_exercises')
        .select(`
          *,
          exercise:exercise_library(*)
        `)
        .eq('session_id', sessionId)
        .order('order_index');
      if (error) throw error;
      return data as (SessionExercise & { exercise: Exercise })[];
    },
    enabled: !!sessionId,
  });
}

export function useAddSessionExercise(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ exerciseId, notes }: { exerciseId: string; notes?: string }) => {
      // Get current max order
      const { data: existing } = await supabase
        .from('session_exercises')
        .select('order_index')
        .eq('session_id', sessionId)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

      const { data, error } = await supabase
        .from('session_exercises')
        .insert({
          session_id: sessionId,
          exercise_id: exerciseId,
          order_index: nextOrder,
          notes,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

export function useRemoveSessionExercise(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('session_exercises')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

export function useUpdateSessionExercise(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from('session_exercises')
        .update({ notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}
