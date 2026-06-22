import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export interface ProgramSettings {
  enable_kpis: boolean;
  enable_health: boolean;
  enable_milestones: boolean;
  enable_alerts: boolean;
  enable_playbooks: boolean;
  enable_financial_model: boolean;
  program_mode: 'standard' | 'basic';
}

const DEFAULT_SETTINGS: ProgramSettings = {
  enable_kpis: true,
  enable_health: true,
  enable_milestones: true,
  enable_alerts: true,
  enable_playbooks: true,
  enable_financial_model: true,
  program_mode: 'standard',
};

export function useProgramSettings(programId: string | undefined) {
  return useQuery({
    queryKey: ['program-settings', programId],
    queryFn: async () => {
      if (!programId) return DEFAULT_SETTINGS;

      const { data, error } = await supabase
        .from('programs')
        .select('settings_json')
        .eq('id', programId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to fetch program settings', {}, error);
        return DEFAULT_SETTINGS;
      }

      const settings = data?.settings_json as Partial<ProgramSettings> | null;
      
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
      };
    },
    enabled: !!programId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

export function isBasicMode(settings: ProgramSettings | undefined): boolean {
  return settings?.program_mode === 'basic';
}
