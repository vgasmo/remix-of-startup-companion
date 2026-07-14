import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { FileText, Mic, Video, Loader2, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useSessionTranscripts, SessionTranscript } from '@/hooks/useSessionArtifacts';
import { useState } from 'react';

interface SessionTranscriptsViewerProps {
  sessionId: string;
  showEmpty?: boolean;
}

const SOURCE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  manual: { label: 'Manual', icon: FileText, color: 'bg-muted text-muted-foreground' },
  voice: { label: 'Voice', icon: Mic, color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ' },
  meeting_ingest: { label: 'Meeting', icon: Video, color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ' },
  zoom: { label: 'Zoom', icon: Video, color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ' },
  google_meet: { label: 'Google Meet', icon: Video, color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ' },
};

export function SessionTranscriptsViewer({ sessionId, showEmpty = true }: SessionTranscriptsViewerProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { data: transcripts, isLoading } = useSessionTranscripts(sessionId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (!transcripts || transcripts.length === 0) {
    if (!showEmpty) return null;
    
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-4 text-center">
          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('sessions.noTranscripts')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('sessions.noTranscriptsHint')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {transcripts.map((transcript) => (
        <TranscriptItem 
          key={transcript.id} 
          transcript={transcript}
          isExpanded={expandedIds.has(transcript.id)}
          onToggle={() => toggleExpanded(transcript.id)}
        />
      ))}
    </div>
  );
}

function TranscriptItem({ 
  transcript, 
  isExpanded, 
  onToggle 
}: { 
  transcript: SessionTranscript; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const dateLocale = useDateLocale();
  const config = SOURCE_CONFIG[transcript.source] || SOURCE_CONFIG.manual;
  const Icon = config.icon;
  const previewText = transcript.transcript_text?.slice(0, 150) || '';
  const hasMore = (transcript.transcript_text?.length || 0) > 150;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <div className={`p-1.5 rounded ${config.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px]">
                      {config.label}
                    </Badge>
                    {transcript.created_at && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(transcript.created_at), 'MMM d, h:mm a', { locale: dateLocale })}
                      </span>
                    )}
                  </div>
                  {!isExpanded && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {previewText}{hasMore ? '...' : ''}
                    </p>
                  )}
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0">
            <ScrollArea  viewportClassName="max-h-48">
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {transcript.transcript_text}
              </p>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
