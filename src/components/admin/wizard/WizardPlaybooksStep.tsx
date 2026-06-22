import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Target, ListTodo, GripVertical } from 'lucide-react';
import { getStageLabel } from '@/lib/kpiAutoGenerator';
import { supabase } from '@/lib/supabaseClient';
import type { DraftStage, DraftPlaybook, DraftPlaybookItem } from '@/hooks/useProgramSetup';
import type { Database } from '@/integrations/supabase/types';

type StartupStage = Database['public']['Enums']['startup_stage'];

interface WizardPlaybooksStepProps {
  stages: DraftStage[];
  playbooks: DraftPlaybook[];
  onUpdate: (playbooks: DraftPlaybook[]) => void;
}

function createEmptyPlaybook(stage: DraftStage): DraftPlaybook {
  return {
    stage_key: stage.stage_key,
    title: `${stage.name || getStageLabel(stage.stage_key)} Playbook`,
    description: '',
    items: [],
  };
}

function mapTemplateToDraft(template: {
  stage: StartupStage;
  title: string;
  description: string | null;
  items?: unknown;
}): DraftPlaybook {
  return {
    stage_key: template.stage,
    title: template.title,
    description: template.description || '',
    items: ((template.items as DraftPlaybookItem[]) || [])
      .map((item) => ({
        item_type: item.item_type,
        title: item.title,
        description: item.description,
        relative_due_days: item.relative_due_days,
        priority: item.priority,
        order_index: item.order_index,
        default_owner_role: item.default_owner_role,
        metadata_json: item.metadata_json,
      }))
      .sort((a, b) => a.order_index - b.order_index),
  };
}

