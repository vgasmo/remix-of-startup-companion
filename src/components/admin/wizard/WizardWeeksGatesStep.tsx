import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, CalendarDays, Flag, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DraftGate, DraftWeek } from '@/hooks/useProgramSetup';

// Stable local ID generator: prefer existing DB id, otherwise mint a UUID.
// Fixes prior bug where gate removal used `temp-${idx}` while assignment used
// `gate-${idx}`, leaving weeks orphaned or attached to the wrong gate.
function localId(g: { id?: string; __local_id?: string }): string {
  return g.id || g.__local_id || (g.__local_id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `lid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);
}

interface WizardWeeksGatesStepProps {
  gates: DraftGate[];
  weeks: DraftWeek[];
  onUpdate: (gates: DraftGate[], weeks: DraftWeek[]) => void;
}

export function WizardWeeksGatesStep({ gates: initialGates, weeks: initialWeeks, onUpdate }: WizardWeeksGatesStepProps) {
  const { t } = useTranslation();

  // Fetch global platform templates (e.g. Lean Canvas, BMC, Pitch Deck Checklist…)
  const { data: templates = [] } = useQuery({
    queryKey: ['program-wizard-templates'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('id, name, category')
        .eq('is_global', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as { id: string; name: string; category: string | null }[];
    },
  });

  // Default gates get stable local IDs immediately so weeks can attach to them
  // by id (not by array index, which mutates on add/remove/reorder).
  const [gates, setGates] = useState<DraftGate[]>(() => {
    if (initialGates.length > 0) {
      return initialGates.map(g => ({ ...g, __local_id: g.id || (g as any).__local_id || crypto.randomUUID() } as DraftGate));
    }
    return [
      { name: t('programSetup.acceleration.defaultGate1', 'Discovery'), sort_order: 0, target_start_week: 1, target_end_week: 3, __local_id: crypto.randomUUID() } as DraftGate,
      { name: t('programSetup.acceleration.defaultGate2', 'Build'),     sort_order: 1, target_start_week: 4, target_end_week: 8, __local_id: crypto.randomUUID() } as DraftGate,
      { name: t('programSetup.acceleration.defaultGate3', 'Launch'),    sort_order: 2, target_start_week: 9, target_end_week: 12, __local_id: crypto.randomUUID() } as DraftGate,
    ];
  });
  const [weeks, setWeeks] = useState<DraftWeek[]>(initialWeeks);

  // Sync from parent — preserve / mint stable local IDs on incoming gates
  useEffect(() => {
    if (initialGates.length > 0 && JSON.stringify(initialGates) !== JSON.stringify(gates)) {
      setGates(initialGates.map(g => ({ ...g, __local_id: g.id || (g as any).__local_id || crypto.randomUUID() } as DraftGate)));
    }
  }, [initialGates]);

  useEffect(() => {
    if (initialWeeks.length > 0 && JSON.stringify(initialWeeks) !== JSON.stringify(weeks)) {
      setWeeks(initialWeeks);
    }
  }, [initialWeeks]);

  // Debounced update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (JSON.stringify(gates) !== JSON.stringify(initialGates) || JSON.stringify(weeks) !== JSON.stringify(initialWeeks)) {
        onUpdate(gates, weeks);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [gates, weeks]);

  // Gate CRUD
  const addGate = () => {
    const maxOrder = gates.length > 0 ? Math.max(...gates.map(g => g.sort_order)) + 1 : 0;
    const lastEndWeek = gates.length > 0 ? Math.max(...gates.map(g => g.target_end_week || 0)) : 0;
    setGates([...gates, {
      name: '',
      sort_order: maxOrder,
      target_start_week: lastEndWeek + 1,
      target_end_week: lastEndWeek + 4,
      __local_id: crypto.randomUUID(),
    } as DraftGate]);
  };

  const removeGate = (idx: number) => {
    const gateToRemove = gates[idx];
    const removedLocalId = localId(gateToRemove);
    setGates(gates.filter((_, i) => i !== idx).map((g, i) => ({ ...g, sort_order: i })));
    // Unlink weeks attached to this gate by its STABLE id (not array index).
    setWeeks(weeks.map(w => w.gate_id === removedLocalId ? { ...w, gate_id: undefined } : w));
  };

  const updateGate = (idx: number, field: keyof DraftGate, value: string | number) => {
    setGates(gates.map((g, i) => i === idx ? { ...g, [field]: value } : g));
  };

  const moveGate = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= gates.length) return;
    const sorted = [...gates].sort((a, b) => a.sort_order - b.sort_order);
    [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
    setGates(sorted.map((g, i) => ({ ...g, sort_order: i })));
  };

  // Week CRUD
  const addWeek = (gateLocalId?: string) => {
    const maxWeek = weeks.length > 0 ? Math.max(...weeks.map(w => w.week_number)) : 0;
    setWeeks([...weeks, {
      gate_id: gateLocalId,
      week_number: maxWeek + 1,
      title: '',
      deliverables_json: [],
    }]);
  };

  const removeWeek = (idx: number) => {
    setWeeks(weeks.filter((_, i) => i !== idx));
  };

  const updateWeek = (idx: number, field: keyof DraftWeek, value: any) => {
    setWeeks(weeks.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  };

  const addDeliverable = (weekIdx: number) => {
    const week = weeks[weekIdx];
    updateWeek(weekIdx, 'deliverables_json', [...week.deliverables_json, { title: '' }]);
  };

  const updateDeliverable = (weekIdx: number, delIdx: number, field: string, value: string) => {
    const week = weeks[weekIdx];
    const updated = week.deliverables_json.map((d, i) => i === delIdx ? { ...d, [field]: value } : d);
    updateWeek(weekIdx, 'deliverables_json', updated);
  };

  const removeDeliverable = (weekIdx: number, delIdx: number) => {
    const week = weeks[weekIdx];
    updateWeek(weekIdx, 'deliverables_json', week.deliverables_json.filter((_, i) => i !== delIdx));
  };

  const sortedGates = [...gates].sort((a, b) => a.sort_order - b.sort_order);
  const sortedWeeks = [...weeks].sort((a, b) => a.week_number - b.week_number);

  // Get weeks attached to a specific gate (by stable local id)
  const getGateWeeks = (gateLocalId: string) => {
    const gate = sortedGates.find(g => localId(g) === gateLocalId);
    if (!gate) return [];
    return sortedWeeks.filter(w => {
      if (w.gate_id === gateLocalId) return true;
      // Also match by week range when no explicit gate is set
      if (gate.target_start_week && gate.target_end_week && !w.gate_id) {
        return w.week_number >= gate.target_start_week && w.week_number <= gate.target_end_week;
      }
      return false;
    });
  };

  const unassignedWeeks = sortedWeeks.filter(w => {
    if (!w.gate_id) {
      // Check if it falls in any gate range
      return !sortedGates.some(g => 
        g.target_start_week && g.target_end_week && 
        w.week_number >= g.target_start_week && w.week_number <= g.target_end_week
      );
    }
    return false;
  });

  return (
    <div className="space-y-6">
      {/* Gates Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" />
              {t('programSetup.acceleration.gates', 'Gates / Phases')}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t('programSetup.acceleration.gatesDesc', 'Define the major phases/checkpoints of your acceleration program.')}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addGate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('programSetup.acceleration.addGate', 'Add Gate')}
          </Button>
        </div>

        <div className="space-y-3">
          {sortedGates.map((gate, idx) => (
            <Card key={idx} className="border">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveGate(idx, 'up')} disabled={idx === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveGate(idx, 'down')} disabled={idx === sortedGates.length - 1}>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Gate {idx + 1}</Badge>
                      {gate.target_start_week && gate.target_end_week && (
                        <Badge variant="secondary" className="text-xs">
                          {t('programSetup.acceleration.weekRange', 'Weeks {{start}}-{{end}}', { start: gate.target_start_week, end: gate.target_end_week })}
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs">{t('programSetup.acceleration.gateName', 'Name')}</Label>
                        <Input
                          value={gate.name}
                          onChange={(e) => updateGate(idx, 'name', e.target.value)}
                          placeholder={t('programSetup.acceleration.gateNamePlaceholder', 'e.g., Discovery')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('programSetup.acceleration.startWeek', 'Start Week')}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={gate.target_start_week || ''}
                          onChange={(e) => updateGate(idx, 'target_start_week', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('programSetup.acceleration.endWeek', 'End Week')}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={gate.target_end_week || ''}
                          onChange={(e) => updateGate(idx, 'target_end_week', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">{t('programSetup.acceleration.gateDescription', 'Description')}</Label>
                      <Textarea
                        value={gate.description || ''}
                        onChange={(e) => updateGate(idx, 'description', e.target.value)}
                        rows={1}
                        placeholder={t('programSetup.acceleration.gateDescPlaceholder', 'What should be achieved by this gate...')}
                      />
                    </div>
                  </div>

                  <Button type="button" variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => removeGate(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Weeks Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              {t('programSetup.acceleration.weeks', 'Weekly Plan')}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t('programSetup.acceleration.weeksDesc', 'Define each week with its deliverables. Assign weeks to gates.')}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => addWeek()}>
            <Plus className="h-4 w-4 mr-1" />
            {t('programSetup.acceleration.addWeek', 'Add Week')}
          </Button>
        </div>

        <Accordion type="multiple" className="space-y-2">
          {sortedWeeks.map((week, weekIdx) => {
            const originalIdx = weeks.indexOf(week);
            return (
              <AccordionItem key={weekIdx} value={`week-${weekIdx}`} className="border rounded-lg px-4">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <Badge variant="outline" className="shrink-0">
                      {t('programSetup.acceleration.weekN', 'Week {{n}}', { n: week.week_number })}
                    </Badge>
                    <span className="text-sm truncate">{week.title || t('programSetup.acceleration.untitled', 'Untitled')}</span>
                    {week.deliverables_json.length > 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {week.deliverables_json.length} {t('programSetup.acceleration.deliverables', 'deliverables')}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('programSetup.acceleration.weekNumber', 'Week #')}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={week.week_number}
                        onChange={(e) => updateWeek(originalIdx, 'week_number', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('programSetup.acceleration.weekTitle', 'Title')}</Label>
                      <Input
                        value={week.title}
                        onChange={(e) => updateWeek(originalIdx, 'title', e.target.value)}
                        placeholder={t('programSetup.acceleration.weekTitlePlaceholder', 'e.g., Customer Discovery')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('programSetup.acceleration.assignGate', 'Gate')}</Label>
                      <Select
                        value={week.gate_id || 'none'}
                        onValueChange={(v) => updateWeek(originalIdx, 'gate_id', v === 'none' ? undefined : v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('programSetup.acceleration.noGate', 'No gate')}</SelectItem>
                          {sortedGates.map((g, gIdx) => {
                            const lid = localId(g);
                            return (
                              <SelectItem key={lid} value={lid}>
                                {g.name || `Gate ${gIdx + 1}`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t('programSetup.acceleration.weekDescription', 'Description')}</Label>
                    <Textarea
                      value={week.description || ''}
                      onChange={(e) => updateWeek(originalIdx, 'description', e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Deliverables */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">{t('programSetup.acceleration.deliverables', 'Deliverables')}</Label>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addDeliverable(originalIdx)}>
                        <Plus className="h-3 w-3 mr-1" />
                        {t('programSetup.acceleration.addDeliverable', 'Add')}
                      </Button>
                    </div>
                    {week.deliverables_json.map((del, delIdx) => (
                      <div key={delIdx} className="flex items-start gap-2 pl-2 border-l-2 border-primary/20">
                        <div className="flex-1 space-y-1">
                          <Input
                            value={del.title}
                            onChange={(e) => updateDeliverable(originalIdx, delIdx, 'title', e.target.value)}
                            placeholder={t('programSetup.acceleration.deliverablePlaceholder', 'Deliverable title')}
                            className="h-8 text-sm"
                          />
                          <Select
                            value={del.template_id || 'none'}
                            onValueChange={(v) => updateDeliverable(originalIdx, delIdx, 'template_id', v === 'none' ? '' : v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <div className="flex items-center gap-1.5 truncate">
                                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                                <SelectValue placeholder={t('programSetup.acceleration.linkTemplate', 'Link platform template (optional)')} />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                {t('programSetup.acceleration.noTemplate', 'No template')}
                              </SelectItem>
                              {templates.map((tpl) => (
                                <SelectItem key={tpl.id} value={tpl.id}>
                                  {tpl.category ? `${tpl.category} · ${tpl.name}` : tpl.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeDeliverable(originalIdx, delIdx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {week.deliverables_json.length === 0 && (
                      <p className="text-xs text-muted-foreground italic pl-2">
                        {t('programSetup.acceleration.noDeliverables', 'No deliverables yet. Add what startups should complete this week.')}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => removeWeek(originalIdx)}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t('programSetup.acceleration.removeWeek', 'Remove Week')}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {sortedWeeks.length === 0 && (
          <div className="text-center py-8 border rounded-lg bg-muted/30">
            <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('programSetup.acceleration.noWeeks', 'No weeks configured yet. Add weeks to define your program timeline.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
