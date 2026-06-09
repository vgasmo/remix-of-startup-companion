import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wrench,
  MessageCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
  ThumbsUp,
  Zap,
  Target,
  RotateCcw,
  ArrowRight,
  Scale,
  Lightbulb,
  HelpCircle,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';

interface CoachingTechnique {
  id: string;
  category: 'questions' | 'reframes' | 'exercises';
  name: string;
  description: string;
  when: string[];
  examples: string[];
  caution?: string;
}

const COACHING_TECHNIQUES: CoachingTechnique[] = [
  // Powerful Questions
  {
    id: 'scaling',
    category: 'questions',
    name: 'Scaling Questions',
    description: 'Help founders quantify subjective feelings and identify incremental improvements',
    when: ['Founder feels stuck', 'Measuring progress', 'Setting goals'],
    examples: [
      'On a scale of 1-10, how confident are you in your product-market fit?',
      'What would move that number from a 6 to a 7?',
      'Where were you on this scale 3 months ago?',
    ],
  },
  {
    id: 'miracle',
    category: 'questions',
    name: 'Miracle Question',
    description: 'Bypass limiting beliefs by imagining ideal outcomes',
    when: ['Strategic planning', 'Vision setting', 'Overcoming blocks'],
    examples: [
      'If you woke up tomorrow and this problem was solved, what would be different?',
      'What would you notice first that tells you things have changed?',
      'Who else would notice? What would they see?',
    ],
    caution: 'Use sparingly - can feel abstract if overused',
  },
  {
    id: 'presupposition',
    category: 'questions',
    name: 'Presuppositional Questions',
    description: 'Questions that assume positive outcomes to shift mindset',
    when: ['Building confidence', 'Moving past fear', 'Action planning'],
    examples: [
      'When you solve this, what will you do next?',
      'After you close this round, how will you spend the first week?',
      'Once you have product-market fit, what becomes possible?',
    ],
  },
  {
    id: 'clean',
    category: 'questions',
    name: 'Clean Language Questions',
    description: 'Questions without assumptions that let the founder explore freely',
    when: ['Discovery sessions', 'Exploring emotions', 'Avoiding projection'],
    examples: [
      'What kind of [their word] is that?',
      'Is there anything else about [their word]?',
      'Where is that [feeling] located?',
      'What happens just before [the problem]?',
    ],
  },
  {
    id: 'exception',
    category: 'questions',
    name: 'Exception-Finding Questions',
    description: 'Find times when the problem didn\'t occur to identify solutions',
    when: ['Recurring issues', 'Building on strengths', 'Pattern breaking'],
    examples: [
      'Was there ever a time when this wasn\'t a problem? What was different?',
      'When does this challenge feel easier to handle?',
      'Tell me about your best customer acquisition. What made it work?',
    ],
  },

  // Reframes
  {
    id: 'fear-reframe',
    category: 'reframes',
    name: 'Fear to Excitement',
    description: 'Reframe fear as excitement - physiologically identical responses',
    when: ['Before pitches', 'Major decisions', 'Fear of failure'],
    examples: [
      'The butterflies in your stomach - that\'s your body preparing for peak performance',
      'Fear and excitement feel the same. What if this feeling means you care deeply?',
      'The stakes feel high because this matters to you',
    ],
  },
  {
    id: 'failure-reframe',
    category: 'reframes',
    name: 'Failure as Data',
    description: 'Reframe failures as experiments that generated valuable information',
    when: ['After setbacks', 'Fear of trying', 'Perfectionism'],
    examples: [
      'This wasn\'t a failure - it was an experiment. What did you learn?',
      'Every "no" is one step closer to understanding your market',
      'Now you know what doesn\'t work. That\'s valuable data.',
    ],
  },
  {
    id: 'constraint-reframe',
    category: 'reframes',
    name: 'Constraint as Advantage',
    description: 'Turn limitations into creative opportunities',
    when: ['Limited resources', 'Competitive disadvantage', 'Self-doubt'],
    examples: [
      'Your small team means faster decisions and pivots',
      'Having less money forces you to validate before building',
      'Not having industry experience means you won\'t make the usual mistakes',
    ],
  },
  {
    id: 'time-reframe',
    category: 'reframes',
    name: 'Time Perspective Shift',
    description: 'Help founders zoom out to see the bigger picture',
    when: ['Daily struggles', 'Loss of motivation', 'Short-term thinking'],
    examples: [
      'In 5 years, will this decision matter? What will?',
      'What advice would 10-years-older you give about this situation?',
      'Is this a speed bump or a wall? Most feel like walls but are bumps.',
    ],
  },

  // Exercises
  {
    id: 'premortem',
    category: 'exercises',
    name: 'Pre-Mortem Analysis',
    description: 'Imagine failure to identify and prevent risks',
    when: ['Before major launches', 'Investment decisions', 'Partnership agreements'],
    examples: [
      'It\'s 6 months from now and this initiative failed. What went wrong?',
      'Write down 3 reasons why this partnership could go badly',
      'If a competitor copied you tomorrow, where would you be most vulnerable?',
    ],
  },
  {
    id: 'devil-advocate',
    category: 'exercises',
    name: 'Devil\'s Advocate',
    description: 'Challenge assumptions by arguing the opposite position',
    when: ['Confirmation bias risk', 'Major pivots', 'Investment thesis'],
    examples: [
      'Let me argue why a customer would NOT buy this...',
      'What if the opposite of your assumption is true?',
      'Convince me why this is a bad idea',
    ],
    caution: 'Always debrief and return to collaborative mode',
  },
  {
    id: 'empty-chair',
    category: 'exercises',
    name: 'Empty Chair Technique',
    description: 'Role-play conversations with absent stakeholders',
    when: ['Preparing difficult conversations', 'Understanding customers', 'Co-founder conflict'],
    examples: [
      'Imagine your target customer is sitting here. What would they say about your product?',
      'Switch seats. You\'re now the investor. Why would you say no?',
      'What would your co-founder say their concerns are?',
    ],
  },
  {
    id: 'priority-matrix',
    category: 'exercises',
    name: '2x2 Priority Matrix',
    description: 'Quickly prioritize tasks by impact and effort',
    when: ['Too many priorities', 'Sprint planning', 'Resource allocation'],
    examples: [
      'Let\'s map your 10 tasks on Impact (high/low) vs Effort (high/low)',
      'What\'s in your "high impact, low effort" quadrant?',
      'Are you spending time on "low impact, high effort" work?',
    ],
  },
  {
    id: 'ideal-week',
    category: 'exercises',
    name: 'Ideal Week Design',
    description: 'Design a calendar that supports founder goals',
    when: ['Time management issues', 'Burnout prevention', 'Focus problems'],
    examples: [
      'Block out your ideal week - when do you do deep work?',
      'Compare your ideal week to last week. What\'s different?',
      'What one meeting could you eliminate to gain 2 hours of focus time?',
    ],
  },
];

