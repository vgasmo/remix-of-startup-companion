import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Copy, Check, Building2, Clock, AlertTriangle,
  MessageSquare, ChevronRight, Loader2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notify";

interface SmartPrepSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName?: string;
  stage?: string;
  health?: string;
}

interface PrepSection {
  id: string;
  icon: typeof Building2;
  title: string;
  content: string;
  tags?: string[];
}

// Realistic mock data based on workspace context
function getMockPrepData(workspaceName?: string, stage?: string, health?: string): PrepSection[] {
  const name = workspaceName || 'Startup';
  return [
    {
      id: 'context',
      icon: Building2,
      title: 'Startup Context',
      content: `${name} is currently in the ${stage || 'validation'} stage. The team has been actively developing their core product and showing consistent engagement with the program. They recently updated their financial model and are preparing for their next funding milestone. Key focus areas include product-market fit validation and customer acquisition strategy refinement.`,
      tags: [stage || 'validation', health || 'stable', 'B2B SaaS'],
    },
    {
      id: 'last-session',
      icon: Clock,
      title: 'Last Session Summary',
      content: `Previous session focused on go-to-market strategy. The team presented their revised pricing model and discussed early traction metrics. Action items included: (1) Complete competitor analysis matrix, (2) Set up 5 customer discovery interviews, (3) Update pitch deck with new market data. Items #1 and #2 are completed; #3 is still pending.`,
      tags: ['2 of 3 actions done', '14 days ago'],
    },
    {
      id: 'risks',
      icon: AlertTriangle,
      title: 'Risks & Red Flags',
      content: `• KPI submission was 5 days late this month\n• Monthly burn rate increased 18% without corresponding revenue growth\n• No mentor sessions booked in the last 30 days\n• Customer churn metric showing slight upward trend (2.1% → 3.4%)`,
      tags: ['medium priority', '3 flags'],
    },
    {
      id: 'questions',
      icon: MessageSquare,
      title: 'Suggested Next Questions',
      content: `1. "What's driving the increase in burn rate? Is this planned investment or cost overrun?"\n2. "Walk me through your top 3 customer conversations this month — what surprised you?"\n3. "What's your hypothesis for the churn increase, and what experiments are you running?"\n4. "Have you considered booking a session with a mentor on unit economics?"\n5. "Where do you need the most help right now to hit your next milestone?"`,
    },
  ];
}

export function SmartPrepSheet({ open, onOpenChange, workspaceName, stage, health }: SmartPrepSheetProps) {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [prepData, setPrepData] = useState<PrepSection[] | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setPrepData(null);
    // Simulate AI generation
    await new Promise(r => setTimeout(r, 2500));
    setPrepData(getMockPrepData(workspaceName, stage, health));
    setIsGenerating(false);
  }, [workspaceName, stage, health]);

  const handleCopy = useCallback(async () => {
    if (!prepData) return;
    const text = prepData.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    notify.success(t('sessions.copiedToClipboard', { defaultValue: 'Copied to clipboard' }));
    setTimeout(() => setCopied(false), 2000);
  }, [prepData, t]);

  // Auto-generate on open
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !prepData && !isGenerating) {
      handleGenerate();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary " />
            </div>
            {t('sessions.aiPrepSheet', { defaultValue: 'AI Prep Sheet' })}
          </SheetTitle>
          <SheetDescription>
            {workspaceName
              ? t('sessions.prepSheetFor', { name: workspaceName, defaultValue: `One-pager brief for ${workspaceName}` })
              : t('sessions.prepSheetGeneric', { defaultValue: 'Session preparation brief' })
            }
          </SheetDescription>
        </SheetHeader>

        <Separator className="mb-4" />

        {/* Loading state */}
        <AnimatePresence mode="wait">
          {isGenerating && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 py-4"
            >
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="animate-pulse">{t('sessions.generatingPrepSheet', { defaultValue: 'Generating prep sheet…' })}</span>
              </div>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              ))}
            </motion.div>
          )}

          {/* Content */}
          {!isGenerating && prepData && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-5"
            >
              {/* Copy button */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI Generated
                </Badge>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleGenerate} className="text-xs gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    {t('sessions.regenerate', { defaultValue: 'Regenerate' })}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopy} className="text-xs gap-1.5">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? t('common.copied', { defaultValue: 'Copied!' }) : t('common.copy', { defaultValue: 'Copy All' })}
                  </Button>
                </div>
              </div>

              {/* Sections */}
              {prepData.map((section, idx) => {
                const Icon = section.icon;
                return (
                  <motion.div
                    key={section.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1, duration: 0.3 }}
                    className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'h-7 w-7 rounded-lg flex items-center justify-center',
                        section.id === 'risks' ? 'bg-[hsl(var(--warning))]/10' : 'bg-primary/10'
                      )}>
                        <Icon className={cn(
                          'h-3.5 w-3.5',
                          section.id === 'risks' ? 'text-[hsl(var(--warning))]' : 'text-primary'
                        )} />
                      </div>
                      <h4 className="text-sm font-semibold">{section.title}</h4>
                    </div>
                    {section.tags && (
                      <div className="flex flex-wrap gap-1.5">
                        {section.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {section.content}
                    </p>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}

// Trigger button to use in SessionPrepCard or session views
export function SmartPrepButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2 text-xs bg-gradient-to-r from-primary/5 to-primary/5 border-primary/30 hover:border-primary/50 hover:from-primary/10 hover:to-primary/10 transition-all duration-300"
    >
      <Sparkles className="h-3.5 w-3.5 text-primary " />
      {t('sessions.generatePrepSheet', { defaultValue: '✨ Generate AI Prep Sheet' })}
    </Button>
  );
}
