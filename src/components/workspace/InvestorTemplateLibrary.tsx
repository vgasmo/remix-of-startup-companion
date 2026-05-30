import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Sparkles, Copy, Search, Edit3, Download, X, ArrowLeft, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface InvestorTemplate {
  id: string;
  name: string;
  description: string;
  audience: 'seed' | 'series_a' | 'series_b' | 'angel' | 'vc' | 'strategic';
  sections: {
    title: string;
    content: string;
    placeholder: string;
  }[];
}

const INVESTOR_TEMPLATES: InvestorTemplate[] = [
  {
    id: 'monthly-angel',
    name: 'Monthly Angel Update',
    description: 'Concise update for angel investors focusing on traction and key milestones',
    audience: 'angel',
    sections: [
      { title: 'TL;DR', content: '', placeholder: 'One sentence summary of this month' },
      { title: 'Key Metrics', content: '', placeholder: 'MRR: $X (+Y%)\nUsers: X (+Y%)\nBurn: $X/month\nRunway: X months' },
      { title: 'Wins This Month', content: '', placeholder: '• Achievement 1\n• Achievement 2' },
      { title: 'Challenges', content: '', placeholder: '• Challenge and how we\'re addressing it' },
      { title: 'Asks', content: '', placeholder: '• Specific help needed (intros, advice, resources)' },
    ],
  },
  {
    id: 'quarterly-vc',
    name: 'Quarterly VC Report',
    description: 'Detailed quarterly update for institutional investors with financial metrics',
    audience: 'vc',
    sections: [
      { title: 'Executive Summary', content: '', placeholder: 'Quarter highlights in 2-3 paragraphs' },
      { title: 'Financial Performance', content: '', placeholder: 'Revenue: $X (vs plan: Y%)\nGross Margin: X%\nBurn Rate: $X/month\nRunway: X months\nCAC: $X, LTV: $X, LTV/CAC: X' },
      { title: 'Product & Engineering', content: '', placeholder: 'Key launches, technical milestones, team changes' },
      { title: 'Go-to-Market', content: '', placeholder: 'Sales pipeline, marketing initiatives, partnerships' },
      { title: 'Team & Culture', content: '', placeholder: 'New hires, departures, organizational changes' },
      { title: 'Competitive Landscape', content: '', placeholder: 'Market changes, competitor updates, positioning' },
      { title: 'Next Quarter Priorities', content: '', placeholder: 'Top 3-5 priorities with success metrics' },
      { title: 'Asks & Opportunities', content: '', placeholder: 'Specific requests for help or resources' },
    ],
  },
  {
    id: 'seed-round',
    name: 'Seed Round Update',
    description: 'Progress update for seed investors with focus on product-market fit signals',
    audience: 'seed',
    sections: [
      { title: 'Headline', content: '', placeholder: 'Biggest win or insight this month' },
      { title: 'Progress on PMF', content: '', placeholder: 'Customer feedback, retention data, usage patterns' },
      { title: 'Metrics That Matter', content: '', placeholder: 'Focus on 1-3 key metrics that show traction' },
      { title: 'Customer Stories', content: '', placeholder: 'Specific customer wins or testimonials' },
      { title: 'What We Learned', content: '', placeholder: 'Key insights from customer discovery' },
      { title: 'Next Experiments', content: '', placeholder: 'What we\'re testing next and why' },
      { title: 'Help Wanted', content: '', placeholder: 'Specific intros or resources needed' },
    ],
  },
  {
    id: 'series-a-board',
    name: 'Series A Board Update',
    description: 'Comprehensive board-ready update with financial projections and strategic discussion',
    audience: 'series_a',
    sections: [
      { title: 'Board Summary', content: '', placeholder: 'Key updates and discussion topics for the board' },
      { title: 'Financial Overview', content: '', placeholder: 'P&L summary, cash position, burn rate, runway' },
      { title: 'KPI Dashboard', content: '', placeholder: 'ARR, MRR, Growth Rate, NRR, CAC, LTV, Churn' },
      { title: 'Sales & Pipeline', content: '', placeholder: 'Pipeline value, win rates, sales cycle, forecast' },
      { title: 'Product Roadmap', content: '', placeholder: 'Shipped vs planned, upcoming releases' },
      { title: 'Team & Org', content: '', placeholder: 'Headcount, key hires, org chart updates' },
      { title: 'Strategic Initiatives', content: '', placeholder: 'New markets, partnerships, M&A opportunities' },
      { title: 'Risk Register', content: '', placeholder: 'Key risks and mitigation plans' },
      { title: 'Discussion Items', content: '', placeholder: 'Topics requiring board input or approval' },
    ],
  },
  {
    id: 'strategic-partner',
    name: 'Strategic Partner Update',
    description: 'Update tailored for strategic/corporate investors focusing on synergies',
    audience: 'strategic',
    sections: [
      { title: 'Partnership Highlights', content: '', placeholder: 'Joint wins and integration progress' },
      { title: 'Business Update', content: '', placeholder: 'Key metrics and growth trajectory' },
      { title: 'Synergy Opportunities', content: '', placeholder: 'New areas for collaboration' },
      { title: 'Market Intelligence', content: '', placeholder: 'Industry trends relevant to partnership' },
      { title: 'Roadmap Alignment', content: '', placeholder: 'How our roadmap supports partnership goals' },
      { title: 'Joint Initiatives', content: '', placeholder: 'Status of ongoing joint projects' },
      { title: 'Asks', content: '', placeholder: 'Resources or support needed from partner' },
    ],
  },
];

