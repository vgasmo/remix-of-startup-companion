// CensusRunnerPanel
// Phase 2: admin-only, READ-ONLY census runner with exception CSV downloads.
// Invokes `census-run` edge function. No writes; snapshots are persisted server-side
// into `census_reports`. Exception CSVs are uploaded to the `admin-exports` bucket
// with 1h signed URLs for operator download and sign-off.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayCircle, Loader2, Download, AlertTriangle, Database } from 'lucide-react';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from '@/lib/notify';
import { useLogActivity } from '@/hooks/useActivityLog';

interface ExceptionEntry {
  row_count: number;
  object_path: string | null;
  signed_url: string | null;
  error: string | null;
}
interface CensusResult {
  ok: boolean;
  census_id: string;
  generated_at: string;
  totals: Record<string, number>;
  duplicates_summary: Record<string, number>;
  service_breakdown: { counts: Record<string, number>; unmapped_services: Array<{ service: string; count: number }> };
  workspace_breakdown: {
    by_status: Record<string, number>;
    by_engagement_state: Record<string, number>;
    without_program: number;
    archived: number;
  };
  exceptions: Record<string, ExceptionEntry>;
  phc_extract?: Record<string, unknown>;
  phc_parse_error?: string | null;
}
interface CensusError {
  error: string;
  errors?: Array<{ source: string; message: string }>;
  message?: string;
}

export function CensusRunnerPanel() {
  const [phcPath, setPhcPath] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CensusResult | null>(null);
  const [queryErrors, setQueryErrors] = useState<Array<{ source: string; message: string }>>([]);
  const { mutate: logActivity } = useLogActivity();

  const run = async () => {
    setLoading(true);
    setResult(null);
    setQueryErrors([]);
    try {
      const body: Record<string, unknown> = {};
      if (phcPath.trim()) body.phc_extract_object_path = phcPath.trim();
      if (notes.trim()) body.notes = notes.trim();

      const { data, error } = await invokeWithAuth<CensusResult | CensusError>('census-run', { body });
      if (error) throw error;
      if (data && 'error' in data) {
        setQueryErrors(data.errors ?? [{ source: data.error, message: data.message ?? '' }]);
        notify.error(`Census failed: ${data.error}`);
        return;
      }
      const res = data as CensusResult;
      setResult(res);
      logActivity({
        action: 'census.run',
        entityType: 'census_report',
        entityId: res.census_id,
        metadata: { totals: res.totals, exceptions_summary: Object.fromEntries(Object.entries(res.exceptions).map(([k, v]) => [k, v.row_count])) },
      });
      notify.success('Census complete');
    } catch (e) {
      const msg = (e as Error).message;
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-blue-500/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-blue-500" />
          Data census (read-only)
        </CardTitle>
        <CardDescription>
          Runs <code>census-run</code>. Aggregates funnel, workspace, contract, and PHC counts;
          produces row-level exception CSVs for orphan contracts, unlinked contracted funnel,
          duplicate PHC IDs / NIFs, workspaces without a programme, and multiple active contracts.
          No writes to product tables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="census-phc" className="text-xs">PHC extract object path (optional)</Label>
            <Input id="census-phc" value={phcPath} onChange={e => setPhcPath(e.target.value)}
              placeholder="clients/2026-07-15.csv" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="census-notes" className="text-xs">Notes (optional)</Label>
            <Input id="census-notes" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="pre-canary read-only census" />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" disabled={loading} onClick={run}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Run census
          </Button>
        </div>

        {queryErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Census hard-failed — no snapshot persisted</AlertTitle>
            <AlertDescription>
              <ul className="text-xs mt-1 space-y-0.5">
                {queryErrors.map((e, i) => (
                  <li key={i}><code>{e.source}</code>: {e.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <AlertTitle className="flex items-center gap-2 flex-wrap">
              Census {result.census_id.slice(0, 8)}…
              <Badge variant="outline">funnel: {result.totals.funnel_items}</Badge>
              <Badge variant="outline">workspaces: {result.totals.workspaces}</Badge>
              <Badge variant="outline">contracts: {result.totals.startup_contracts}</Badge>
              <Badge variant="outline">startups: {result.totals.startups}</Badge>
            </AlertTitle>
            <AlertDescription className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {new Date(result.generated_at).toLocaleString()}
              </div>

              <div>
                <div className="text-xs font-semibold mb-1">Exception CSVs</div>
                <div className="grid gap-1">
                  {Object.entries(result.exceptions).map(([name, ex]) => (
                    <div key={name} className="flex items-center gap-2 text-xs">
                      <Badge variant={ex.row_count > 0 ? 'destructive' : 'secondary'}>
                        {ex.row_count}
                      </Badge>
                      <span className="font-mono">{name}</span>
                      {ex.signed_url && (
                        <a href={ex.signed_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Download className="h-3 w-3" /> CSV
                        </a>
                      )}
                      {ex.error && <span className="text-destructive">error: {ex.error}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold mb-1">Workspaces</div>
                <div className="text-xs flex gap-3 flex-wrap">
                  {Object.entries(result.workspace_breakdown.by_status).map(([k, v]) => (
                    <span key={k}><Badge variant="outline">{k}</Badge> {v}</span>
                  ))}
                  <span>archived: <b>{result.workspace_breakdown.archived}</b></span>
                  <span>without program: <b>{result.workspace_breakdown.without_program}</b></span>
                </div>
              </div>

              {result.service_breakdown.unmapped_services.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-1 text-destructive">Unmapped services</div>
                  <ul className="text-xs">
                    {result.service_breakdown.unmapped_services.map(u => (
                      <li key={u.service}><code>{u.service}</code> — {u.count}</li>
                    ))}
                  </ul>
                </div>
              )}

              <ScrollArea className="h-40 rounded border bg-muted/30">
                <pre className="text-[10px] p-2 whitespace-pre-wrap break-words">
                  {JSON.stringify({ totals: result.totals, duplicates: result.duplicates_summary }, null, 2)}
                </pre>
              </ScrollArea>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default CensusRunnerPanel;
