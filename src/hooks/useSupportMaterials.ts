import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export const SUPPORT_MATERIALS_BUCKET = 'support-materials';

export interface SupportMaterial {
  id: string;
  title: string;
  description: string | null;
  startup_type: string | null;
  startup_stage: string | null;
  category: string | null;
  content_markdown: string | null;
  external_links: Array<{ title: string; url: string }>;
  file_path: string | null;
  tags: string[];
  status: 'draft' | 'approved';
  owner_user_id: string | null;
  program_id: string | null;
  attach_to_proposal: boolean;
  created_at: string;
  updated_at: string;
}

export function useSupportMaterials(filters?: {
  startupType?: string;
  startupStage?: string;
  category?: string;
  programId?: string;
  /** When true, requires program_id = programId (excludes globals). */
  requireProgram?: boolean;
}) {
  return useQuery({
    queryKey: ['support-materials', filters],
    queryFn: async () => {
      let query = supabase
        .from('support_materials')
        .select('*')
        .eq('status', 'approved') // Only show approved materials
        .order('title');

      if (filters?.startupType) {
        query = query.eq('startup_type', filters.startupType);
      }
      if (filters?.startupStage) {
        query = query.eq('startup_stage', filters.startupStage);
      }
      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.programId) {
        if (filters.requireProgram) {
          query = query.eq('program_id', filters.programId);
        } else {
          // Include globals (program_id IS NULL) OR materials of this program
          query = query.or(`program_id.is.null,program_id.eq.${filters.programId}`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as SupportMaterial[];
    },
  });
}

/**
 * Upload a file to the support-materials bucket.
 * Convention: <program_id|'global'>/<material_id>/<filename>
 */
export function useUploadSupportMaterialFile() {
  return useMutation({
    mutationFn: async ({
      file,
      programId,
      materialId,
    }: {
      file: File;
      programId: string | null;
      materialId: string;
    }) => {
      const folder = programId ?? 'global';
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${folder}/${materialId}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage
        .from(SUPPORT_MATERIALS_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      return path;
    },
  });
}

/** Get a short-lived signed URL for downloading a support material file. */
export function useSupportMaterialDownloadUrl() {
  return useMutation({
    mutationFn: async (filePath: string) => {
      const { data, error } = await supabase.storage
        .from(SUPPORT_MATERIALS_BUCKET)
        .createSignedUrl(filePath, 60 * 5);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useSupportMaterial(id: string | undefined) {
  return useQuery({
    queryKey: ['support-material', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('support_materials')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as SupportMaterial | null;
    },
    enabled: !!id,
  });
}

export function useCreateSupportMaterial() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (material: Partial<SupportMaterial>) => {
      const insertData = {
        title: material.title || '',
        description: material.description,
        startup_type: material.startup_type,
        startup_stage: material.startup_stage,
        category: material.category,
        content_markdown: material.content_markdown,
        external_links: material.external_links as unknown as Record<string, unknown>[],
        file_path: material.file_path,
        tags: material.tags,
        status: material.status,
        owner_user_id: user?.id,
        program_id: material.program_id,
      };
      const { data, error } = await supabase
        .from('support_materials')
        .insert(insertData as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as SupportMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-materials'] });
    },
  });
}

export function useUpdateSupportMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SupportMaterial> & { id: string }) => {
      const { data, error } = await supabase
        .from('support_materials')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['support-materials'] });
      queryClient.invalidateQueries({ queryKey: ['support-material', variables.id] });
    },
  });
}

export function useDeleteSupportMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('support_materials')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-materials'] });
    },
  });
}
