/**
 * OpsActionPrompts — CRM-style suggested actions (read-only, no mutations).
 * Computed from existing readable data. Dismissals persist per-user on
 * `profiles.dismissed_prompts` (jsonb array of prompt ids).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, FileText, CheckCircle2, ArrowRight, Copy, X,
  Send, ClipboardCheck, Link2Off, Zap, Eye, Building2, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notify";
import { useNavigate } from 'react-router-dom';

interface ActionPrompt {
  id: string;
  type: 'missing_contract' | 'ready_activation' | 'review_addons' | 'missing_allocation_link' | 'pending_signature' | 'onboarding_no_contract';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  entityName: string;
  workspaceId?: string;
  contractId?: string;
  actions: Array<{ label: string; icon: typeof FileText; onClick: () => void }>;
}

// Local storage helpers removed — dismissals now persist on profiles.dismissed_prompts.

const CONTRACT_EMAIL_TEMPLATE = `Assunto: Contrato de Incubação — Startup Leiria

Estimado(a),

Seguem em anexo os documentos relativos ao contrato de incubação.

Por favor, reveja os termos e proceda à assinatura dentro de 5 dias úteis.

Em caso de dúvidas, estamos disponíveis.

Com os melhores cumprimentos,
Equipa Startup Leiria`;

const ACTIVATION_CHECKLIST = `✅ Checklist de Ativação:
1. Contrato assinado e arquivado
2. Espaço atribuído (sala/gabinete)
3. Consultor designado
4. Sessão de onboarding agendada
5. Acesso à plataforma configurado
6. Dados de faturação validados`;

export function OpsActionPrompts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Persisted dismissals (per-user) from profiles.dismissed_prompts.
  const { data: dismissedList } = useQuery({
    queryKey: ['profile', 'dismissed_prompts', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from('profiles')
        .select('dismissed_prompts')
        .eq('id', user!.id)
        .maybeSingle();
      const raw = (data?.dismissed_prompts ?? []) as unknown;
      return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
    },
  });
  const dismissed = useMemo(() => new Set<string>(dismissedList ?? []), [dismissedList]);

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('not authenticated');
      const next = Array.from(new Set<string>([...(dismissedList ?? []), id]));
      const { error } = await supabase
        .from('profiles')
        .update({ dismissed_prompts: next })
        .eq('id', user.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['profile', 'dismissed_prompts', user?.id], next);
    },
  });

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['ops-action-prompts'],
    queryFn: async (): Promise<ActionPrompt[]> => {
      const today = new Date().toISOString().split('T')[0];
      const result: ActionPrompt[] = [];

      // Fetch workspaces with status info
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id, status, startup_id, startups(name)')
        .in('status', ['active', 'claimed', 'pending', 'onboarding']);

      // Fetch all contracts
      const { data: contracts } = await supabase
        .from('startup_contracts')
        .select('id, workspace_id, status, incubation_type:incubation_types(name)')
        .in('status', ['active', 'draft', 'pending_signature']);

      // Fetch allocations
      const { data: allocations } = await supabase
        .from('room_allocations')
        .select('id, room_id, workspace_id')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`);

      const contractByWs = new Map<string, any>();
      (contracts || []).forEach(c => {
        if (c.workspace_id) contractByWs.set(c.workspace_id, c);
      });

      const allocByWs = new Map<string, any>();
      (allocations || []).forEach(a => {
        if (a.workspace_id) allocByWs.set(a.workspace_id, a);
      });

      (workspaces || []).forEach((ws: any) => {
        const name = ws.startups?.name || 'Startup desconhecida';
        const contract = contractByWs.get(ws.id);
        const allocation = allocByWs.get(ws.id);

        // Onboarding/pending without contract
        if (['pending', 'onboarding'].includes(ws.status) && !contract) {
          result.push({
            id: `onboarding-no-contract-${ws.id}`,
            type: 'onboarding_no_contract',
            severity: 'warning',
            title: t('ops.onboardingNoContract.title', { defaultValue: 'Contrato por enviar' }),
            description: t('ops.onboardingNoContract.desc', {
              defaultValue: '{{name}} está em {{state}} sem contrato registado.',
              name,
              state: ws.status === 'pending'
                ? t('ops.state.pending', { defaultValue: 'estado pendente' })
                : t('ops.state.onboarding', { defaultValue: 'onboarding' }),
            }),
            entityName: name,
            workspaceId: ws.id,
            actions: [],
          });
        }

        // Contract signed but workspace not active
        if (contract?.status === 'active' && ws.status !== 'active') {
          result.push({
            id: `ready-activation-${ws.id}`,
            type: 'ready_activation',
            severity: 'info',
            title: t('ops.readyActivation.title', { defaultValue: 'Pronto para ativação manual' }),
            description: t('ops.readyActivation.desc', {
              defaultValue: '{{name}} tem contrato ativo mas workspace em estado "{{status}}".',
              name,
              status: ws.status,
            }),
            entityName: name,
            workspaceId: ws.id,
            contractId: contract.id,
            actions: [],
          });
        }

        // Pending signature
        if (contract?.status === 'pending_signature') {
          result.push({
            id: `pending-sig-${ws.id}`,
            type: 'pending_signature',
            severity: 'warning',
            title: t('ops.pendingSignature.title', { defaultValue: 'Aguarda assinatura' }),
            description: t('ops.pendingSignature.desc', {
              defaultValue: 'O contrato de {{name}} está pendente de assinatura.',
              name,
            }),
            entityName: name,
            workspaceId: ws.id,
            contractId: contract.id,
            actions: [],
          });
        }

        // Active workspace without contract
        if (ws.status === 'active' && !contract) {
          result.push({
            id: `active-no-contract-${ws.id}`,
            type: 'missing_contract',
            severity: 'critical',
            title: t('ops.missingContract.title', { defaultValue: 'Sem contrato' }),
            description: t('ops.missingContract.desc', {
              defaultValue: '{{name}} tem workspace ativo sem contrato associado.',
              name,
            }),
            entityName: name,
            workspaceId: ws.id,
            actions: [],
          });
        }

        // Allocation without clear workspace link
        if (ws.status === 'active' && !allocation) {
          result.push({
            id: `no-allocation-${ws.id}`,
            type: 'missing_allocation_link',
            severity: 'info',
            title: t('ops.missingAllocation.title', { defaultValue: 'Sem espaço atribuído' }),
            description: t('ops.missingAllocation.desc', {
              defaultValue: '{{name}} não tem sala/gabinete alocado.',
              name,
            }),
            entityName: name,
            workspaceId: ws.id,
            actions: [],
          });
        }
      });

      // Sort by severity

      const order = { critical: 0, warning: 1, info: 2 };
      result.sort((a, b) => order[a.severity] - order[b.severity]);

      return result;
    },
    staleTime: 60_000,
  });

  const visiblePrompts = useMemo(() => {
    if (!prompts) return [];
    return prompts.filter(p => !dismissed.has(p.id));
  }, [prompts, dismissed]);

  const handleDismiss = (id: string) => {
    dismissMutation.mutate(id);
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(CONTRACT_EMAIL_TEMPLATE);
    notify.success(t('ops.emailTemplateCopied', 'Template de email copiado'));
  };

  const handleCopyChecklist = () => {
    navigator.clipboard.writeText(ACTIVATION_CHECKLIST);
    notify.success(t('ops.checklistCopied', 'Checklist copiada'));
  };

  if (isLoading) {
    return <Skeleton className="h-[200px] rounded-xl" />;
  }

  if (visiblePrompts.length === 0) {
    return (
      <Card className="rounded-xl border-success/30">
        <CardContent className="py-6 flex items-center gap-3 justify-center">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <span className="text-sm text-muted-foreground">
            {t('ops.prompts.allClear', { defaultValue: 'Sem ações pendentes — tudo em ordem!' })}
          </span>
        </CardContent>
      </Card>
    );
  }

  const severityColors = {
    critical: 'border-destructive/30 bg-destructive/50 dark:bg-destructive/20',
    warning: 'border-warning/30 bg-warning/50 dark:bg-warning/20',
    info: 'border-info/30 bg-info/30 dark:bg-info/10',
  };

  const severityIcons = {
    critical: <AlertTriangle className="h-4 w-4 text-destructive" />,
    warning: <AlertTriangle className="h-4 w-4 text-warning" />,
    info: <Zap className="h-4 w-4 text-info" />,
  };

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          {t('ops.prompts.title', { defaultValue: 'Ações Sugeridas' })}
          <Badge variant="secondary" className="ml-auto">{visiblePrompts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea  viewportClassName="max-h-[400px]">
          <div className="space-y-2 px-6 pb-4">
            {visiblePrompts.map(prompt => (
              <div
                key={prompt.id}
                className={cn(
                  'rounded-lg border p-3 space-y-2 transition-colors',
                  severityColors[prompt.severity]
                )}
              >
                <div className="flex items-start gap-2">
                  {severityIcons[prompt.severity]}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{prompt.title}</p>
                    <p className="text-xs text-muted-foreground">{prompt.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
                    onClick={()=> handleDismiss(prompt.id)}
                   aria-label={t('common.close')}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prompt.type === 'onboarding_no_contract' && (
                    <>
                      <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleCopyTemplate}>
                        <Copy className="h-3 w-3" /> Copiar template email
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleCopyChecklist}>
                        <ClipboardCheck className="h-3 w-3" /> Checklist contrato
                      </Button>
                    </>
                  )}
                  {prompt.type === 'ready_activation' && (
                    <>
                      <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleCopyChecklist}>
                        <ClipboardCheck className="h-3 w-3" /> Checklist ativação
                      </Button>
                      {prompt.workspaceId && (
                        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => navigate(`/workspace/${prompt.workspaceId}`)}>
                          <ArrowRight className="h-3 w-3" /> Abrir startup
                        </Button>
                      )}
                    </>
                  )}
                  {prompt.type === 'pending_signature' && (
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleCopyTemplate}>
                      <Send className="h-3 w-3" /> Copiar lembrete
                    </Button>
                  )}
                  {(prompt.type === 'missing_contract' || prompt.type === 'missing_allocation_link') && prompt.workspaceId && (
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => navigate(`/workspace/${prompt.workspaceId}`)}>
                      <Eye className="h-3 w-3" /> Ver startup
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