interface InvestorTemplateLibraryProps {
  onSelectTemplate?: (template: InvestorTemplate) => void;
}

export function InvestorTemplateLibrary({ onSelectTemplate }: InvestorTemplateLibraryProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<InvestorTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSections, setEditingSections] = useState<{ title: string; content: string; placeholder: string }[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);

  // B4 Fix: Draft persistence key
  const getDraftKey = useCallback((templateId: string) => `investor_template_draft_${templateId}`, []);

  // B4 Fix: Save draft to localStorage whenever editingSections changes
  useEffect(() => {
    if (editorOpen && selectedTemplate && editingSections.length > 0) {
      const hasContent = editingSections.some(s => s.content.trim());
      if (hasContent) {
        const draftData = {
          templateId: selectedTemplate.id,
          sections: editingSections,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(getDraftKey(selectedTemplate.id), JSON.stringify(draftData));
      }
    }
  }, [editingSections, editorOpen, selectedTemplate, getDraftKey]);

  // B4 Fix: Clear draft after successful export/copy
  const clearDraft = useCallback(() => {
    if (selectedTemplate) {
      localStorage.removeItem(getDraftKey(selectedTemplate.id));
    }
  }, [selectedTemplate, getDraftKey]);

  const audienceLabels: Record<string, { label: string; color: string }> = {
    angel: { label: t('investorUpdates.angel'), color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    seed: { label: t('investorUpdates.seed'), color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    series_a: { label: t('investorUpdates.seriesA'), color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    series_b: { label: t('investorUpdates.seriesB'), color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
    vc: { label: t('investorUpdates.vc'), color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    strategic: { label: t('investorUpdates.strategic'), color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  };

  const filteredTemplates = INVESTOR_TEMPLATES.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const handlePreview = (template: InvestorTemplate) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  const handleEditTemplate = (template: InvestorTemplate) => {
    setSelectedTemplate(template);
    setDraftRestored(false);
    
    // B4 Fix: Check for existing draft
    const draftKey = getDraftKey(template.id);
    const savedDraft = localStorage.getItem(draftKey);
    
    if (savedDraft) {
      try {
        const draftData = JSON.parse(savedDraft);
        if (draftData.templateId === template.id && draftData.sections) {
          setEditingSections(draftData.sections);
          setDraftRestored(true);
        } else {
          setEditingSections(template.sections.map(s => ({ ...s, content: '' })));
        }
      } catch {
        setEditingSections(template.sections.map(s => ({ ...s, content: '' })));
      }
    } else {
      setEditingSections(template.sections.map(s => ({ ...s, content: '' })));
    }
    
    setPreviewOpen(false);
    setEditorOpen(true);
  };

  const handleSectionChange = (index: number, content: string) => {
    setEditingSections(prev => prev.map((s, i) => i === index ? { ...s, content } : s));
    setDraftRestored(false); // Clear the "restored" banner once user starts editing
  };

  const handleCopyToClipboard = () => {
    if (!selectedTemplate) return;
    const templateText = editingSections
      .map(s => `## ${s.title}\n${s.content || s.placeholder}`)
      .join('\n\n');
    navigator.clipboard.writeText(templateText);
    // B4 Fix: Clear draft after successful copy
    clearDraft();
    toast.success(t('investorUpdates.templateCopied'), {
      description: t('investorUpdates.templateCopiedDesc'),
    });
  };

  const handleExportMarkdown = () => {
    if (!selectedTemplate) return;
    const templateText = `# ${selectedTemplate.name}\n\n` + editingSections
      .map(s => `## ${s.title}\n\n${s.content || s.placeholder}`)
      .join('\n\n');
    
    const blob = new Blob([templateText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate.name.toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    
    // B4 Fix: Clear draft after successful export
    clearDraft();
    toast.success(t('investorUpdates.exportSuccess'));
  };

  const handleUseTemplate = (template: InvestorTemplate) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
    }
    
    const templateText = template.sections.map(s => `## ${s.title}\n${s.placeholder}`).join('\n\n');
    navigator.clipboard.writeText(templateText);
    
    setPreviewOpen(false);
    toast.success(t('investorUpdates.templateCopied'), {
      description: t('investorUpdates.templateCopiedDesc'),
      duration: 4000,
    });
  };

  const filledSectionsCount = editingSections.filter(s => s.content.trim()).length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('investorUpdates.templateLibraryTitle', { defaultValue: 'Documentos adicionais para investidores' })}
              </CardTitle>
              <CardDescription>{t('investorUpdates.templateLibraryDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('investorUpdates.searchTemplates')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {filteredTemplates.map((template) => (
              <Card 
                key={template.id} 
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => handlePreview(template)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-medium">{template.name}</h4>
                    <Badge variant="outline" className={audienceLabels[template.audience].color}>
                      {audienceLabels[template.audience].label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <span>{template.sections.length} {t('investorUpdates.sections')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] !flex !flex-col overflow-hidden">
          {selectedTemplate && (
            <>
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  {selectedTemplate.name}
                  <Badge variant="outline" className={audienceLabels[selectedTemplate.audience].color}>
                    {audienceLabels[selectedTemplate.audience].label}
                  </Badge>
                </DialogTitle>
                <DialogDescription>{selectedTemplate.description}</DialogDescription>
              </DialogHeader>
              
              <ScrollArea className="flex-1 min-h-0 pr-4">
                <div className="space-y-4">
                  {selectedTemplate.sections.map((section, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-2">{section.title}</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {section.placeholder}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <DialogFooter className="shrink-0 flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => handleUseTemplate(selectedTemplate)}>
                  <Copy className="h-4 w-4 mr-2" />
                  {t('investorUpdates.copyTemplate')}
                </Button>
                <Button onClick={() => handleEditTemplate(selectedTemplate)}>
                  <Edit3 className="h-4 w-4 mr-2" />
                  {t('investorUpdates.editInApp')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor Dialog - B3 Fix: Improved scroll layout */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl h-[90vh] !flex !flex-col overflow-hidden">
          {selectedTemplate && (
            <>
              <DialogHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="flex items-center gap-2">
                      <Edit3 className="h-5 w-5" />
                      {selectedTemplate.name}
                      <Badge variant="outline" className={audienceLabels[selectedTemplate.audience].color}>
                        {audienceLabels[selectedTemplate.audience].label}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      {t('investorUpdates.fillSections')} • {filledSectionsCount}/{editingSections.length} {t('investorUpdates.completed')}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              
              {/* B4 Fix: Show banner when draft was restored */}
              {draftRestored && (
                <Alert className="flex-shrink-0 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    {t('investorUpdates.draftRestored', 'Draft restored from previous session')}
                  </AlertDescription>
                </Alert>
              )}
              
              {/* B3 Fix: Explicit height calculation for proper scrolling */}
              <ScrollArea className="flex-1 min-h-0 pr-4">
                <div className="space-y-6 py-4">
                  {editingSections.map((section, i) => (
                    <div key={i} className="space-y-2">
                      <label className="font-medium text-sm flex items-center gap-2">
                        {section.title}
                        {section.content.trim() && (
                          <Badge variant="secondary" className="text-xs">
                            {t('investorUpdates.filled')}
                          </Badge>
                        )}
                      </label>
                      <Textarea
                        value={section.content}
                        onChange={(e) => handleSectionChange(i, e.target.value)}
                        placeholder={section.placeholder}
                        className="min-h-[120px] resize-y"
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setEditorOpen(false)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('common.back')}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCopyToClipboard}>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('investorUpdates.copyToClipboard')}
                  </Button>
                  <Button onClick={handleExportMarkdown}>
                    <Download className="h-4 w-4 mr-2" />
                    {t('investorUpdates.exportMarkdown')}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}