const CATEGORY_KEYS: Record<string, string> = {
  questions: 'consultorTools.powerfulQuestions',
  reframes: 'consultorTools.reframes',
  exercises: 'consultorTools.exercises',
};

const CATEGORIES = [
  { key: 'questions', icon: HelpCircle, color: 'text-[hsl(var(--info))]' },
  { key: 'reframes', icon: RotateCcw, color: 'text-purple-600' },
  { key: 'exercises', icon: Target, color: 'text-[hsl(var(--success))]' },
];

export function CoachingToolkitTab() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [expandedTechnique, setExpandedTechnique] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('questions');

  const filteredTechniques = COACHING_TECHNIQUES.filter(
    (t) =>
      t.category === activeCategory &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.when.some((w) => w.toLowerCase().includes(search.toLowerCase())))
  );

  const copyExamples = (technique: CoachingTechnique) => {
    const text = `# ${technique.name}\n\n${technique.examples.map((e) => `• ${e}`).join('\n')}`;
    navigator.clipboard.writeText(text);
    notify.success(t('consultorTools.copiedToClipboard', { defaultValue: 'Examples copied to clipboard' }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            {t('consultorTools.coachingToolkit', { defaultValue: 'Coaching Toolkit' })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('consultorTools.coachingToolkitDesc', { defaultValue: 'Proven techniques for effective startup coaching' })}
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3" />
          {COACHING_TECHNIQUES.length} {t('consultorTools.techniques', { defaultValue: 'techniques' })}
        </Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('consultorTools.searchTechniques', { defaultValue: 'Search techniques...' })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="grid w-full grid-cols-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const count = COACHING_TECHNIQUES.filter((t) => t.category === cat.key).length;
            return (
              <TabsTrigger key={cat.key} value={cat.key} className="gap-2">
                <Icon className={cn('h-4 w-4', cat.color)} />
                {t(CATEGORY_KEYS[cat.key])}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat.key} value={cat.key} className="mt-6 space-y-4">
            {filteredTechniques.length === 0 ? (
              <Card className="bg-muted/50">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">{t('consultorTools.noTechniquesMatch', { defaultValue: 'No techniques match your search' })}</p>
                </CardContent>
              </Card>
            ) : (
              filteredTechniques.map((technique) => {
                const isExpanded = expandedTechnique === technique.id;
                return (
                  <Card key={technique.id} className="overflow-hidden">
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={() => setExpandedTechnique(isExpanded ? null : technique.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                <MessageCircle className={cn('h-4 w-4', cat.color)} />
                                {technique.name}
                              </CardTitle>
                              <CardDescription className="mt-1">{technique.description}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyExamples(technique);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                {t('consultorTools.copy', { defaultValue: 'Copy' })}
                              </Button>
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {/* When to use badges */}
                          <div className="flex flex-wrap gap-2 mt-3">
                            {technique.when.map((w, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                {w}
                              </Badge>
                            ))}
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <CardContent className="pt-0 space-y-4">
                          {/* Examples */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                              <Lightbulb className="h-3 w-3" />
                              {t('consultorTools.examplePhrases', { defaultValue: 'Example Phrases' })}
                            </p>
                            <ul className="space-y-2">
                              {technique.examples.map((example, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm bg-muted/50 p-3 rounded-lg">
                                  <ArrowRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                  <span className="italic">"{example}"</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Caution */}
                          {technique.caution && (
                            <div className="p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30">
                              <p className="text-sm flex items-start gap-2 text-[hsl(var(--warning))]">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                {technique.caution}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
