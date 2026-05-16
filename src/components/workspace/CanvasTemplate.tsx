import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Edit2, X, Download, Send, CheckCircle, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CanvasSection {
  id: string;
  label: string;
  placeholder: string;
  gridArea: string;
  color: string;
}

export type CanvasType = 'bmc' | 'lean' | 'value_prop' | 'empathy' | 'swot' | 'gtm' | 'icp' | 'pricing' | 'growth_loops' | 'okrs' | 'fundraising' | 'sales_pipeline' | 'roadmap';

interface CanvasTemplateProps {
  type: CanvasType;
  data: Record<string, string>;
  onChange: (data: Record<string, string>) => void;
  disabled?: boolean;
  reviewStatus?: 'draft' | 'pending_review' | 'approved' | 'needs_changes';
  onSubmitForReview?: () => void;
  onExport?: () => void;
}

// Section definitions with i18n keys
const createSections = (t: (key: string) => string, canvasType: string): CanvasSection[] => {
  const getSectionData = (id: string, gridArea: string, color: string): CanvasSection => ({
    id,
    label: t(`templates.canvas.${canvasType}.${id}`) || id,
    placeholder: t(`templates.canvas.${canvasType}.${id}_placeholder`) || '',
    gridArea,
    color,
  });

  switch (canvasType) {
    case 'bmc':
      return [
        getSectionData('key_partners', 'partners', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('key_activities', 'activities', 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'),
        getSectionData('key_resources', 'resources', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('value_propositions', 'value', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('customer_relationships', 'relationships', 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'),
        getSectionData('channels', 'channels', 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'),
        getSectionData('customer_segments', 'segments', 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'),
        getSectionData('cost_structure', 'costs', 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-700'),
        getSectionData('revenue_streams', 'revenue', 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'),
      ];
    case 'lean':
      return [
        getSectionData('problem', 'problem', 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'),
        getSectionData('solution', 'solution', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('key_metrics', 'metrics', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('unique_value', 'uvp', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('unfair_advantage', 'advantage', 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'),
        getSectionData('channels', 'channels', 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'),
        getSectionData('customer_segments', 'segments', 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'),
        getSectionData('cost_structure', 'costs', 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-700'),
        getSectionData('revenue_streams', 'revenue', 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'),
      ];
    case 'value_prop':
      return [
        getSectionData('customer_jobs', 'jobs', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('pains', 'pains', 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'),
        getSectionData('gains', 'gains', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('products_services', 'products', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('pain_relievers', 'relievers', 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'),
        getSectionData('gain_creators', 'creators', 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'),
      ];
    case 'empathy':
      return [
        getSectionData('think_feel', 'think', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('hear', 'hear', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('see', 'see', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('say_do', 'saydo', 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'),
        getSectionData('pains', 'pains', 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'),
        getSectionData('gains', 'gains', 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'),
      ];
    case 'swot':
      return [
        getSectionData('strengths', 'strengths', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('weaknesses', 'weaknesses', 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'),
        getSectionData('opportunities', 'opportunities', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('threats', 'threats', 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'),
      ];
    case 'gtm':
      return [
        getSectionData('target_market', 'market', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('positioning', 'positioning', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('channels', 'channels', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('launch', 'launch', 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'),
      ];
    case 'icp':
      return [
        getSectionData('company_profile', 'company', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('buyer_persona', 'persona', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('pain_points', 'pains', 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'),
        getSectionData('buying_behavior', 'buying', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
      ];
    case 'pricing':
      return [
        getSectionData('pricing_model', 'model', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('tiers', 'tiers', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('value_metric', 'metric', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('competition', 'competition', 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'),
      ];
    case 'growth_loops':
      return [
        getSectionData('trigger', 'trigger', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('value', 'value', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('acquisition', 'acquisition', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('retention', 'retention', 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'),
      ];
    case 'okrs':
      return [
        getSectionData('north_star', 'northstar', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('objective_1', 'obj1', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('key_results_1', 'kr1', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('objective_2', 'obj2', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('key_results_2', 'kr2', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
      ];
    case 'fundraising':
      return [
        getSectionData('round_target', 'target', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('metrics', 'metrics', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('materials', 'materials', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('investors', 'investors', 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'),
      ];
    case 'sales_pipeline':
      return [
        getSectionData('pipeline_overview', 'overview', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('stages', 'stages', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('metrics', 'metrics', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
      ];
    case 'roadmap':
      return [
        getSectionData('now', 'now', 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'),
        getSectionData('next', 'next', 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'),
        getSectionData('later', 'later', 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'),
        getSectionData('not_doing', 'notdoing', 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-700'),
      ];
    default:
      return [];
  }
};

// Grid configurations only (sections are generated dynamically with translations)
const CANVAS_GRID_CONFIG: Record<CanvasType, { author: string; gridStyle: React.CSSProperties }> = {
  bmc: {
    author: 'Osterwalder',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(10, 1fr)',
      gridTemplateRows: 'repeat(6, minmax(120px, auto))',
      gap: '4px',
      gridTemplateAreas: `
        "partners partners activities activities value value relationships relationships segments segments"
        "partners partners activities activities value value relationships relationships segments segments"
        "partners partners resources resources value value channels channels segments segments"
        "partners partners resources resources value value channels channels segments segments"
        "costs costs costs costs costs revenue revenue revenue revenue revenue"
        "costs costs costs costs costs revenue revenue revenue revenue revenue"
      `,
    },
  },
  lean: {
    author: 'Ash Maurya',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(10, 1fr)',
      gridTemplateRows: 'repeat(6, minmax(120px, auto))',
      gap: '4px',
      gridTemplateAreas: `
        "problem problem solution solution uvp uvp advantage advantage segments segments"
        "problem problem solution solution uvp uvp advantage advantage segments segments"
        "problem problem metrics metrics uvp uvp channels channels segments segments"
        "problem problem metrics metrics uvp uvp channels channels segments segments"
        "costs costs costs costs costs revenue revenue revenue revenue revenue"
        "costs costs costs costs costs revenue revenue revenue revenue revenue"
      `,
    },
  },
  value_prop: {
    author: 'Strategyzer',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gridTemplateRows: 'repeat(4, minmax(140px, auto))',
      gap: '4px',
      gridTemplateAreas: `
        "jobs jobs jobs products products products"
        "jobs jobs jobs products products products"
        "pains pains gains gains relievers creators"
        "pains pains gains gains relievers creators"
      `,
    },
  },
  empathy: {
    author: 'XPLANE',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gridTemplateRows: 'repeat(4, minmax(120px, auto))',
      gap: '4px',
      gridTemplateAreas: `
        "think think think think"
        "hear see see saydo"
        "hear see see saydo"
        "pains pains gains gains"
      `,
    },
  },
  swot: {
    author: 'Strategic Planning',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, minmax(180px, auto))',
      gap: '8px',
      gridTemplateAreas: `
        "strengths weaknesses"
        "opportunities threats"
      `,
    },
  },
  gtm: {
    author: 'Strategic Planning',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, minmax(160px, auto))',
      gap: '8px',
      gridTemplateAreas: `
        "market positioning"
        "channels launch"
      `,
    },
  },
  icp: {
    author: 'Customer Discovery',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, minmax(160px, auto))',
      gap: '8px',
      gridTemplateAreas: `
        "company persona"
        "pains buying"
      `,
    },
  },
  pricing: {
    author: 'Monetization Strategy',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, minmax(160px, auto))',
      gap: '8px',
      gridTemplateAreas: `
        "model tiers"
        "metric competition"
      `,
    },
  },
  growth_loops: {
    author: 'Growth Strategy',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, minmax(160px, auto))',
      gap: '8px',
      gridTemplateAreas: `
        "trigger value"
        "acquisition retention"
      `,
    },
  },
  okrs: {
    author: 'Goal Setting',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(3, minmax(120px, auto))',
      gap: '8px',
      gridTemplateAreas: `
        "northstar northstar"
        "obj1 kr1"
        "obj2 kr2"
      `,
    },
  },
  fundraising: {
    author: 'Investor Relations',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, minmax(160px, auto))',
      gap: '8px',
      gridTemplateAreas: `
        "target metrics"
        "materials investors"
      `,
    },
  },
  sales_pipeline: {
    author: 'Revenue Operations',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'minmax(200px, auto)',
      gap: '8px',
      gridTemplateAreas: `
        "overview stages metrics"
      `,
    },
  },
  roadmap: {
    author: 'Product Strategy',
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gridTemplateRows: 'minmax(200px, auto)',
      gap: '8px',
      gridTemplateAreas: `
        "now next later notdoing"
      `,
    },
  },
};

export function CanvasTemplate({ type, data, onChange, disabled = false, reviewStatus, onSubmitForReview, onExport }: CanvasTemplateProps) {
  const { t } = useTranslation();
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  
  const gridConfig = CANVAS_GRID_CONFIG[type];
  const sections = createSections(t, type);
  const title = t(`templates.canvas.${type}.title`);

  const handleEdit = (sectionId: string) => {
    setEditingSection(sectionId);
    setEditValue(data[sectionId] || '');
  };

  const handleSave = () => {
    if (editingSection) {
      onChange({ ...data, [editingSection]: editValue });
      setEditingSection(null);
      setEditValue('');
    }
  };

  const handleCancel = () => {
    setEditingSection(null);
    setEditValue('');
  };

  const handleExport = () => {
    // Generate text export
    let exportText = `${title}\n${'='.repeat(title.length)}\n\n`;
    sections.forEach(section => {
      exportText += `## ${section.label}\n${data[section.id] || '(empty)'}\n\n`;
    });
    
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {title}
            <Badge variant="outline" className="ml-2">
              {gridConfig.author}
            </Badge>
            {reviewStatus === 'pending_review' && (
              <Badge className="bg-amber-100 text-amber-700">{t('templates.pendingReview')}</Badge>
            )}
            {reviewStatus === 'approved' && (
              <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />{t('templates.approved')}</Badge>
            )}
            {reviewStatus === 'needs_changes' && (
              <Badge className="bg-red-100 text-red-700"><MessageSquare className="h-3 w-3 mr-1" />{t('templates.needsChanges')}</Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onExport || handleExport}>
              <Download className="h-4 w-4 mr-1" />
              {t('templates.export')}
            </Button>
            {!disabled && onSubmitForReview && reviewStatus !== 'pending_review' && reviewStatus !== 'approved' && (
              <Button variant="default" size="sm" onClick={onSubmitForReview}>
                <Send className="h-4 w-4 mr-1" />
                {t('templates.submitForReview')}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="w-full">
          <div style={gridConfig.gridStyle} className="min-w-[600px]">
            {sections.map((section) => {
              const isEditing = editingSection === section.id;
              const hasContent = !!data[section.id];

              return (
                <div
                  key={section.id}
                  style={{ gridArea: section.gridArea }}
                  className={`relative rounded-lg border-2 p-3 transition-all ${section.color} ${
                    !disabled ? 'hover:shadow-md cursor-pointer' : ''
                  }`}
                  onClick={() => !disabled && !isEditing && handleEdit(section.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-xs uppercase tracking-wide text-foreground/80">
                      {section.label}
                    </h4>
                    {!disabled && hasContent && !isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(section.id);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <Textarea
                        value={editValue}
                        onChange={(e) => {
                          const next = e.target.value;
                          setEditValue(next);
                          // Propagate every keystroke so the parent autosave layer
                          // captures the draft even if the user switches tab/window
                          // before pressing the per-section Save button.
                          if (editingSection) {
                            onChange({ ...data, [editingSection]: next });
                          }
                        }}
                        onBlur={() => {
                          // Commit on blur so leaving the section keeps the text.
                          if (editingSection) {
                            onChange({ ...data, [editingSection]: editValue });
                          }
                        }}
                        placeholder={section.placeholder}
                        className="min-h-[80px] max-h-[40vh] text-sm bg-background/80"
                        autoFocus
                      />
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7">
                          <X className="h-3 w-3 mr-1" />
                          {t('common.cancel')}
                        </Button>
                        <Button size="sm" onClick={handleSave} className="h-7">
                          <Save className="h-3 w-3 mr-1" />
                          {t('common.save')}
                        </Button>
                      </div>
                    </div>
                  ) : hasContent ? (
                    <div className="text-sm text-foreground/90 whitespace-pre-wrap max-h-40 overflow-y-auto pr-1">
                      {data[section.id]}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">
                      {section.placeholder}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Helper to check if a template is a canvas template
export function getCanvasType(templateName: string): CanvasType | null {
  const name = templateName.toLowerCase();
  if (name.includes('business model canvas') || name.includes('bmc')) return 'bmc';
  if (name.includes('lean canvas')) return 'lean';
  if (name.includes('value proposition')) return 'value_prop';
  if (name.includes('empathy map')) return 'empathy';
  if (name.includes('swot')) return 'swot';
  if (name.includes('go-to-market') || name.includes('gtm')) return 'gtm';
  if (name.includes('icp') || name.includes('persona')) return 'icp';
  if (name.includes('pricing')) return 'pricing';
  if (name.includes('growth loop')) return 'growth_loops';
  if (name.includes('okr') || name.includes('north star')) return 'okrs';
  if (name.includes('fundraising') || name.includes('readiness')) return 'fundraising';
  if (name.includes('sales pipeline')) return 'sales_pipeline';
  if (name.includes('roadmap')) return 'roadmap';
  return null;
}