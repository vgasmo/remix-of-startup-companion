import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { getAllStageKeys, getStageLabel, getStageDescription } from '@/lib/kpiAutoGenerator';
import type { DraftStage } from '@/hooks/useProgramSetup';
import type { Database } from '@/integrations/supabase/types';

type StartupStage = Database['public']['Enums']['startup_stage'];

interface WizardStagesStepProps {
  data: DraftStage[];
  onUpdate: (data: DraftStage[]) => void;
}

export function WizardStagesStep({ data, onUpdate }: WizardStagesStepProps) {
  const allStageKeys = getAllStageKeys();

  const buildDefaultStages = (): DraftStage[] =>
    allStageKeys.map((key, idx) => ({
      stage_key: key,
      name: getStageLabel(key),
      description: getStageDescription(key),
      position: idx,
      is_active: true,
    }));

  const [stages, setStages] = useState<DraftStage[]>(() => {
    if (data && data.length > 0) return data;
    return buildDefaultStages();
  });

  // Keep local state in sync with persisted draft (prevents autosave loops)
  useEffect(() => {
    if (!data) return;
    const incoming = data.length > 0 ? data : buildDefaultStages();
    if (JSON.stringify(incoming) !== JSON.stringify(stages)) {
      setStages(incoming);
    }
     
  }, [data]);

  // Debounced update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (JSON.stringify(stages) !== JSON.stringify(data)) {
        onUpdate(stages);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [stages, data, onUpdate]);

  const handleToggle = (stageKey: StartupStage, checked: boolean) => {
    setStages((prev) =>
      prev.map((s) => (s.stage_key === stageKey ? { ...s, is_active: checked } : s))
    );
  };

  const handleFieldChange = (stageKey: StartupStage, field: 'name' | 'description', value: string) => {
    setStages((prev) =>
      prev.map((s) => (s.stage_key === stageKey ? { ...s, [field]: value } : s))
    );
  };

  const moveStage = (stageKey: StartupStage, direction: 'up' | 'down') => {
    setStages((prev) => {
      const ordered = [...prev].sort((a, b) => a.position - b.position);
      const idx = ordered.findIndex((s) => s.stage_key === stageKey);
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || newIdx < 0 || newIdx >= ordered.length) return prev;

      const swapped = [...ordered];
      [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];

      const normalized = swapped.map((s, i) => ({ ...s, position: i }));
      return normalized;
    });
  };

  const sortedStages = [...stages].sort((a, b) => a.position - b.position);
  const activeCount = stages.filter((s) => s.is_active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Enable and configure the stages for your program.
        </p>
        <Badge variant={activeCount > 0 ? 'default' : 'destructive'}>
          {activeCount} active
        </Badge>
      </div>

      <div className="space-y-3">
        {sortedStages.map((stage, idx) => (
          <div
            key={stage.stage_key}
            className={`p-4 border rounded-lg transition-colors ${
              stage.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Drag handle / Reorder */}
              <div className="flex flex-col gap-1 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => moveStage(stage.stage_key, 'up')}
                  disabled={idx === 0}
                 aria-label="Collapse">
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => moveStage(stage.stage_key, 'down')}
                  disabled={idx === sortedStages.length - 1}
                 aria-label="Expand">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Toggle */}
              <div className="pt-2">
                <Switch
                  checked={stage.is_active}
                  onCheckedChange={(checked) => handleToggle(stage.stage_key, checked)}
                />
              </div>

              {/* Content */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {stage.stage_key}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Position: {stage.position + 1}</span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome a apresentar</Label>
                    <Input
                      value={stage.name}
                      onChange={(e) => handleFieldChange(stage.stage_key, 'name', e.target.value)}
                      disabled={!stage.is_active}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={stage.description || ''}
                      onChange={(e) => handleFieldChange(stage.stage_key, 'description', e.target.value)}
                      disabled={!stage.is_active}
                      rows={1}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}