export function WizardPlaybooksStep({ stages, playbooks, onUpdate }: WizardPlaybooksStepProps) {
  const { t } = useTranslation();
  const activeStages = stages.filter((s) => s.is_active);

  // Initialize playbooks for each active stage if empty
  const [localPlaybooks, setLocalPlaybooks] = useState<DraftPlaybook[]>(() => {
    return activeStages.map(
      (stage) => playbooks.find((playbook) => playbook.stage_key === stage.stage_key) || createEmptyPlaybook(stage)
    );
  });

  useEffect(() => {
    setLocalPlaybooks((prev) => {
      const synced = activeStages.map((stage) => {
        return (
          prev.find((playbook) => playbook.stage_key === stage.stage_key) ||
          playbooks.find((playbook) => playbook.stage_key === stage.stage_key) ||
          createEmptyPlaybook(stage)
        );
      });

      return JSON.stringify(prev) === JSON.stringify(synced) ? prev : synced;
    });
  }, [activeStages, playbooks]);

  useEffect(() => {
    const missingStageKeys = activeStages
      .map((stage) => stage.stage_key)
      .filter((stageKey) => !playbooks.some((playbook) => playbook.stage_key === stageKey));

    if (missingStageKeys.length === 0) return;

    let cancelled = false;

    const loadMissingTemplates = async () => {
      const { data, error } = await supabase
        .from('playbooks')
        .select('stage, title, description, items:playbook_items(*)')
        .is('program_id', null)
        .eq('is_active', true)
        .in('stage', missingStageKeys);

      if (error || cancelled || !data?.length) return;

      const templatesByStage = new Map(
        data.map((template) => [template.stage as StartupStage, mapTemplateToDraft(template as never)])
      );

      setLocalPlaybooks((prev) => {
        const next = activeStages.map((stage) => {
          return (
            prev.find((playbook) => playbook.stage_key === stage.stage_key) ||
            playbooks.find((playbook) => playbook.stage_key === stage.stage_key) ||
            templatesByStage.get(stage.stage_key) ||
            createEmptyPlaybook(stage)
          );
        });

        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    };

    void loadMissingTemplates();

    return () => {
      cancelled = true;
    };
  }, [activeStages, playbooks]);

  // Debounced update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (JSON.stringify(localPlaybooks) !== JSON.stringify(playbooks)) {
        onUpdate(localPlaybooks);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localPlaybooks, playbooks, onUpdate]);

  const handlePlaybookChange = (stageKey: StartupStage, field: 'title' | 'description', value: string) => {
    setLocalPlaybooks((prev) =>
      prev.map((p) => (p.stage_key === stageKey ? { ...p, [field]: value } : p))
    );
  };

  const handleAddItem = (stageKey: StartupStage, type: 'milestone' | 'action') => {
    const playbook = localPlaybooks.find((p) => p.stage_key === stageKey);
    const newItem: DraftPlaybookItem = {
      item_type: type,
      title: '',
      description: '',
      relative_due_days: type === 'milestone' ? 14 : 7,
      priority: 'medium',
      order_index: playbook?.items.length || 0,
    };

    setLocalPlaybooks((prev) =>
      prev.map((p) =>
        p.stage_key === stageKey ? { ...p, items: [...p.items, newItem] } : p
      )
    );
  };

  const handleItemChange = (
    stageKey: StartupStage,
    itemIndex: number,
    field: keyof DraftPlaybookItem,
    value: unknown
  ) => {
    setLocalPlaybooks((prev) =>
      prev.map((p) =>
        p.stage_key === stageKey
          ? {
              ...p,
              items: p.items.map((item, i) =>
                i === itemIndex ? { ...item, [field]: value } : item
              ),
            }
          : p
      )
    );
  };

  const handleRemoveItem = (stageKey: StartupStage, itemIndex: number) => {
    setLocalPlaybooks((prev) =>
      prev.map((p) =>
        p.stage_key === stageKey
          ? { ...p, items: p.items.filter((_, i) => i !== itemIndex) }
          : p
      )
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t('wizard.configurePlaybooks')}
      </p>

      <Tabs defaultValue={activeStages[0]?.stage_key} className="w-full">
        <TabsList className="flex-wrap h-auto">
          {activeStages.map((stage) => {
            const playbook = localPlaybooks.find((p) => p.stage_key === stage.stage_key);
            const itemCount = playbook?.items.length || 0;
            return (
              <TabsTrigger key={stage.stage_key} value={stage.stage_key} className="gap-1">
                {stage.name || getStageLabel(stage.stage_key)}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {itemCount}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {activeStages.map((stage) => {
          const playbook = localPlaybooks.find((p) => p.stage_key === stage.stage_key);
          if (!playbook) return null;

          const milestones = playbook.items.filter((i) => i.item_type === 'milestone');
          const actions = playbook.items.filter((i) => i.item_type === 'action');

          return (
            <TabsContent key={stage.stage_key} value={stage.stage_key} className="mt-4 space-y-4">
              {/* Playbook Header */}
              <Card>
                <CardContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t('wizard.playbookTitle')}</Label>
                      <Input
                        value={playbook.title}
                        onChange={(e) =>
                          handlePlaybookChange(stage.stage_key, 'title', e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('wizard.description')}</Label>
                      <Textarea
                        value={playbook.description || ''}
                        onChange={(e) =>
                          handlePlaybookChange(stage.stage_key, 'description', e.target.value)
                        }
                        rows={1}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Items */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Milestones */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      {t('milestones.title')} ({milestones.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {playbook.items.map((item, idx) => {
                          if (item.item_type !== 'milestone') return null;
                          return (
                            <div
                              key={idx}
                              className="p-2 border rounded bg-muted/30 space-y-2"
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <Input
                                  value={item.title}
                                  onChange={(e) =>
                                    handleItemChange(stage.stage_key, idx, 'title', e.target.value)
                                  }
                                  className="h-7 text-sm"
                                  placeholder={t('wizard.milestoneTitlePlaceholder')}
                                />
                                <Input
                                  type="number"
                                  value={item.relative_due_days || ''}
                                  onChange={(e) =>
                                    handleItemChange(stage.stage_key, idx, 'relative_due_days', Number(e.target.value))
                                  }
                                  className="h-7 w-16 text-sm"
                                  placeholder={t('wizard.daysPlaceholder')}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() = aria-label={t('common.delete')}> handleRemoveItem(stage.stage_key, idx)}
                                 aria-label={t('common.delete')}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleAddItem(stage.stage_key, 'milestone')}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t('milestones.addMilestone')}
                        </Button>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Actions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ListTodo className="h-4 w-4 text-muted-foreground" />
                      {t('actions.title')} ({actions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {playbook.items.map((item, idx) => {
                          if (item.item_type !== 'action') return null;
                          return (
                            <div
                              key={idx}
                              className="p-2 border rounded bg-muted/30 space-y-2"
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <Input
                                  value={item.title}
                                  onChange={(e) =>
                                    handleItemChange(stage.stage_key, idx, 'title', e.target.value)
                                  }
                                  className="h-7 text-sm flex-1"
                                  placeholder={t('wizard.actionTitlePlaceholder')}
                                />
                                <Select
                                  value={item.priority || 'medium'}
                                  onValueChange={(v) =>
                                    handleItemChange(stage.stage_key, idx, 'priority', v)
                                  }
                                >
                                  <SelectTrigger className="h-7 w-20 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">{t('wizard.low')}</SelectItem>
                                    <SelectItem value="medium">{t('wizard.med')}</SelectItem>
                                    <SelectItem value="high">{t('wizard.high')}</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  value={item.relative_due_days || ''}
                                  onChange={(e) =>
                                    handleItemChange(stage.stage_key, idx, 'relative_due_days', Number(e.target.value))
                                  }
                                  className="h-7 w-14 text-sm"
                                   placeholder={t('wizard.daysPlaceholder')}
                                 />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() = aria-label={t('common.delete')}> handleRemoveItem(stage.stage_key, idx)}
                                 aria-label={t('common.delete')}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleAddItem(stage.stage_key, 'action')}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t('actions.addAction')}
                        </Button>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}