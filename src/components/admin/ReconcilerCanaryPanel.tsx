// ReconcilerCanaryPanel
// Admin-only UI to run the `reconciler-run` edge function against a small
// allowlist of funnel_item IDs. Supports plan (dry_run) and commit modes and
// records every action in `activity_log` for operator sign-off.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldAlert, PlayCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from '@/lib/notify';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface RunResult {
  dry_run: boolean;
  total_rows: number;
  planned_writes: number;
  noop: number;
  conflicts: number;
  errors: number;
  results: Array<Record<string, unknown>>;
}

function parseIds(raw: string): string[] {
  return raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

function safeParseJson(raw: string): { ok: true; value: any } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: {} };
  try { return { ok: true, value: JSON.parse(trimmed) }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
}

export function ReconcilerCanaryPanel() {
  const [ids, setIds] = useState('');
  const [programMap, setProgramMap] = useState('{}');
  const [classificationMap, setClassificationMap] = useState('{}');
  const [loading, setLoading] = useState<false | 'plan' | 'commit'>(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const { mutate: logActivity } = useLogActivity();
  const { confirm, dialogProps } = useConfirmDialog();

  const idList = parseIds(ids);
  const canRun = idList.length > 0 && idList.length <= 5;

  const runReconciler = async (dryRun: boolean) => {
    if (!canRun) { notify.error('Provide 1–5 funnel_item IDs'); return; }
    const pm = safeParseJson(programMap);
    const cm = safeParseJson(classificationMap);
    if (!pm.ok) { notify.error(`service_program_map JSON: ${(pm as { error: string }).error}`); return; }
    if (!cm.ok) { notify.error(`service_classification_map JSON: ${(cm as { error: string }).error}`); return; }

    setLoading(dryRun ? 'plan' : 'commit');
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        funnel_item_ids: idList,
        service_program_map: pm.value,
        service_classification_map: cm.value,
        dry_run: dryRun,
      };
      if (!dryRun) body.commit_authorized_ids = idList;

      const { data, error } = await invokeWithAuth<RunResult>('reconciler-run', { body });
      if (error) throw error;
      setResult(data);

      logActivity({
        action: dryRun ? 'reconciler.canary.plan' : 'reconciler.canary.commit',
        entityType: 'reconciler_run',
        metadata: {
          funnel_item_ids: idList,
          total_rows: data?.total_rows ?? 0,
          planned_writes: data?.planned_writes ?? 0,
          noop: data?.noop ?? 0,
          conflicts: data?.conflicts ?? 0,
          errors: data?.errors ?? 0,
        },
      });

      notify.success(dryRun ? 'Plan complete' : 'Commit complete');
    } catch (e) {
      const msg = (e as Error).message;
      notify.error(msg);
      logActivity({
        action: dryRun ? 'reconciler.canary.plan.error' : 'reconciler.canary.commit.error',
        entityType: 'reconciler_run',
        metadata: { funnel_item_ids: idList, error: msg },
      });
    } finally {
      setLoading(false);
    }
  };

  const onCommitClick = () => {
    confirm({
      title: 'Commit reconciler canary?',
      description: `This will attempt atomic writes for ${idList.length} authorized funnel_item ID(s). Requires RECONCILER_WRITE_MODE=enabled. This action is logged.`,
      confirmLabel: 'Commit',
      variant: 'warning',
      onConfirm: () => runReconciler(false),
    });
  };

  return (
    <>
      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Reconciler canary (max 5 IDs)
          </CardTitle>
          <CardDescription>
            Runs <code>reconciler-run</code> in plan or commit mode against an explicit allowlist. Commits require
            an admin-set <code>RECONCILER_WRITE_MODE=enabled</code> secret and are recorded in the activity log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="canary-ids">funnel_item IDs (max 5, comma or newline separated)</Label>
            <Textarea id="canary-ids" rows={3} value={ids} onChange={e => setIds(e.target.value)}
              placeholder="uuid-1, uuid-2, uuid-3" />
            <div className="text-xs text-muted-foreground">{idList.length} parsed</div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="canary-pmap">service_program_map (JSON)</Label>
              <Textarea id="canary-pmap" rows={4} value={programMap} onChange={e => setProgramMap(e.target.value)}
                placeholder='{"Domiciliação": null, "Aceleração": "program-uuid"}' />
            </div>
            <div className="space-y-1">
              <Label htmlFor="canary-cmap">service_classification_map (JSON)</Label>
              <Textarea id="canary-cmap" rows={4} value={classificationMap} onChange={e => setClassificationMap(e.target.value)}
                placeholder='{"Domiciliação": "domiciliacao", "Aceleração": "founder_journey"}' />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" disabled={!canRun || !!loading} onClick={() => runReconciler(true)}>
              {loading === 'plan' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Run plan (dry-run)
            </Button>
            <Button variant="destructive" disabled={!canRun || !!loading || !result || result.dry_run === false} onClick={onCommitClick}>
              {loading === 'commit' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Commit authorized IDs
            </Button>
          </div>

          {result && (
            <Alert>
              <AlertTitle className="flex items-center gap-2">
                {result.dry_run ? 'Plan result' : 'Commit result'}
                <Badge variant="outline">total: {result.total_rows}</Badge>
                <Badge>planned/committed: {result.planned_writes}</Badge>
                <Badge variant="secondary">noop: {result.noop}</Badge>
                <Badge variant="destructive">conflicts: {result.conflicts}</Badge>
                <Badge variant="destructive">errors: {result.errors}</Badge>
              </AlertTitle>
              <AlertDescription>
                <ScrollArea className="h-56 mt-2 rounded border bg-muted/40">
                  <pre className="text-[10px] p-2 whitespace-pre-wrap break-words">
                    {JSON.stringify(result.results, null, 2)}
                  </pre>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export default ReconcilerCanaryPanel;
