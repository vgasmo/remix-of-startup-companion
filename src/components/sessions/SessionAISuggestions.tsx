import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Copy, Check, Loader2, Lightbulb, MessageSquare, ListChecks, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

interface AISuggestionsProps {
  sessionNotes: string;
  workspaceId: string;
  onApplySuggestion: (field: 'notes' | 'decisions', content: string) => void;
}

interface AISuggestions {
  summary: string;
  keyDecisions: string[];
  actionItems: string[];
  risks: string[];
  followUpQuestions: string[];
}

export function SessionAISuggestions({ sessionNotes, workspaceId, onApplySuggestion }: AISuggestionsProps) {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [aiError, setAiError] = useState(false);

  const handleGenerate = async () => {
    if (!sessionNotes?.trim() || sessionNotes.length < 50) {
      notify.error(t('sessions.notesMinLength'));
      return;
    }

    setIsGenerating(true);
    setAiError(false);
    try {
      const { data, error } = await supabase.functions.invoke('generate-session-suggestions', {
        body: { notes: sessionNotes, workspace_id: workspaceId },
      });

      if (error) throw error;
      setSuggestions(data);
    } catch (error: any) {
      logger.error('Error generating suggestions', {}, error);
      setAiError(true);
      notify.error(error.message || t('sessions.aiSuggestionsFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2000);
    notify.success(t('common.linkCopied'));
  };

  if (!suggestions) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-primary/60 mb-4" />
          <h3 className="font-semibold mb-2">{t('sessions.aiAssistant')}</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            {aiError
              ? t('sessions.aiTemporarilyUnavailable', 'A assistência IA está temporariamente indisponível. Tente novamente em alguns momentos.')
              : t('sessions.aiAssistantDesc')}
          </p>
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !sessionNotes?.trim()}
            variant={aiError ? 'outline' : 'default'}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('sessions.generating')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {aiError ? t('common.retry', 'Tentar novamente') : t('sessions.generateSuggestions')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{t('sessions.aiSuggestions')}</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('sessions.regenerate')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="summary" className="gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('sessions.summary')}</span>
            </TabsTrigger>
            <TabsTrigger value="decisions" className="gap-1">
              <Check className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('sessions.decisions')}</span>
            </TabsTrigger>
            <TabsTrigger value="actions" className="gap-1">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('sessions.actions')}</span>
            </TabsTrigger>
            <TabsTrigger value="risks" className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('sessions.risks')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm">{suggestions.summary}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onApplySuggestion('notes', suggestions.summary)}
            >
              {t('sessions.appendToNotes')}
            </Button>
          </TabsContent>

          <TabsContent value="decisions" className="space-y-2">
            {suggestions.keyDecisions.map((decision, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-sm flex-1">{decision}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleCopy(decision, `decision-${i}`)}
                >
                  {copiedItem === `decision-${i}` ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ))}
            {suggestions.keyDecisions.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onApplySuggestion('decisions', suggestions.keyDecisions.join('\n• '))}
              >
                {t('sessions.appendToDecisions')}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="actions" className="space-y-2">
            {suggestions.actionItems.map((action, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                <ListChecks className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="text-sm flex-1">{action}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleCopy(action, `action-${i}`)}
                >
                  {copiedItem === `action-${i}` ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="risks" className="space-y-2">
            {suggestions.risks.length > 0 ? (
              suggestions.risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span className="text-sm flex-1">{risk}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('sessions.noRisksIdentified')}
              </p>
            )}
          </TabsContent>
        </Tabs>

        {suggestions.followUpQuestions.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">{t('sessions.followUpQuestions')}</span>
            </div>
            <div className="space-y-2">
              {suggestions.followUpQuestions.map((question, i) => (
                <div key={i} className="text-sm text-muted-foreground pl-6">
                  • {question}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
