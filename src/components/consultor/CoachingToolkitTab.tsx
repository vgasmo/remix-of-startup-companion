import { useMemo, useState } from 'react';
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
import { getCoachingTechniques, type CoachingTechnique } from '@/lib/coachingTechniques';

const CATEGORY_KEYS: Record<string, string> = {
  questions: 'consultorTools.powerfulQuestions',
  reframes: 'consultorTools.reframes',
  exercises: 'consultorTools.exercises',
};

const CATEGORIES = [
  { key: 'questions', icon: HelpCircle, color: 'text-[hsl(var(--info))]' },
  { key: 'reframes', icon: RotateCcw, color: 'text-primary' },
  { key: 'exercises', icon: Target, color: 'text-[hsl(var(--success))]' },
];

export function CoachingToolkitTab() {
  const { t, i18n } = useTranslation();
  const COACHING_TECHNIQUES = useMemo(() => getCoachingTechniques(i18n.language), [i18n.language]);
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
