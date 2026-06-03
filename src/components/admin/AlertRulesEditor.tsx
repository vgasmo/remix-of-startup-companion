import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Save, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProgramAlertRules, useUpdateAlertRule, getRuleTypeLabel, getSeverityConfig } from '@/hooks/useWorkspaceAlerts';

interface AlertRulesEditorProps {
  programId: string;
  programName?: string;
}

export function AlertRulesEditor({ programId, programName }: AlertRulesEditorProps) {
  const { t } = useTranslation();
  const { data: rules, isLoading } = useProgramAlertRules(programId);
  const updateRule = useUpdateAlertRule();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    threshold?: number;
    severity?: string;
    is_enabled?: boolean;
  }>({});

  const handleSave = (ruleId: string) => {
    if (Object.keys(editValues).length === 0) {
      setEditingId(null);
      return;
    }

    updateRule.mutate({
      id: ruleId,
      ...editValues,
    }, {
      onSuccess: () => {
        setEditingId(null);
        setEditValues({});
      },
    });
  };

  const handleEdit = (ruleId: string, currentValues: { threshold: number; severity: string; is_enabled: boolean }) => {
    setEditingId(ruleId);
    setEditValues({
      threshold: currentValues.threshold,
      severity: currentValues.severity,
      is_enabled: currentValues.is_enabled,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Regras de Alerta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group rules by type
  const groupedRules = rules?.reduce((acc, rule) => {
    if (!acc[rule.rule_type]) {
      acc[rule.rule_type] = [];
    }
    acc[rule.rule_type].push(rule);
    return acc;
  }, {} as Record<string, typeof rules>) || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Regras de Alerta
          {programName && <Badge variant="outline">{programName}</Badge>}
        </CardTitle>
        <CardDescription>
          Configure os thresholds e severidades para cada tipo de alerta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('alertRules.type', 'Tipo')}</TableHead>
              <TableHead>{t('alertRules.threshold', 'Threshold')}</TableHead>
              <TableHead>{t('alertRules.severity', 'Severidade')}</TableHead>
              <TableHead>{t('alertRules.active', 'Ativo')}</TableHead>
              <TableHead className="w-[100px]">{t('common.actions', 'Ações')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules?.map(rule => {
              const isEditing = editingId === rule.id;
              const severityConfig = getSeverityConfig(rule.severity);

              return (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{getRuleTypeLabel(rule.rule_type)}</p>
                      <p className="text-xs text-muted-foreground">{rule.rule_type}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editValues.threshold ?? rule.threshold}
                        onChange={(e) => setEditValues(prev => ({
                          ...prev,
                          threshold: parseInt(e.target.value) || 0,
                        }))}
                        className="w-20 h-8"
                      />
                    ) : (
                      <span className="font-mono">{rule.threshold}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Select
                        value={editValues.severity ?? rule.severity}
                        onValueChange={(v) => setEditValues(prev => ({ ...prev, severity: v }))}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">🔵 Info</SelectItem>
                          <SelectItem value="warning">🟠 Atenção</SelectItem>
                          <SelectItem value="critical">🔴 Crítico</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={severityConfig.color} variant="secondary">
                        {severityConfig.icon} {severityConfig.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Switch
                        checked={editValues.is_enabled ?? rule.is_enabled}
                        onCheckedChange={(v) => setEditValues(prev => ({ ...prev, is_enabled: v }))}
                      />
                    ) : (
                      <Badge variant={rule.is_enabled ? 'default' : 'secondary'}>
                        {rule.is_enabled ? 'Sim' : 'Não'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Button
                        size="sm"
                        onClick={() => handleSave(rule.id)}
                        disabled={updateRule.isPending}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Guardar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule.id, {
                          threshold: rule.threshold,
                          severity: rule.severity,
                          is_enabled: rule.is_enabled,
                        })}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {(!rules || rules.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <Settings className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>{t('alertRules.noRules', 'Nenhuma regra configurada para este programa.')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
