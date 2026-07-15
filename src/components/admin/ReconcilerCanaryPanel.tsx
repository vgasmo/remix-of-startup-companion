// ReconcilerCanaryPanel
// Admin-only UI for the reconciler-run staged-commit protocol.
//   1) Stage:  posts { phase:'stage', funnel_item_ids, maps } → returns { batch_id, plan_hash, results[] }
//   2) Commit: posts { phase:'commit', batch_id, expected_plan_hash, commit_authorized_ids }
//              → server re-verifies plan_hash and applies rows atomically via
//              public.reconciler_commit_row(row_id, plan_hash).
// Every action is written to activity_log for operator sign-off.

import { useEffect, useState } from 'react';
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

interface StageResult {
  phase: 'stage';
  batch_id: string;
  plan_hash: string;
  total_rows: number;
  staged: number;
  conflicts: number;
  errors: number;
  results: Array<{ funnel_item_id: string; row_id?: string; status?: string; error?: unknown; after_snapshot?: unknown }>;
}
interface CommitResult {
  phase: 'commit';
  batch_id: string;
  total_rows: number;
  committed: number;
  skipped: number;
  errored: number;
  results: Array<Record<string, unknown>>;
}
type RunResult = StageResult | CommitResult;

function parseIds(raw: string): string[] {
  return raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}
function safeParseJson(raw: string): { ok: true; value: any } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: {} };
  try { return { ok: true, value: JSON.parse(trimmed) }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
}
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function computeInputFingerprint(idList: string[], pm: unknown, cm: unknown): Promise<string> {
  return sha256Hex(JSON.stringify({ ids: [...idList].sort(), program_map: pm, classification_map: cm }));
}

