import { useState } from 'react';
import { clickableProps } from '@/lib/clickable';
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

// Canvas palette — centralized lookup for the deliberate visual taxonomy
// used across BMC / Lean / VPC / SWOT / etc. Section colors are intentional
// (each role in a canvas has a recognizable hue); this map keeps the raw
// Tailwind classes in ONE place so component code can reference semantic keys.
type CanvasPaletteKey =
  | 'blue' | 'indigo' | 'purple' | 'green' | 'emerald'
  | 'yellow' | 'amber' | 'orange' | 'red' | 'neutral';

const CANVAS_PALETTE: Record<CanvasPaletteKey, string> = {
  blue:    'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  indigo:  'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800',
  purple:  'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
  green:   'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
  yellow:  'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800',
  amber:   'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  orange:  'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
  red:     'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  neutral: 'bg-muted/40 border-border',
};

// Section definitions with i18n keys
const createSections = (t: (key: string) => string, canvasType: string): CanvasSection[] => {
  const getSectionData = (id: string, gridArea: string, paletteKey: CanvasPaletteKey): CanvasSection => ({
    id,
    label: t(`templates.canvas.${canvasType}.${id}`) || id,
    placeholder: t(`templates.canvas.${canvasType}.${id}_placeholder`) || '',
    gridArea,
    color: CANVAS_PALETTE[paletteKey],
  });

  switch (canvasType) {
    case 'bmc':
      return [
        getSectionData('key_partners', 'partners', 'blue'),
        getSectionData('key_activities', 'activities', 'indigo'),
        getSectionData('key_resources', 'resources', 'purple'),
        getSectionData('value_propositions', 'value', 'green'),
        getSectionData('customer_relationships', 'relationships', 'yellow'),
        getSectionData('channels', 'channels', 'orange'),
        getSectionData('customer_segments', 'segments', 'red'),
        getSectionData('cost_structure', 'costs', 'neutral'),
        getSectionData('revenue_streams', 'revenue', 'emerald'),
      ];
    case 'lean':
      return [
        getSectionData('problem', 'problem', 'red'),
        getSectionData('solution', 'solution', 'green'),
        getSectionData('key_metrics', 'metrics', 'blue'),
        getSectionData('unique_value', 'uvp', 'purple'),
        getSectionData('unfair_advantage', 'advantage', 'indigo'),
        getSectionData('channels', 'channels', 'yellow'),
        getSectionData('customer_segments', 'segments', 'orange'),
        getSectionData('cost_structure', 'costs', 'neutral'),
        getSectionData('revenue_streams', 'revenue', 'emerald'),
      ];
    case 'value_prop':
      return [
        getSectionData('customer_jobs', 'jobs', 'blue'),
        getSectionData('pains', 'pains', 'red'),
        getSectionData('gains', 'gains', 'green'),
        getSectionData('products_services', 'products', 'purple'),
        getSectionData('pain_relievers', 'relievers', 'orange'),
        getSectionData('gain_creators', 'creators', 'emerald'),
      ];
    case 'empathy':
      return [
        getSectionData('think_feel', 'think', 'purple'),
        getSectionData('hear', 'hear', 'blue'),
        getSectionData('see', 'see', 'green'),
        getSectionData('say_do', 'saydo', 'yellow'),
        getSectionData('pains', 'pains', 'red'),
        getSectionData('gains', 'gains', 'emerald'),
      ];
    case 'swot':
      return [
        getSectionData('strengths', 'strengths', 'green'),
        getSectionData('weaknesses', 'weaknesses', 'red'),
        getSectionData('opportunities', 'opportunities', 'blue'),
        getSectionData('threats', 'threats', 'orange'),
      ];
    case 'gtm':
      return [
        getSectionData('target_market', 'market', 'blue'),
        getSectionData('positioning', 'positioning', 'purple'),
        getSectionData('channels', 'channels', 'green'),
        getSectionData('launch', 'launch', 'amber'),
      ];
    case 'icp':
      return [
        getSectionData('company_profile', 'company', 'blue'),
        getSectionData('buyer_persona', 'persona', 'purple'),
        getSectionData('pain_points', 'pains', 'red'),
        getSectionData('buying_behavior', 'buying', 'green'),
      ];
    case 'pricing':
      return [
        getSectionData('pricing_model', 'model', 'blue'),
        getSectionData('tiers', 'tiers', 'purple'),
        getSectionData('value_metric', 'metric', 'green'),
        getSectionData('competition', 'competition', 'amber'),
      ];
    case 'growth_loops':
      return [
        getSectionData('trigger', 'trigger', 'blue'),
        getSectionData('value', 'value', 'green'),
        getSectionData('acquisition', 'acquisition', 'purple'),
        getSectionData('retention', 'retention', 'amber'),
      ];
    case 'okrs':
      return [
        getSectionData('north_star', 'northstar', 'purple'),
        getSectionData('objective_1', 'obj1', 'blue'),
        getSectionData('key_results_1', 'kr1', 'green'),
        getSectionData('objective_2', 'obj2', 'blue'),
        getSectionData('key_results_2', 'kr2', 'green'),
      ];
    case 'fundraising':
      return [
        getSectionData('round_target', 'target', 'blue'),
        getSectionData('metrics', 'metrics', 'green'),
        getSectionData('materials', 'materials', 'purple'),
        getSectionData('investors', 'investors', 'amber'),
      ];
    case 'sales_pipeline':
      return [
        getSectionData('pipeline_overview', 'overview', 'blue'),
        getSectionData('stages', 'stages', 'green'),
        getSectionData('metrics', 'metrics', 'purple'),
      ];
    case 'roadmap':
      return [
        getSectionData('now', 'now', 'green'),
        getSectionData('next', 'next', 'blue'),
        getSectionData('later', 'later', 'purple'),
        getSectionData('not_doing', 'notdoing', 'neutral'),
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
              <Badge className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">{t('templates.pendingReview')}</Badge>
            )}
            {reviewStatus === 'approved' && (
              <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"><CheckCircle className="h-3 w-3 mr-1" />{t('templates.approved')}</Badge>
            )}
            {reviewStatus === 'needs_changes' && (
              <Badge className="bg-destructive/10 text-destructive"><MessageSquare className="h-3 w-3 mr-1" />{t('templates.needsChanges')}</Badge>
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
        <div className="w-full overflow-x-auto">
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
                  {...clickableProps(() => !disabled && !isEditing && handleEdit(section.id))}
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
                    <div className="space-y-2" {...clickableProps((e) => e.stopPropagation())}>
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
                    <div className="text-sm text-foreground/90 whitespace-pre-wrap">
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
        </div>
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