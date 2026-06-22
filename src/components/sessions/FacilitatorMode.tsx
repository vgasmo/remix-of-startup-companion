import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Target,
  Lightbulb,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSessionExercises, Exercise } from '@/hooks/useExerciseLibrary';
import { cn } from '@/lib/utils';

interface FacilitatorModeProps {
  session: {
    id: string;
    title: string;
    agenda?: string | null;
    duration?: number | null;
  };
  onClose: () => void;
  onCreateAction?: () => void;
}

interface AgendaItem {
  type: 'agenda' | 'exercise';
  title: string;
  duration?: number;
  content?: string;
  exercise?: Exercise;
  stepIndex?: number;
}

const OPENING_PHRASES = [
  "Welcome! Today we'll focus on...",
  "Let's start by reviewing our objectives...",
  "Before we dive in, any updates since last time?",
];

const CLOSING_PHRASES = [
  "To wrap up, let's summarize the key takeaways...",
  "What's the one thing you're committing to before next session?",
  "Any blockers I can help unblock?",
];

const UNBLOCK_QUESTIONS = [
  "What's the smallest next step you could take?",
  "What would need to be true for this to work?",
  "Who else might have solved this problem?",
  "What's the worst that could happen if you tried?",
  "What resources or support would help here?",
];

export function FacilitatorMode({ session, onClose, onCreateAction }: FacilitatorModeProps) {
  const { t } = useTranslation();
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showUnblockQuestions, setShowUnblockQuestions] = useState(false);
  const [unblockIndex, setUnblockIndex] = useState(0);

  const { data: sessionExercises } = useSessionExercises(session.id);

  // Build agenda items from session + exercises
  const agendaItems: AgendaItem[] = [];

  // Add agenda topics if present
  if (session.agenda) {
    const topics = session.agenda.split('\n').filter((t) => t.trim());
    topics.forEach((topic) => {
      agendaItems.push({
        type: 'agenda',
        title: topic.trim(),
        duration: Math.floor((session.duration || 60) / Math.max(topics.length, 1)),
      });
    });
  }

  // Add exercises
  sessionExercises?.forEach((se) => {
    if (se.exercise) {
      // Add each exercise step
      se.exercise.step_by_step.forEach((step, i) => {
        agendaItems.push({
          type: 'exercise',
          title: `${se.exercise!.title} - ${step.title}`,
          duration: step.duration,
          content: step.description,
          exercise: se.exercise!,
          stepIndex: i,
        });
      });
    }
  });

  // Fallback if no items
  if (agendaItems.length === 0) {
    agendaItems.push({
      type: 'agenda',
      title: session.title,
      duration: session.duration || 60,
    });
  }

  const currentItem = agendaItems[currentItemIndex];
  const targetSeconds = (currentItem?.duration || 0) * 60;

  // Timer logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRunning) {
      interval = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  // Auto-progress when time is up (optional)
  useEffect(() => {
    if (!isRunning) return;
    if (!targetSeconds) return;
    if (timer < targetSeconds) return;

    // advance to next item automatically; stop at the end
    if (currentItemIndex < agendaItems.length - 1) {
      setCurrentItemIndex((i) => i + 1);
      setTimer(0);
      setUnblockIndex(0);
    } else {
      setIsRunning(false);
    }
  }, [isRunning, timer, targetSeconds, currentItemIndex, agendaItems.length]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleNext = useCallback((e?: React.MouseEvent, keepRunning = false) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentItemIndex((i) => {
      if (i < agendaItems.length - 1) {
        setTimer(0);
        setUnblockIndex(0);
        if (!keepRunning) setIsRunning(false);
        return i + 1;
      }
      return i;
    });
  }, [agendaItems.length]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentItemIndex((i) => {
      if (i > 0) {
        setTimer(0);
        setUnblockIndex(0);
        setIsRunning(false);
        return i - 1;
      }
      return i;
    });
  }, []);

  const handleReset = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setTimer(0);
    setIsRunning(false);
  }, []);

  const handleTogglePlay = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsRunning((v) => !v);
  }, []);

  const handleToggleUnblock = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowUnblockQuestions((v) => !v);
  }, []);

  const handleUnblockPrev = useCallback((e?: React.MouseEvent, questionsLength: number = 1) => {
    e?.preventDefault();
    e?.stopPropagation();
    setUnblockIndex((i) => (i - 1 + questionsLength) % questionsLength);
  }, []);

  const handleUnblockNext = useCallback((e?: React.MouseEvent, questionsLength: number = 1) => {
    e?.preventDefault();
    e?.stopPropagation();
    setUnblockIndex((i) => (i + 1) % questionsLength);
  }, []);

  const isOvertime = timer > targetSeconds && targetSeconds > 0;

  const content = (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div>
          <h1 className="font-heading text-xl font-semibold">{session.title}</h1>
          <p className="text-sm text-muted-foreground">
            Facilitator Mode • {currentItemIndex + 1} / {agendaItems.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCreateAction?.(); }}>
            <Plus className="h-4 w-4 mr-1" />
            Quick Action
          </Button>
          <Button variant="ghost" size="icon" onClick={(e) = aria-label={t('common.close')}> { e.preventDefault(); e.stopPropagation(); onClose(); }} aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Current Item */}
        <div className="flex-1 p-6 flex flex-col">
          {/* Timer */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <Button type="button" variant="outline" size="icon" onClick={handleReset} aria-label={t('common.retry')}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <div
                className={cn(
                  'text-5xl font-mono font-bold tabular-nums transition-colors',
                  isOvertime ? 'text-destructive' : 'text-foreground'
                )}
              >
                {formatTime(timer)}
              </div>
              <Button
                type="button"
                variant={isRunning ? 'secondary' : 'default'}
                size="icon"
                onClick={handleTogglePlay}
               aria-label={t('common._iconPause')}>
                {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>

          {targetSeconds > 0 && (
            <div className="text-center mb-6">
              <span className="text-sm text-muted-foreground">
                Target: {formatTime(targetSeconds)}
              </span>
              {isOvertime && (
                <Badge variant="destructive" className="ml-2">
                  +{formatTime(timer - targetSeconds)} over
                </Badge>
              )}
            </div>
          )}

          {/* Current Item Card */}
          <Card className="flex-1 mb-6">
            <CardContent className="p-6 h-full flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                {currentItem?.type === 'exercise' ? (
                  <Lightbulb className="h-5 w-5 text-[hsl(var(--warning))]" />
                ) : (
                  <Target className="h-5 w-5 text-primary" />
                )}
                <h2 className="text-xl font-semibold">{currentItem?.title}</h2>
              </div>

              {currentItem?.content && (
                <p className="text-muted-foreground mb-4">{currentItem.content}</p>
              )}

              {/* Exercise facilitator tips */}
              {currentItem?.type === 'exercise' && currentItem.exercise?.facilitator_tips && (
                <div className="mt-auto p-4 rounded-lg bg-[hsl(var(--info))]/10 border border-[hsl(var(--info))]/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-[hsl(var(--info))]" />
                    <p className="text-sm font-medium text-[hsl(var(--info))]">
                      Facilitator Tips
                    </p>
                  </div>
                  <p className="text-sm text-[hsl(var(--info))]">
                    {currentItem.exercise.facilitator_tips}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentItemIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              type="button"
              onClick={(e) => handleNext(e, isRunning)}
              disabled={currentItemIndex === agendaItems.length - 1}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 border-l bg-muted/20 flex flex-col">
          {/* Opening/Closing Phrases */}
          <div className="p-4 border-b">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              {currentItemIndex === 0 ? 'Opening Phrases' : 
               currentItemIndex === agendaItems.length - 1 ? 'Closing Phrases' : 
               'Transition Phrases'}
            </h3>
            <ul className="space-y-2">
              {(currentItemIndex === 0 ? OPENING_PHRASES : 
                currentItemIndex === agendaItems.length - 1 ? CLOSING_PHRASES : 
                ['Now let\'s move on to...', 'Building on that...', 'Next up...']
              ).map((phrase, i) => (
                <li key={i} className="text-sm text-muted-foreground italic">
                  "{phrase}"
                </li>
              ))}
            </ul>
          </div>

          {/* Unblock Questions */}
          <div className="p-4 border-b">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={handleToggleUnblock}
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              Unblock Questions
              {showUnblockQuestions ? (
                <ChevronLeft className="h-4 w-4 ml-auto rotate-90" />
              ) : (
                <ChevronRight className="h-4 w-4 ml-auto rotate-90" />
              )}
            </Button>
            {showUnblockQuestions && (() => {
              const exerciseSpecific =
                currentItem?.type === 'exercise' && currentItem.exercise
                  ? [
                      currentItem.exercise.common_pitfalls ? `Common pitfall: ${currentItem.exercise.common_pitfalls}` : null,
                      currentItem.exercise.success_criteria ? `Success looks like: ${currentItem.exercise.success_criteria}` : null,
                    ].filter(Boolean)
                  : [];

              const questions = [...exerciseSpecific, ...UNBLOCK_QUESTIONS];
              const q = questions[unblockIndex % Math.max(questions.length, 1)];

              return (
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border bg-card p-3 text-sm text-foreground">
                    {q}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => handleUnblockPrev(e, questions.length)}
                      disabled={questions.length <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => handleUnblockNext(e, questions.length)}
                      disabled={questions.length <= 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Agenda Overview */}
          <div className="flex-1 p-4 overflow-hidden">
            <h3 className="text-sm font-medium mb-2">{t('sessions.agenda', 'Agenda')}</h3>
            <ScrollArea className="h-full">
              <ul className="space-y-1">
                {agendaItems.map((item, i) => {
                  const durationSeconds = (item.duration || 0) * 60;
                  const isCurrent = i === currentItemIndex;
                  const isDone = i < currentItemIndex;
                  const progressPct =
                    isDone ? 100 : isCurrent && durationSeconds > 0 ? Math.min(100, Math.round((timer / durationSeconds) * 100)) : 0;

                  return (
                    <li
                      key={i}
                      className={cn(
                        'text-sm p-2 rounded cursor-pointer transition-colors',
                        isCurrent
                          ? 'bg-primary/10 text-primary font-medium'
                          : isDone
                          ? 'text-muted-foreground line-through'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                      onClick={() => {
                        setCurrentItemIndex(i);
                        setTimer(0);
                        setUnblockIndex(0);
                        setIsRunning(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {isDone && <CheckCircle2 className="h-3 w-3" />}
                        <span className="truncate">{item.title}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        {item.duration ? (
                          <span className="text-xs opacity-60">{item.duration} min</span>
                        ) : (
                          <span className="text-xs opacity-60">—</span>
                        )}
                        {isCurrent && durationSeconds > 0 && (
                          <span className="text-xs opacity-60">{progressPct}%</span>
                        )}
                      </div>
                      {isCurrent && durationSeconds > 0 && (
                        <div className="mt-2 h-1.5 w-full rounded bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside any dialog context
  return createPortal(content, document.body);
}
