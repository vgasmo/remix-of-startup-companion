import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Sparkles, 
  Loader2, 
  ChevronDown, 
  FileText,
  CheckCircle2,
  AlertCircle,
  ListTodo,
  Mic,
  Video,
  Eye
} from 'lucide-react';
import { useGenerateSessionArtifacts, useSessionTranscripts, useAddTranscript } from '@/hooks/useSessionArtifacts';
import { SessionTranscriptsViewer } from './SessionTranscriptsViewer';
import { MeetingIntegrationGuide } from './MeetingIntegrationGuide';
import { notify } from "@/lib/notify";

interface SessionArtifactsPanelProps {
  sessionId: string;
  sessionNotes?: string | null;
  sessionAgenda?: string | null;
  onClose?: () => void;
}

export function SessionArtifactsPanel({ 
  sessionId, 
  sessionNotes,
  sessionAgenda,
  onClose 
}: SessionArtifactsPanelProps) {
  const { t } = useTranslation();
  const { data: transcripts, isLoading: loadingTranscripts } = useSessionTranscripts(sessionId);
  const generateArtifacts = useGenerateSessionArtifacts();
  const addTranscript = useAddTranscript();
  
  const [manualTranscript, setManualTranscript] = useState('');
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [showTranscriptPreview, setShowTranscriptPreview] = useState(false);
  const [generatedArtifacts, setGeneratedArtifacts] = useState<{
    summary: string;
    decisions: string[];
    risks: string[];
    next_steps: string[];
  } | null>(null);
  const [actionsCreated, setActionsCreated] = useState<Array<{ id: string; title: string }>>([]);

  const hasContent = !!(sessionNotes || sessionAgenda || (transcripts && transcripts.length > 0));

  const [aiError, setAiError] = useState(false);

  const handleGenerate = async () => {
    setAiError(false);
    try {
      const result = await generateArtifacts.mutateAsync(sessionId);
      setGeneratedArtifacts(result.artifacts);
      setActionsCreated(result.actions_created);
    } catch {
      setAiError(true);
    }
  };

  const handleAddTranscript = async () => {
    if (!manualTranscript.trim()) {
      notify.error(t('sessions.enterTranscript', 'Introduza o texto da transcrição'));
      return;
    }
    
    await addTranscript.mutateAsync({
      sessionId,
      transcriptText: manualTranscript,
      source: 'manual'
    });
    
    setManualTranscript('');
    setShowTranscriptInput(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          {t('sessions.aiSessionAnalysis')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Content status */}
        <div className="flex flex-wrap gap-2">
          {sessionNotes && (
            <Badge variant="secondary" className="gap-1">
              <FileText className="h-3 w-3" />
              {t('sessions.notesAvailable')}
            </Badge>
          )}
          {sessionAgenda && (
            <Badge variant="secondary" className="gap-1">
              <ListTodo className="h-3 w-3" />
              {t('sessions.agendaAvailable')}
            </Badge>
          )}
          {transcripts && transcripts.length > 0 && (
            <Badge 
              variant="secondary" 
              className="gap-1 cursor-pointer hover:bg-secondary/80"
              onClick={() => setShowTranscriptPreview(!showTranscriptPreview)}
            >
              <Mic className="h-3 w-3" />
              {transcripts.length} {t('sessions.transcripts')}
              <Eye className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>

        {/* Transcript preview */}
        {showTranscriptPreview && transcripts && transcripts.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('sessions.transcriptPreview')}</Label>
            <SessionTranscriptsViewer sessionId={sessionId} showEmpty={false} />
          </div>
        )}

        {/* Add transcript option */}
        {!hasContent && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              {t('sessions.noContentToAnalyze')}
            </p>
            <MeetingIntegrationGuide compact />
          </div>
        )}

        <div className="flex gap-2">
          <Collapsible open={showTranscriptInput} onOpenChange={setShowTranscriptInput} className="flex-1">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${showTranscriptInput ? 'rotate-180' : ''}`} />
                {t('sessions.addTranscriptManually')}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <Textarea
                placeholder={t('sessions.pasteTranscript')}
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                rows={6}
              />
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={handleAddTranscript}
                  disabled={addTranscript.isPending}
                >
                  {addTranscript.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('sessions.saveTranscript')}
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setShowTranscriptInput(false)}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* AI error fallback */}
        {aiError && !generatedArtifacts && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center space-y-2">
            <AlertCircle className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t('sessions.aiUnavailable', { defaultValue: 'Análise IA indisponível neste momento. Pode adicionar notas manualmente e tentar novamente mais tarde.' })}
            </p>
          </div>
        )}

        {/* Generate button */}
        <Button 
          onClick={handleGenerate} 
          disabled={!hasContent || generateArtifacts.isPending}
          className="w-full"
        >
          {generateArtifacts.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('sessions.analyzing')}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              {aiError
                ? t('sessions.retryAnalysis', { defaultValue: 'Tentar novamente' })
                : t('sessions.generateSummaryActions')}
            </>
          )}
        </Button>

        {/* Generated results */}
        {generatedArtifacts && (
          <div className="space-y-4 pt-4 border-t">
            {generatedArtifacts.summary && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">{t('sessions.summary')}</h4>
                <p className="text-sm text-muted-foreground">
                  {generatedArtifacts.summary}
                </p>
              </div>
            )}

            {generatedArtifacts.decisions?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                  {t('sessions.decisionsLabel')}
                </h4>
                <ul className="text-sm space-y-1">
                  {generatedArtifacts.decisions.map((d, i) => (
                    <li key={i} className="text-muted-foreground">• {d}</li>
                  ))}
                </ul>
              </div>
            )}

            {generatedArtifacts.risks?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />
                  {t('sessions.risksAndConcerns')}
                </h4>
                <ul className="text-sm space-y-1">
                  {generatedArtifacts.risks.map((r, i) => (
                    <li key={i} className="text-muted-foreground">• {r}</li>
                  ))}
                </ul>
              </div>
            )}

            {actionsCreated.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-[hsl(var(--info))]" />
                  {t('sessions.actionsCreated')} ({actionsCreated.length})
                </h4>
                <ul className="text-sm space-y-1">
                  {actionsCreated.map((a) => (
                    <li key={a.id} className="text-muted-foreground">• {a.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
