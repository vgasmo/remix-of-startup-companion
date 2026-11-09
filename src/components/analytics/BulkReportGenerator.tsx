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
import { serializeCsv } from '@/lib/csv';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { usePrograms } from '@/hooks/useWorkspaces';

interface BulkReportGeneratorProps {
  programId?: string;
}

export function BulkReportGenerator({ programId }: BulkReportGeneratorProps) {
  const { t } = useTranslation();
  const { data: programs } = usePrograms();
  const [loading, setLoading] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(programId || 'all');
  const [includeKpis, setIncludeKpis] = useState(true);
  const [includeMilestones, setIncludeMilestones] = useState(true);
  const [includeActions, setIncludeActions] = useState(true);
  const [includeSessions, setIncludeSessions] = useState(true);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      // PostgREST caps every response (default 1000 rows) and long ?in.(...) lists can exceed the
      // URL limit: page every read and chunk the workspace ids, otherwise totals are silently wrong.
      const workspaces = await fetchAllRows<any>((from, to) => {
        let q = supabase
          .from('workspaces')
          .select(`
            id,
            stage,
            health_score,
            startup:startups(name, description),
            program:programs(name)
          `)
          .order('id');
        if (selectedProgram !== 'all') q = q.eq('program_id', selectedProgram);
        return q.range(from, to);
      });

      if (!workspaces.length) {
        notify.error(t('reports.noWorkspaces', 'Sem workspaces encontrados'));
        return;
      }

      const workspaceIds = workspaces.map(w => w.id);
      const loadByWorkspace = async (table: string, select: string, apply?: (q: any) => any): Promise<any[]> => {
        const out: any[] = [];
        for (let i = 0; i < workspaceIds.length; i += 100) {
          const ids = workspaceIds.slice(i, i + 100);
          out.push(...await fetchAllRows<any>((from, to) => {
            let q: any = (supabase as any).from(table).select(select).in('workspace_id', ids).order('id');
            if (apply) q = apply(q);
            return q.range(from, to);
          }));
        }
        return out;
      };

      // Unchecked sections are left blank in the CSV (an unrequested section is not "0").
      const [actions, milestones, kpis, sessions] = await Promise.all([
        includeActions ? loadByWorkspace('action_items', '*') : Promise.resolve(null),
        includeMilestones ? loadByWorkspace('milestones', '*', q => q.is('archived_at', null)) : Promise.resolve(null),
        includeKpis ? loadByWorkspace('kpi_values', '*, kpi_definition:kpi_definitions(name, unit)') : Promise.resolve(null),
        includeSessions ? loadByWorkspace('sessions', '*') : Promise.resolve(null),
      ]);

      const rows: string[][] = [[
        'Startup', 'Program', 'Stage', 'Health',
        'Total Milestones', 'Completed Milestones',
        'Total Actions', 'Completed Actions', 'Overdue Actions',
        'Total Sessions', 'Last Session Date', 'KPI Count',
      ]];

      const today = new Date().toISOString().split('T')[0];
      const count = (list: any[] | null, pred?: (x: any) => boolean) =>
        list === null ? '' : String(pred ? list.filter(pred).length : list.length);

      for (const workspace of workspaces) {
        const wsActions = actions && actions.filter((a: any) => a.workspace_id === workspace.id);
        const wsMilestones = milestones && milestones.filter((m: any) => m.workspace_id === workspace.id);
        const wsKpis = kpis && kpis.filter((k: any) => k.workspace_id === workspace.id);
        const wsSessions = sessions && sessions.filter((s: any) => s.workspace_id === workspace.id);
        const lastSession = wsSessions
          ? [...wsSessions].sort((a: any, b: any) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0]
          : undefined;

        rows.push([
          (workspace.startup as any)?.name || 'Unknown',
          (workspace.program as any)?.name || 'Unknown',
          workspace.stage,
          workspace.health_score || 'N/A',
          count(wsMilestones),
          count(wsMilestones, (m: any) => m.status === 'completed'),
          count(wsActions),
          count(wsActions, (a: any) => a.status === 'completed'),
          count(wsActions, (a: any) => a.status !== 'completed' && a.due_date && a.due_date < today),
          count(wsSessions),
          wsSessions ? (lastSession ? format(new Date(lastSession.scheduled_at), 'yyyy-MM-dd') : 'N/A') : '',
          count(wsKpis),
        ]);
      }

      // Shared serializer: quotes every cell and neutralizes spreadsheet formulas (see AGENTS.md).
      const csv = serializeCsv(rows);

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
              <SelectItem value="all">{t('analytics.allPrograms', 'Todos os programas')}</SelectItem>
              {programs?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
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
