/**
 * FirstContactPrepSheet — Read-only prep sheet for consultant first-contact meetings.
 * Grounded in existing workspace/startup data. Degrades gracefully when data is missing.
 * 
 * IMPORTANT: Discovery questions, risk flags, and next steps are computed heuristics
 * based on available data — they are assistive guidance, not authoritative truth.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Rocket, User, Target, HelpCircle, FileText, AlertTriangle,
  Copy, CheckCircle2, Clock, TrendingUp, Lightbulb, ListChecks,
  ArrowRight, Building2, Briefcase, BookOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notify";

interface FirstContactPrepSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

function usePrepData(workspaceId: string) {
  return useQuery({
    queryKey: ['first-contact-prep', workspaceId],
    queryFn: async () => {
      const [wsRes, docsRes, kpiRes, membersRes, actionsRes, milestonesRes, sessionsRes] = await Promise.all([
        supabase.from('workspaces').select('id, status, stage, health_score, created_at, program_id, startup_id, programs(name), startups_safe(name, description, main_contact_email, website, nif)').eq('id', workspaceId).single(),
        supabase.from('documents').select('id, name, category, document_type').eq('workspace_id', workspaceId),
        supabase.from('kpi_values').select('id, kpi_definition_id, value, period_month, kpi_definitions(name, unit)').eq('workspace_id', workspaceId).order('period_month', { ascending: false }).limit(10),
        supabase.from('workspace_users').select('user_id, role, profiles_safe(full_name, email)').eq('workspace_id', workspaceId).eq('active', true),
        supabase.from('action_items').select('id, title, status, due_date').eq('workspace_id', workspaceId).limit(20),
        supabase.from('milestones').select('id, title, status, target_date').eq('workspace_id', workspaceId).limit(10),
        supabase.from('sessions').select('id, title, scheduled_at').eq('workspace_id', workspaceId).order('scheduled_at', { ascending: false }).limit(3),
      ]);

      return {
        workspace: wsRes.data,
        startup: (wsRes.data as any)?.startups,
        program: (wsRes.data as any)?.programs,
        documents: docsRes.data || [],
        kpis: kpiRes.data || [],
        members: membersRes.data || [],
        actions: actionsRes.data || [],
        milestones: milestonesRes.data || [],
        sessions: sessionsRes.data || [],
      };
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

function Section({ icon: Icon, title, children }: { icon: typeof Rocket; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />{title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value, missing }: { label: string; value?: string | null; missing?: string }) {
  return (
    <div className="flex justify-between items-baseline text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
      ) : (
        <span className="text-xs text-amber-600 italic flex items-center gap-1">
          <HelpCircle className="h-3 w-3" />{missing || 'Desconhecido'}
        </span>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  ideation: 'Ideação',
  validation: 'Validação',
  mvp: 'MVP',
  growth: 'Crescimento',
  scale: 'Escala',
};

export function FirstContactPrepSheet({ open, onOpenChange, workspaceId }: FirstContactPrepSheetProps) {
  const { t } = useTranslation();
  const { data, isLoading } = usePrepData(workspaceId);

  const unknowns = useMemo(() => {
    if (!data) return [];
    const items: string[] = [];
    const s = data.startup;
    if (!s?.sector) items.push('Setor/Indústria');
    if (!s?.business_model) items.push('Modelo de Negócio');
    if (!s?.website) items.push('Website');
    if (data.documents.length === 0) items.push('Documentos (pitch deck, modelo financeiro)');
    if (data.kpis.length === 0) items.push('KPIs/Métricas');
    if (data.milestones.length === 0) items.push('Milestones definidos');
    return items;
  }, [data]);

  const discoveryQuestions = useMemo(() => {
    if (!data) return [];
    const qs: string[] = [];
    const stage = data.workspace?.stage;
    
    // Always ask
    qs.push('Qual o problema principal que estão a resolver?');
    qs.push('Quem é o vosso cliente ideal (ICP)?');
    
    if (!data.startup?.business_model) qs.push('Qual é o modelo de receita?');
    if (data.kpis.length === 0) qs.push('Que métricas estão a acompanhar atualmente?');
    
    if (stage === 'ideation') {
      qs.push('Já validaram o problema com potenciais clientes?');
      qs.push('Têm algum protótipo ou mockup?');
    } else if (stage === 'validation') {
      qs.push('Quantas entrevistas/testes já fizeram?');
      qs.push('O que aprenderam até agora sobre product-market fit?');
    } else if (stage === 'mvp') {
      qs.push('Quantos utilizadores/clientes ativos têm?');
      qs.push('Qual o feedback mais comum?');
    } else if (stage === 'growth' || stage === 'scale') {
      qs.push('Qual o MRR/ARR atual?');
      qs.push('Quais os maiores bottlenecks ao crescimento?');
    }
    
    qs.push('Quais as maiores dificuldades neste momento?');
    qs.push('O que esperam da incubação?');
    
    return qs;
  }, [data]);

  const docRequests = useMemo(() => {
    if (!data) return [];
    const existing = new Set(data.documents.map(d => d.category?.toLowerCase()));
    const needed: string[] = [];
    if (!existing.has('pitch_deck')) needed.push('Pitch Deck');
    if (!existing.has('financial_model')) needed.push('Modelo Financeiro');
    if (!existing.has('legal')) needed.push('Documentos Legais (pacto social, NIF)');
    if (!existing.has('product')) needed.push('Documentação de Produto');
    if (!existing.has('team')) needed.push('Organigrama / Perfis da Equipa');
    return needed;
  }, [data]);

  const risks = useMemo(() => {
    if (!data) return [];
    const items: string[] = [];
    const members = data.members;
    const founders = members.filter((m: any) => m.role === 'founder');
    
    if (founders.length === 1) items.push('Fundador único — risco de person dependency');
    if (data.startup?.sector && !data.startup?.business_model) items.push('Setor definido mas sem modelo de negócio claro');
    if (data.kpis.length === 0) items.push('Sem métricas registadas — dificuldade em medir progresso');
    if (data.documents.length === 0) items.push('Sem documentação — preparação pode ser insuficiente');
    if (data.workspace?.stage === 'ideation') items.push('Fase de ideação — alto risco de pivotação');
    
    return items;
  }, [data]);

  const handleCopyAll = () => {
    if (!data) return;
    const s = data.startup;
    const lines = [
      `# Prep Sheet: ${s?.name || 'Startup'}`,
      `Programa: ${data.program?.name || '—'}`,
      `Fase: ${STAGE_LABELS[data.workspace?.stage || ''] || data.workspace?.stage || '—'}`,
      `Contacto: ${s?.main_contact_email || '—'}`,
      '',
      '## O que sabemos',
      `Setor: ${s?.sector || '?'}`,
      `Modelo: ${s?.business_model || '?'}`,
      `Website: ${s?.website || '?'}`,
      `Membros: ${data.members.length}`,
      `Documentos: ${data.documents.length}`,
      '',
      '## O que falta saber',
      ...unknowns.map(u => `- ${u}`),
      '',
      '## Perguntas de descoberta',
      ...discoveryQuestions.map((q, i) => `${i + 1}. ${q}`),
      '',
      '## Documentos a pedir',
      ...docRequests.map(d => `- ${d}`),
      '',
      '## Riscos identificados',
      ...risks.map(r => `⚠ ${r}`),
      '',
      '## Agenda sugerida (45 min)',
      '1. Apresentações e contexto (5 min)',
      '2. Problema e solução (10 min)',
      '3. Estado atual e métricas (10 min)',
      '4. Equipa e recursos (5 min)',
      '5. Expectativas da incubação (5 min)',
      '6. Próximos passos (10 min)',
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    notify.success(t('consultor.prepSheetCopied', 'Prep sheet copiado!'));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg p-0">
        <ScrollArea className="h-full">
          <div className="px-6 py-6 space-y-5">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                {t('prep.title', { defaultValue: 'Prep Sheet — Primeiro Contacto' })}
              </SheetTitle>
              <SheetDescription>
                {data?.startup?.name || 'A carregar...'}
              </SheetDescription>
            </SheetHeader>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
              </div>
            ) : !data ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('common.dataNotAvailable', 'Dados não disponíveis.')}</p>
            ) : (
              <>
                {/* Copy All */}
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleCopyAll}>
                  <Copy className="h-4 w-4" /> Copiar resumo completo
                </Button>

                {/* Startup Snapshot */}
                <Section icon={Rocket} title="Snapshot da Startup">
                  <Card className="rounded-lg">
                    <CardContent className="pt-3 pb-2 space-y-1.5">
                      <InfoRow label="Nome" value={data.startup?.name} />
                      <InfoRow label="Programa" value={data.program?.name} missing="Sem programa" />
                      <InfoRow label="Fase" value={STAGE_LABELS[data.workspace?.stage || ''] || data.workspace?.stage} />
                      <InfoRow label="Setor" value={data.startup?.sector} missing="Perguntar" />
                      <InfoRow label="Modelo" value={data.startup?.business_model} missing="Perguntar" />
                      <InfoRow label="Website" value={data.startup?.website} missing="Não fornecido" />
                      <InfoRow label="NIF" value={data.startup?.nif} missing="Não fornecido" />
                    </CardContent>
                  </Card>
                </Section>

                {/* Founder Snapshot */}
                <Section icon={User} title="Equipa / Contacto">
                  <Card className="rounded-lg">
                    <CardContent className="pt-3 pb-2 space-y-1.5">
                      <InfoRow label="Email" value={data.startup?.main_contact_email} missing="Não disponível" />
                      <InfoRow label="Membros" value={`${data.members.length} registados`} />
                      {data.members.slice(0, 3).map((m: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[9px]">{m.role}</Badge>
                          <span className="truncate">{m.profiles_safe?.full_name || m.profiles_safe?.email || '—'}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </Section>

                {/* What's Unknown */}
                {unknowns.length > 0 && (
                  <Section icon={HelpCircle} title="O que falta saber">
                    <Card className="rounded-lg border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10">
                      <CardContent className="pt-3 pb-2">
                        <ul className="space-y-1">
                          {unknowns.map((u, i) => (
                            <li key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                              <HelpCircle className="h-3 w-3 mt-0.5 shrink-0" />
                              {u}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </Section>
                )}

                <Separator />

                {/* Discovery Questions — assistive, not authoritative */}
                <Section icon={Lightbulb} title="Perguntas sugeridas (orientação)">
                  <Card className="rounded-lg">
                    <CardContent className="pt-3 pb-2">
                      <ol className="space-y-1.5">
                        {discoveryQuestions.map((q, i) => (
                          <li key={i} className="text-xs flex items-start gap-2">
                            <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                            {q}
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                </Section>

                {/* Document Requests */}
                {docRequests.length > 0 && (
                  <Section icon={FileText} title="Documentos a pedir">
                    <Card className="rounded-lg">
                      <CardContent className="pt-3 pb-2">
                        <ul className="space-y-1">
                          {docRequests.map((d, i) => (
                            <li key={i} className="text-xs flex items-center gap-1.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </Section>
                )}

                {/* Risks — computed heuristic */}
                {risks.length > 0 && (
                  <Section icon={AlertTriangle} title="Pontos de atenção (estimativa)">
                    <Card className="rounded-lg border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10">
                      <CardContent className="pt-3 pb-2">
                        <ul className="space-y-1.5">
                          {risks.map((r, i) => (
                            <li key={i} className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </Section>
                )}

                <Separator />

                {/* Suggested Agenda */}
                <Section icon={ListChecks} title="Agenda sugerida (45 min)">
                  <Card className="rounded-lg">
                    <CardContent className="pt-3 pb-2">
                      {[
                        { time: '5 min', item: 'Apresentações e contexto' },
                        { time: '10 min', item: 'Problema e solução' },
                        { time: '10 min', item: 'Estado atual e métricas' },
                        { time: '5 min', item: 'Equipa e recursos' },
                        { time: '5 min', item: 'Expectativas da incubação' },
                        { time: '10 min', item: 'Próximos passos e compromissos' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <Badge variant="outline" className="text-[9px] shrink-0 w-14 justify-center">{item.time}</Badge>
                          <span>{item.item}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </Section>

                {/* Next Steps */}
                <Section icon={ArrowRight} title="Sugestões de próximos passos">
                  <Card className="rounded-lg bg-primary/5 border-primary/20">
                    <CardContent className="pt-3 pb-2">
                      <ul className="space-y-1.5">
                        {[
                          'Definir OKRs/milestones para o próximo mês',
                          'Agendar sessão de follow-up em 2 semanas',
                          'Solicitar documentos em falta',
                          'Configurar KPIs na plataforma',
                          'Apresentar recursos e ferramentas disponíveis',
                        ].map((step, i) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                            {step}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </Section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
