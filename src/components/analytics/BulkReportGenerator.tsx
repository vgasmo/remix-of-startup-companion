import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { FileDown, Loader2, FileSpreadsheet, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

interface BulkReportGeneratorProps {
  programId?: string;
}

export function BulkReportGenerator({ programId }: BulkReportGeneratorProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(programId || 'all');
  const [includeKpis, setIncludeKpis] = useState(true);
  const [includeMilestones, setIncludeMilestones] = useState(true);
  const [includeActions, setIncludeActions] = useState(true);
  const [includeSessions, setIncludeSessions] = useState(true);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      // Fetch all workspaces (filtered by program if selected)
      let workspacesQuery = supabase
        .from('workspaces')
        .select(`
          id,
          stage,
          health_score,
          startup:startups(name, description),
          program:programs(name)
        `);

      if (selectedProgram !== 'all') {
        workspacesQuery = workspacesQuery.eq('program_id', selectedProgram);
      }

      const { data: workspaces, error: wsError } = await workspacesQuery;
      if (wsError) throw wsError;

      if (!workspaces?.length) {
        notify.error(t('reports.noWorkspaces', 'Sem workspaces encontrados'));
        return;
      }

      const workspaceIds = workspaces.map(w => w.id);

      // Fetch related data based on selections
      const [actionsRes, milestonesRes, kpisRes, sessionsRes] = await Promise.all([
        includeActions 
          ? supabase.from('action_items').select('*').in('workspace_id', workspaceIds)
          : Promise.resolve({ data: [] }),
        includeMilestones 
          ? supabase.from('milestones').select('*').in('workspace_id', workspaceIds).is('archived_at', null)
          : Promise.resolve({ data: [] }),
        includeKpis 
          ? supabase.from('kpi_values').select('*, kpi_definition:kpi_definitions(name, unit)').in('workspace_id', workspaceIds)
          : Promise.resolve({ data: [] }),
        includeSessions 
          ? supabase.from('sessions').select('*').in('workspace_id', workspaceIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Build CSV data
      const rows: string[][] = [];
      
      // Header
      rows.push([
        'Startup',
        'Program',
        'Stage',
        'Health',
        'Total Milestones',
        'Completed Milestones',
        'Total Actions',
        'Completed Actions',
        'Overdue Actions',
        'Total Sessions',
        'Last Session Date',
        'KPI Count'
      ]);

      const today = new Date().toISOString().split('T')[0];

      for (const workspace of workspaces) {
        const wsActions = (actionsRes.data || []).filter((a: any) => a.workspace_id === workspace.id);
        const wsMilestones = (milestonesRes.data || []).filter((m: any) => m.workspace_id === workspace.id);
        const wsKpis = (kpisRes.data || []).filter((k: any) => k.workspace_id === workspace.id);
        const wsSessions = (sessionsRes.data || []).filter((s: any) => s.workspace_id === workspace.id);

        const lastSession = wsSessions.sort((a: any, b: any) => 
          new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
        )[0];

        rows.push([
          (workspace.startup as any)?.name || 'Unknown',
          (workspace.program as any)?.name || 'Unknown',
          workspace.stage,
          workspace.health_score || 'N/A',
          String(wsMilestones.length),
          String(wsMilestones.filter((m: any) => m.status === 'completed').length),
          String(wsActions.length),
          String(wsActions.filter((a: any) => a.status === 'completed').length),
          String(wsActions.filter((a: any) => 
            a.status !== 'completed' && a.due_date && a.due_date < today
          ).length),
          String(wsSessions.length),
          lastSession ? format(new Date(lastSession.scheduled_at), 'yyyy-MM-dd') : 'N/A',
          String(wsKpis.length),
        ]);
      }

      // Convert to CSV with formula injection protection
      const sanitizeCell = (cell: string): string => {
        const str = String(cell).replace(/"/g, '""');
        // Prevent formula injection by prefixing dangerous characters
        if (/^[=+\-@\t\r]/.test(str)) {
          return `'${str}`;
        }
        return str;
      };
      
      const csv = rows.map(row => 
        row.map(cell => `"${sanitizeCell(cell)}"`).join(',')
      ).join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `program-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      notify.success(t('analytics.exportedStartups', { count: workspaces.length }));
    } catch (error: any) {
      logger.error('Export error', {}, error);
      notify.error(error.message || t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Bulk Report Generator
        </CardTitle>
        <CardDescription>
          {t('analytics.generateReportDesc', 'Generate program-level reports for stakeholders')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t('common.program', 'Programa')}</Label>
          <Select value={selectedProgram} onValueChange={setSelectedProgram}>
            <SelectTrigger>
              <SelectValue placeholder="Select program" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all', 'Todos')} {t('common.program', 'Programa')}s</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>{t('analytics.includeInReport', 'Incluir no Relatório')}</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <Checkbox id="kpis" checked={includeKpis} onCheckedChange={(c) => setIncludeKpis(!!c)} />
              <label htmlFor="kpis" className="text-sm">KPIs</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="milestones" checked={includeMilestones} onCheckedChange={(c) => setIncludeMilestones(!!c)} />
              <label htmlFor="milestones" className="text-sm">{t('common.milestones', 'Milestones')}</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="actions" checked={includeActions} onCheckedChange={(c) => setIncludeActions(!!c)} />
              <label htmlFor="actions" className="text-sm">{t('common.actions', 'Ações')}</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="sessions" checked={includeSessions} onCheckedChange={(c) => setIncludeSessions(!!c)} />
              <label htmlFor="sessions" className="text-sm">{t('common.sessions', 'Sessões')}</label>
            </div>
          </div>
        </div>

        <Button onClick={handleGenerateReport} disabled={loading} loading={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4 mr-2" />
              Generate CSV Report
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