export function ReconcilerCanaryPanel() {
  const [ids, setIds] = useState('');
  const [programMap, setProgramMap] = useState('{}');
  const [classificationMap, setClassificationMap] = useState('{}');
  const [loading, setLoading] = useState<false | 'stage' | 'commit'>(false);
  const [stageResult, setStageResult] = useState<StageResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [stageInputFp, setStageInputFp] = useState<string | null>(null);
  const [currentInputFp, setCurrentInputFp] = useState<string | null>(null);

  const { mutate: logActivity } = useLogActivity();
  const { confirm, dialogProps } = useConfirmDialog();

  const idList = parseIds(ids);
  const canRun = idList.length > 0 && idList.length <= 5;

  useEffect(() => {
    const pm = safeParseJson(programMap);
    const cm = safeParseJson(classificationMap);
    if (!pm.ok || !cm.ok || idList.length === 0) { setCurrentInputFp(null); return; }
    let cancelled = false;
    computeInputFingerprint(idList, pm.value, cm.value).then(h => { if (!cancelled) setCurrentInputFp(h); });
    return () => { cancelled = true; };
  }, [ids, programMap, classificationMap]);

  const runStage = async () => {
    if (!canRun) { notify.error('Provide 1–5 funnel_item IDs'); return; }
    const pm = safeParseJson(programMap);
    const cm = safeParseJson(classificationMap);
    if (!pm.ok) { notify.error(`service_program_map JSON: ${(pm as { error: string }).error}`); return; }
    if (!cm.ok) { notify.error(`service_classification_map JSON: ${(cm as { error: string }).error}`); return; }

    setLoading('stage');
    setStageResult(null); setCommitResult(null); setStageInputFp(null);
    try {
      const body = {
        phase: 'stage',
        funnel_item_ids: idList,
        service_program_map: pm.value,
        service_classification_map: cm.value,
      };
      const { data, error } = await invokeWithAuth<StageResult>('reconciler-run', { body });
      if (error) throw error;
      if (!data || data.phase !== 'stage') throw new Error('Unexpected stage response');
      setStageResult(data);
      const fp = await computeInputFingerprint(idList, pm.value, cm.value);
      setStageInputFp(fp);
      logActivity({
        action: 'reconciler.canary.stage',
        entityType: 'reconciler_run',
        metadata: { funnel_item_ids: idList, batch_id: data.batch_id, plan_hash: data.plan_hash, staged: data.staged, conflicts: data.conflicts, errors: data.errors },
      });
      notify.success('Stage complete');
    } catch (e) {
      const msg = (e as Error).message;
      notify.error(msg);
      logActivity({ action: 'reconciler.canary.stage.error', entityType: 'reconciler_run', metadata: { funnel_item_ids: idList, error: msg } });
    } finally { setLoading(false); }
  };

  const runCommit = async () => {
    if (!stageResult) { notify.error('Run stage first'); return; }
    if (stageInputFp !== currentInputFp) { notify.error('Input drift since stage — re-run stage.'); return; }
    const commitRowIds = stageResult.results.filter(r => r.status === 'dry_run_ok' && r.row_id).map(r => r.row_id as string);
    if (commitRowIds.length === 0) { notify.error('No stageable rows to commit'); return; }

    setLoading('commit');
    try {
      const body = {
        phase: 'commit',
        batch_id: stageResult.batch_id,
        expected_plan_hash: stageResult.plan_hash,
        commit_authorized_ids: commitRowIds,
      };
      const { data, error } = await invokeWithAuth<CommitResult>('reconciler-run', { body });
      if (error) throw error;
      if (!data || data.phase !== 'commit') throw new Error('Unexpected commit response');
      setCommitResult(data);
      logActivity({
        action: 'reconciler.canary.commit',
        entityType: 'reconciler_run',
        metadata: { batch_id: data.batch_id, plan_hash: stageResult.plan_hash, committed: data.committed, skipped: data.skipped, errored: data.errored },
      });
      if ((data.errored ?? 0) > 0) notify.error(`Commit completed with ${data.errored} errors`);
      else notify.success('Commit complete');
    } catch (e) {
      const msg = (e as Error).message;
      notify.error(msg);
      logActivity({ action: 'reconciler.canary.commit.error', entityType: 'reconciler_run', metadata: { batch_id: stageResult?.batch_id, error: msg } });
    } finally { setLoading(false); }
  };

  const stageClean = !!stageResult && (stageResult.conflicts ?? 0) === 0 && (stageResult.errors ?? 0) === 0 && stageResult.staged > 0;
  const inputMatches = !!stageInputFp && !!currentInputFp && stageInputFp === currentInputFp;
  const commitDisabled = !canRun || !!loading || !stageClean || !inputMatches;

  const onCommitClick = () => {
    confirm({
      title: 'Commit reconciler canary?',
      description: `This will apply atomic writes for ${stageResult?.staged ?? 0} staged row(s). Requires RECONCILER_WRITE_MODE=enabled AND system_settings.reconciler.write_mode.enabled=true. plan_hash: ${stageResult?.plan_hash?.slice(0, 12)}…`,
      confirmLabel: 'Commit',
      variant: 'warning',
      onConfirm: () => runCommit(),
    });
  };

  const displayed: RunResult | null = commitResult ?? stageResult;

  return (
    <>
      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Reconciler canary (max 5 IDs)
          </CardTitle>
          <CardDescription>
            Runs <code>reconciler-run</code> in stage or commit mode against an explicit allowlist. Commits require
            an admin-set <code>RECONCILER_WRITE_MODE=enabled</code> secret and a matching server plan_hash.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="canary-ids">funnel_item IDs (max 5, comma or newline separated)</Label>
            <Textarea id="canary-ids" rows={3} value={ids} onChange={e => setIds(e.target.value)} placeholder="uuid-1, uuid-2, uuid-3" />
            <div className="text-xs text-muted-foreground">{idList.length} parsed</div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="canary-pmap">service_program_map (JSON)</Label>
              <Textarea id="canary-pmap" rows={4} value={programMap} onChange={e => setProgramMap(e.target.value)} placeholder='{"Domiciliação": null, "Aceleração": "program-uuid"}' />
            </div>
            <div className="space-y-1">
              <Label htmlFor="canary-cmap">service_classification_map (JSON)</Label>
              <Textarea id="canary-cmap" rows={4} value={classificationMap} onChange={e => setClassificationMap(e.target.value)} placeholder='{"Domiciliação": "domiciliacao", "Aceleração": "founder_journey"}' />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="outline" disabled={!canRun || !!loading} onClick={() => runStage()}>
              {loading === 'stage' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Run stage (no writes)
            </Button>
            <Button variant="destructive" disabled={commitDisabled} onClick={onCommitClick}>
              {loading === 'commit' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Commit staged rows
            </Button>
            {stageResult && (
              <div className="text-[10px] font-mono text-muted-foreground">
                batch: {stageResult.batch_id.slice(0, 8)}… · plan_hash: {stageResult.plan_hash.slice(0, 12)}…
                {!inputMatches && <span className="ml-2 text-destructive">drift — re-stage required</span>}
              </div>
            )}
          </div>

          {displayed && (
            <Alert>
              <AlertTitle className="flex items-center gap-2 flex-wrap">
                {displayed.phase === 'stage' ? 'Stage result' : 'Commit result'}
                <Badge variant="outline">total: {displayed.total_rows}</Badge>
                {displayed.phase === 'stage' ? (
                  <>
                    <Badge>staged: {displayed.staged}</Badge>
                    <Badge variant="destructive">conflicts: {displayed.conflicts}</Badge>
                    <Badge variant="destructive">errors: {displayed.errors}</Badge>
                  </>
                ) : (
                  <>
                    <Badge>committed: {displayed.committed}</Badge>
                    <Badge variant="secondary">skipped: {displayed.skipped}</Badge>
                    <Badge variant="destructive">errored: {displayed.errored}</Badge>
                  </>
                )}
              </AlertTitle>
              <AlertDescription>
                <ScrollArea className="h-56 mt-2 rounded border bg-muted/40">
                  <pre className="text-[10px] p-2 whitespace-pre-wrap break-words">
                    {JSON.stringify(displayed.results, null, 2)}
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
