import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Star, ArrowUp, Minus, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PriorityBadge, type WorkspacePriority } from '@/components/ui/PriorityBadge';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface PrioritySelectorProps {
  workspaceId: string;
  currentPriority: WorkspacePriority;
  currentNotes?: string | null;
}

const priorities: { value: WorkspacePriority; labelKey: string; descKey: string; icon: React.ReactNode }[] = [
  { 
    value: 'star', 
    labelKey: 'priorities.star', 
    descKey: 'priorities.starDesc',
    icon: <Star className="h-4 w-4 text-[hsl(var(--warning))] fill-yellow-500" />
  },
  { 
    value: 'high', 
    labelKey: 'priorities.high', 
    descKey: 'priorities.highDesc',
    icon: <ArrowUp className="h-4 w-4 text-[hsl(var(--info))]" />
  },
  { 
    value: 'standard', 
    labelKey: 'priorities.standard', 
    descKey: 'priorities.standardDesc',
    icon: <Minus className="h-4 w-4 text-muted-foreground" />
  },
  { 
    value: 'maintenance', 
    labelKey: 'priorities.maintenance', 
    descKey: 'priorities.maintenanceDesc',
    icon: <Archive className="h-4 w-4 text-muted-foreground/60" />
  },
];

export function PrioritySelector({ 
  workspaceId, 
  currentPriority, 
  currentNotes 
}: PrioritySelectorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<WorkspacePriority>(currentPriority || 'standard');
  const [notes, setNotes] = useState(currentNotes || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('workspaces')
        .update({
          priority_level: selectedPriority,
          priority_notes: notes || null,
          priority_set_at: new Date().toISOString(),
          priority_set_by: user.id,
        })
        .eq('id', workspaceId);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        workspace_id: workspaceId,
        entity_type: 'workspace',
        entity_id: workspaceId,
        action: 'priority_changed',
        metadata: {
          from: currentPriority || 'standard',
          to: selectedPriority,
          notes: notes || null,
        },
      });

      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      
      notify.success(t('priority.updated'));
      setIsOpen(false);
    } catch (error) {
      logger.error('Failed to update priority', {}, error);
      notify.error(t('priority.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity">
          <PriorityBadge priority={currentPriority} size="md" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm">{t('priority.setLevel')}</h4>
          </div>
          
          <div className="grid gap-2">
            {priorities.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedPriority(p.value)}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border text-left transition-all",
                  selectedPriority === p.value 
                    ? "border-primary bg-primary/5" 
                    : "border-transparent hover:bg-muted/50"
                )}
              >
                {p.icon}
                <div>
                  <div className="text-sm font-medium">{t(p.labelKey)}</div>
                  <div className="text-xs text-muted-foreground">{t(p.descKey)}</div>
                </div>
              </button>
            ))}
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">{t('priority.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('priority.notesPlaceholder')}
              className="h-20 text-sm"
            />
          </div>
          
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full"
            size="sm"
          >
            {isSaving ? t('common.saving', { defaultValue: 'A guardar...' }) : t('common.save', { defaultValue: 'Guardar' })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
