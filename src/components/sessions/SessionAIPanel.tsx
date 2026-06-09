import { useState, useCallback } from 'react';
import { useAICooldown } from '@/hooks/useAICooldown';
import { checkRateLimit } from '@/hooks/useRateLimiter';
import { useTranslation } from 'react-i18next';
import { 
  Sparkles, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  Target,
  Mail,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Video,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  useGenerateSessionSummary, 
  useSendSessionFollowup, 
  useApplyActionSuggestions,
  useUpdateSessionTranscript,
} from '@/hooks/useSessionAI';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface SessionAIPanelProps {
  workspaceId: string;
  sessionId: string;
  session: {
    title: string;
    notes?: string | null;
    agenda?: string | null;
    raw_transcript?: string | null;
    teams_meeting_url?: string | null;
    ai_summary?: string | null;
    ai_decisions?: string[] | null;
    ai_risks?: { risk: string; severity: string }[] | null;
    ai_action_suggestions?: { title: string; description: string; priority: string; suggestedDueInDays?: number }[] | null;
    ai_kpi_prompts?: { kpiName: string; reason: string; suggestedAction: string }[] | null;
    ai_generated_at?: string | null;
  };
  canWrite: boolean;
  onRefresh?: () => void;
}

export function SessionAIPanel({ workspaceId, sessionId, session, canWrite, onRefresh }: SessionAIPanelProps) {
  const { t } = useTranslation();
  const [showImport, setShowImport] = useState(false);
  const [transcript, setTranscript] = useState(session.raw_transcript || '');
  const [selectedActions, setSelectedActions] = useState<number[]>([]);
  const [isFetchingTeams, setIsFetchingTeams] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    decisions: true,
    risks: false,
    actions: true,
    kpis: false,
  });

  const generateMutation = useGenerateSessionSummary(workspaceId);
  const sendFollowupMutation = useSendSessionFollowup(workspaceId);
  const applyActionsMutation = useApplyActionSuggestions(workspaceId);
  const saveTranscriptMutation = useUpdateSessionTranscript(workspaceId);

  // AI cooldown: 60s after generation
  const { isCoolingDown, remainingSeconds } = useAICooldown({
    rateLimitKey: `session-ai-${sessionId}`,
    cooldownMs: 60000,
    maxRequests: 5,
    windowMs: 300000,
  });

  const hasAIOutputs = !!session.ai_summary || !!session.ai_generated_at;
  const actionSuggestions = session.ai_action_suggestions || [];
  const risks = session.ai_risks || [];
  const kpiPrompts = session.ai_kpi_prompts || [];
  const decisions = session.ai_decisions || [];

  const handleGenerate = async () => {
    if (isCoolingDown) return;
    if (!checkRateLimit(`session-ai-${sessionId}`, 5, 300000)) {
      notify.error(t('errors.rateLimitReached'));
      return;
    }
    setAiError(false);
    try {
      await generateMutation.mutateAsync({ 
        sessionId, 
        transcript: transcript.trim() || undefined,
      });
      onRefresh?.();
    } catch {
      setAiError(true);
    }
  };

  const handleApplySelected = async () => {
    const selected = selectedActions.map(i => actionSuggestions[i]);
    if (selected.length === 0) return;
    try {
      await applyActionsMutation.mutateAsync({ sessionId, suggestions: selected as any });
      setSelectedActions([]);
      onRefresh?.();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const handleApplyAll = async () => {
    if (actionSuggestions.length === 0) return;
    try {
      await applyActionsMutation.mutateAsync({ sessionId, suggestions: actionSuggestions as any });
      onRefresh?.();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const handleSendFollowup = async () => {
    try {
      await sendFollowupMutation.mutateAsync({ sessionId });
    } catch {
      // Error already handled by mutation onError
    }
  };

  const handleSaveTranscript = async () => {
    if (!transcript.trim()) return;
    try {
      await saveTranscriptMutation.mutateAsync({ sessionId, transcript: transcript.trim() });
    } catch {
      // Error already handled by mutation onError
    }
  };

  const handleFetchFromTeams = async () => {
    setIsFetchingTeams(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-teams-transcript', {
        body: { session_id: sessionId },
      });

      if (error) {
        notify.error(t('errors.aiProcessingError'));
        logger.error('Teams transcript import error', {}, error);
        return;
      }

      if (data?.success && data?.status === 'ok' && data?.transcript_text) {
        setTranscript(data.transcript_text);
        notify.success(t('sessions.transcriçãoImportadaEGuardadaCom'));
        onRefresh?.();
      } else if (data?.status === 'not_ready') {
        notify.info(t('sessions.aindaNãoHáTranscriçãoDisponível'));
      } else if (data?.status === 'no_meeting_url') {
        notify.warn(t('sessions.estaSessãoNãoTemLink'));
      } else if (data?.status === 'not_found') {
        notify.warn(t('sessions.reuniãoNãoEncontradaNoTeams'));
      } else if (data?.status === 'forbidden_policy') {
        notify.error(t('sessions.faltaApplicationAccessPolicyNo'));
      } else {
        notify.error(data?.error || 'Erro ao importar transcrição');
      }
    } catch (err) {
      logger.error('Teams transcript fetch error', {}, err);
      notify.error(t('errors.aiProcessingError'));
    } finally {
      setIsFetchingTeams(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleActionSelection = (index: number) => {
    setSelectedActions(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground ',
    medium: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
    high: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
    urgent: 'bg-destructive/10 text-destructive ',
  };

  const severityColors: Record<string, string> = {
    low: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
    medium: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
    high: 'bg-destructive/10 text-destructive ',
  };

  return (
    <div className="space-y-4">
      {/* Import Section */}
      {canWrite && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t('sessions.aiAssistant', 'Assistente AI de Reunião')}</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImport(!showImport)}
              >
                <Upload className="h-4 w-4 mr-2" />
                {showImport ? t('sessions.hideImport', 'Ocultar Importação') : t('sessions.importTranscript', 'Importar Transcrição')}
              </Button>
            </div>
            <CardDescription>
              {aiError
                ? t('sessions.aiTemporarilyUnavailable', 'AI assistance is temporarily resting. Please try again in a few moments.')
                : hasAIOutputs 
                  ? t('sessions.lastGenerated', { date: new Date(session.ai_generated_at!).toLocaleString(), defaultValue: `Última geração: ${new Date(session.ai_generated_at!).toLocaleString()}` })
                  : t('sessions.aiDescription', 'Gerar resumo AI, ações e insights a partir das notas ou transcrição da reunião')
              }
            </CardDescription>
          </CardHeader>
          
          {showImport && (
            <CardContent className="pt-0">
              <div className="space-y-3">
                <Textarea
                  placeholder="Paste transcript from Teams, Zoom, or any meeting recording tool...&#10;&#10;You can also paste meeting notes or a summary."
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveTranscript}
                    disabled={!transcript.trim() || saveTranscriptMutation.isPending}
                  >
                    {saveTranscriptMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Save Transcript
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleFetchFromTeams}
                    disabled={isFetchingTeams}
                    title={!session.teams_meeting_url ? t('sessions.ai.teamsNotReady') : t('sessions.ai.importTeams')}
                  >
                    {isFetchingTeams ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Video className="h-4 w-4 mr-2" />
                    )}
                    {t('sessions.ai.fetchTeams')}
                  </Button>
                </div>
                {!session.teams_meeting_url && (
                  <p className="text-xs text-muted-foreground">
                    💡 {t('sessions.ai.teamsTranscriptHint')}
                  </p>
                )}
              </div>
            </CardContent>
          )}
          
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || isCoolingDown}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : isCoolingDown ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 opacity-50" />
                    Wait {remainingSeconds}s
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {hasAIOutputs ? 'Regenerate Summary' : 'Generate with AI'}
                  </>
                )}
              </Button>
              
              {hasAIOutputs && (
                <Button
                  variant="outline"
                  onClick={handleSendFollowup}
                  disabled={sendFollowupMutation.isPending}
                >
                  {sendFollowupMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send Follow-up Email
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Outputs */}
      {hasAIOutputs && (
        <div className="space-y-3">
          {/* Summary */}
          {session.ai_summary && (
            <Collapsible open={expandedSections.summary} onOpenChange={() => toggleSection('summary')}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[hsl(var(--info))]" />
                        <CardTitle className="text-sm">{t('sessions.summary', 'Resumo')}</CardTitle>
                      </div>
                      {expandedSections.summary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{session.ai_summary}</p>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Decisions */}
          {decisions.length > 0 && (
            <Collapsible open={expandedSections.decisions} onOpenChange={() => toggleSection('decisions')}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                        <CardTitle className="text-sm">{t('sessions.keyDecisions', 'Decisões-Chave')}</CardTitle>
                        <Badge variant="secondary" className="text-xs">{decisions.length}</Badge>
                      </div>
                      {expandedSections.decisions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <ul className="space-y-2">
                      {decisions.map((decision, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 flex-shrink-0" />
                          <span>{decision}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Risks */}
          {risks.length > 0 && (
            <Collapsible open={expandedSections.risks} onOpenChange={() => toggleSection('risks')}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                        <CardTitle className="text-sm">{t('sessions.risks', 'Riscos & Preocupações')}</CardTitle>
                        <Badge variant="secondary" className="text-xs">{risks.length}</Badge>
                      </div>
                      {expandedSections.risks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <ul className="space-y-2">
                      {risks.map((risk, i) => (
                        <li key={i} className="flex items-start justify-between gap-2 text-sm">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 flex-shrink-0" />
                            <span>{risk.risk}</span>
                          </div>
                          <Badge className={cn('text-xs', severityColors[risk.severity])}>{risk.severity}</Badge>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Action Suggestions */}
          {actionSuggestions.length > 0 && (
            <Collapsible open={expandedSections.actions} onOpenChange={() => toggleSection('actions')}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm">{t('sessions.suggestedActions', 'Ações Sugeridas')}</CardTitle>
                        <Badge variant="secondary" className="text-xs">{actionSuggestions.length}</Badge>
                      </div>
                      {expandedSections.actions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    <div className="space-y-2">
                      {actionSuggestions.map((action, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                            selectedActions.includes(i) ? "border-primary bg-primary/5" : "border-border"
                          )}
                        >
                          {canWrite && (
                            <Checkbox
                              checked={selectedActions.includes(i)}
                              onCheckedChange={() => toggleActionSelection(i)}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{action.title}</span>
                              <Badge className={cn('text-xs', priorityColors[action.priority])}>{action.priority}</Badge>
                            </div>
                            {action.description && (
                              <p className="text-sm text-muted-foreground">{action.description}</p>
                            )}
                            {action.suggestedDueInDays && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('sessions.suggestedDue', { days: action.suggestedDueInDays, defaultValue: `Prazo sugerido: ${action.suggestedDueInDays} dia(s)` })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {canWrite && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={handleApplySelected}
                          disabled={selectedActions.length === 0 || applyActionsMutation.isPending}
                        >
                          {applyActionsMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          {t('sessions.applySelected', { count: selectedActions.length, defaultValue: `Aplicar Selecionadas (${selectedActions.length})` })}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleApplyAll}
                          disabled={applyActionsMutation.isPending}
                        >
                          {t('sessions.applyAll', 'Aplicar Todas')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* KPI Prompts */}
          {kpiPrompts.length > 0 && (
            <Collapsible open={expandedSections.kpis} onOpenChange={() => toggleSection('kpis')}>
              <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/50 ">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-[hsl(var(--warning))]/50 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-[hsl(var(--warning))]" />
                        <CardTitle className="text-sm text-[hsl(var(--warning))]">{t('sessions.kpisToUpdate', 'KPIs para Atualizar')}</CardTitle>
                        <Badge variant="outline" className="text-xs border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))] ">{kpiPrompts.length}</Badge>
                      </div>
                      {expandedSections.kpis ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <ul className="space-y-3">
                      {kpiPrompts.map((kpi, i) => (
                        <li key={i} className="space-y-1">
                          <div className="font-medium text-sm text-[hsl(var(--warning))]">{kpi.kpiName}</div>
                          <p className="text-sm text-[hsl(var(--warning))]">{kpi.reason}</p>
                          {kpi.suggestedAction && (
                            <p className="text-xs text-[hsl(var(--warning))]">💡 {kpi.suggestedAction}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
