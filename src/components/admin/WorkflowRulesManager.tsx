import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Json } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings, Zap, Clock, AlertTriangle, TrendingDown, Calendar } from 'lucide-react';
import { useWorkflowRules, useUpdateWorkflowRule, type WorkflowRule } from '@/hooks/useWorkflowRules';

interface WorkflowRulesManagerProps {
  programId?: string;
}

const triggerIcons: Record<string, React.ReactNode> = {
  'kpi_missing_by_day': <TrendingDown className="h-4 w-4" />,
  'action_overdue_by_days': <Clock className="h-4 w-4" />,
  'no_activity_for_days': <Calendar className="h-4 w-4" />,
  'health_dropped_to_risk': <AlertTriangle className="h-4 w-4" />,
};

const triggerLabels: Record<string, string> = {
  'kpi_missing_by_day': 'KPI Missing',
  'action_overdue_by_days': 'Action Overdue',
  'no_activity_for_days': 'No Activity',
  'health_dropped_to_risk': 'Health Drop',
};

export function WorkflowRulesManager({ programId }: WorkflowRulesManagerProps) {
  const { t } = useTranslation();
  const { data: rules, isLoading } = useWorkflowRules(programId);
  const updateRule = useUpdateWorkflowRule();
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);
  const [threshold, setThreshold] = useState<number>(0);

  const handleToggleEnabled = (rule: WorkflowRule) => {
    updateRule.mutate({
      id: rule.id,
      updates: { enabled: !rule.enabled }
    });
  };

  const handleSaveThreshold = () => {
    if (!editingRule) return;
    
    const conditions = editingRule.conditions_json as Record<string, unknown> || {};
    const newConditions = { ...conditions, days_threshold: threshold };
    
    updateRule.mutate({
      id: editingRule.id,
      updates: { conditions_json: newConditions as unknown as Json }
    });
    setEditingRule(null);
  };

  const openEditDialog = (rule: WorkflowRule) => {
    const conditions = rule.conditions_json as Record<string, unknown>;
    setThreshold((conditions.days_threshold as number) || 0);
    setEditingRule(rule);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Automation Rules
        </CardTitle>
        <CardDescription>
          Configure automated workflows that trigger based on workspace activity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!rules?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No automation rules configured
          </p>
        ) : (
          rules.map(rule => {
            const conditions = rule.conditions_json as Record<string, unknown>;
            const actions = rule.actions_json as Record<string, unknown>;
            
            return (
              <div 
                key={rule.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    {triggerIcons[rule.trigger_type] || <Zap className="h-4 w-4" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {rule.name || triggerLabels[rule.trigger_type] || rule.trigger_type}
                      </span>
                      <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {rule.description || `Triggers: ${rule.trigger_type}`}
                    </p>
                    {typeof conditions.days_threshold === 'number' && (
                      <p className="text-xs text-muted-foreground">
                        Threshold: {String(conditions.days_threshold)} days
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Action: {String(actions.action || 'N/A')}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => openEditDialog(rule)}
                       aria-label={t('common.settings')}>
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Configure Rule</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Rule Name</Label>
                          <p className="text-sm">{editingRule?.name || 'Unnamed Rule'}</p>
                        </div>
                        {editingRule?.trigger_type !== 'health_dropped_to_risk' && (
                          <div className="space-y-2">
                            <Label htmlFor="threshold">Days Threshold</Label>
                            <Input
                              id="threshold"
                              type="number"
                              min={1}
                              max={90}
                              value={threshold}
                              onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Rule triggers after this many days
                            </p>
                          </div>
                        )}
                        <Button onClick={handleSaveThreshold} className="w-full">
                          Save Changes
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Switch 
                    checked={rule.enabled}
                    onCheckedChange={() => handleToggleEnabled(rule)}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
