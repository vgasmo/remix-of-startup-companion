import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabaseClient } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from '@/lib/notify';
import { detectPlaybooks, type PlaybookSummary } from '@/lib/copilotPlaybooks';
import { useNavigate } from 'react-router-dom';

interface WorkspaceOption {
  id: string;
  name: string;
}

interface Props {
  messageText: string;
}

/**
 * Surfaces "Apply playbook" chips under a copilot assistant message when it
 * references one or more known playbooks. Clicking applies it (creates a
 * milestone + action items) on the user's active workspace.
 */
export function CopilotPlaybookActions({ messageText }: Props) {
  const playbooks = detectPlaybooks(messageText);
  if (playbooks.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {playbooks.map((pb) => (
        <ApplyPlaybookChip key={pb.key} playbook={pb} />
      ))}
    </div>
  );
}

function ApplyPlaybookChip({ playbook }: { playbook: PlaybookSummary }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loadingWs, setLoadingWs] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<{ wsId: string; msId: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);

  const loadWorkspaces = async () => {
    if (workspaces) return;
    setLoadingWs(true);
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;
      const { data, error } = await supabaseClient
        .from('workspace_users')
        .select('workspace_id, workspaces(id, startups(name))')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(20);
      if (error) throw error;
      const opts: WorkspaceOption[] = (data || [])
        .map((row: any) => ({
          id: row.workspace_id,
          name: row.workspaces?.startups?.name || 'Workspace',
        }))
        .filter((w) => w.id);
      setWorkspaces(opts);
    } catch (e: any) {
      notify.error(e?.message || 'Não foi possível carregar workspaces.');
    } finally {
      setLoadingWs(false);
    }
  };

  const apply = async (workspaceId: string) => {
    setApplying(true);
    try {
      const { data, error } = await invokeWithAuth('copilot-apply-playbook', {
        body: { playbook_key: playbook.key, workspace_id: workspaceId },
      });
      if (error) throw error;
      const res = data as { milestone: { id: string; title: string }; actions_created: number };
      setDone({ wsId: workspaceId, msId: res.milestone.id });
      notify.success(
        `"${playbook.name}" aplicado: 1 milestone + ${res.actions_created} ações criadas.`
      );
      setOpen(false);
    } catch (e: any) {
      notify.error(e?.message || 'Não foi possível aplicar o playbook.');
    } finally {
      setApplying(false);
    }
  };

  const handleTriggerClick = async () => {
    if (done) {
      navigate(`/workspace/${done.wsId}?tab=milestones-actions`);
      return;
    }
    await loadWorkspaces();
    // If exactly one workspace, apply immediately without opening popover.
    setTimeout(() => {
      if (workspaces?.length === 1) {
        apply(workspaces[0].id);
      } else {
        setOpen(true);
      }
    }, 0);
  };

  if (done) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => navigate(`/workspace/${done.wsId}?tab=milestones-actions`)}
        className="h-7 gap-1.5 text-[11px] border-health-healthy/40 text-health-healthy hover:bg-health-healthy/5"
      >
        <CheckCircle2 className="h-3 w-3" />
        Ver no workspace
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={applying || loadingWs}
          onClick={(e) => {
            e.preventDefault();
            handleTriggerClick();
          }}
          className="h-7 gap-1.5 text-[11px] border-primary/30 text-primary hover:bg-primary/5"
        >
          {applying || loadingWs ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Aplicar "{playbook.name}"
          {(workspaces?.length ?? 0) > 1 && <ChevronDown className="h-3 w-3 opacity-60" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="text-[11px] text-muted-foreground px-2 pt-1 pb-2">
          Escolha o workspace onde criar o milestone e as ações:
        </p>
        <div className="space-y-1 max-h-60 overflow-auto">
          {(workspaces || []).map((w) => (
            <button
              key={w.id}
              onClick={() => apply(w.id)}
              disabled={applying}
              className="w-full text-left px-2 py-1.5 text-xs rounded-md hover:bg-muted disabled:opacity-50"
            >
              {w.name}
            </button>
          ))}
          {workspaces?.length === 0 && (
            <p className="text-[11px] text-muted-foreground px-2 py-2">
              Sem workspaces disponíveis.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
