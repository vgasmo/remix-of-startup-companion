import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen, Clock, Tag } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RESOURCES_CATALOG, CATEGORY_LABELS } from '@/lib/resourcesCatalog';
import { GUIDE_CONTENT, type GuideContent } from '@/lib/guideContent';

export default function ResourceGuide() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'pt' ? 'pt' : 'en';

  const resource = RESOURCES_CATALOG.find(r => r.id === id);
  const guide: GuideContent | undefined = id ? GUIDE_CONTENT[id] : undefined;

  if (!resource || !guide) {
    return (
      <AppLayout title={t('resourceGuide.notFoundTitle')}>
        <div className="max-w-3xl mx-auto py-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {t('resourceGuide.notFoundTitle')}
          </h2>
          <p className="text-muted-foreground mb-6">
            {t('resourceGuide.notFoundDesc')}
          </p>
          <Button asChild variant="outline">
            <Link to="/resources"><ArrowLeft className="h-4 w-4 mr-2" /> {t('resourceGuide.backToResources')}</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const title = lang === 'pt' ? resource.title_pt : resource.title_en;
  const content = lang === 'pt' ? guide.content_pt : guide.content_en;
  const catLabel = CATEGORY_LABELS[resource.category]?.[lang] || resource.category;

  return (
    <AppLayout title={title}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back */}
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link to="/resources"><ArrowLeft className="h-3.5 w-3.5" /> {t('resourceGuide.resources')}</Link>
        </Button>

        {/* Header */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="secondary">{catLabel}</Badge>
            {resource.stages.map(s => (
              <Badge key={s} variant="outline">{t(`resources.stageLabels.${s}`, { defaultValue: s })}</Badge>
            ))}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {lang === 'pt' ? resource.desc_pt : resource.desc_en}
          </p>
          {guide.reading_minutes && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
              <Clock className="h-3.5 w-3.5" />
              {guide.reading_minutes} min {t('resourceGuide.read')}
            </div>
          )}
        </div>

        <Separator />

        {/* Content sections */}
        <div className="space-y-8">
          {content.map((section, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5 space-y-3">
                <h3 className="text-lg font-semibold">{section.heading}</h3>
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {section.body}
                </div>
                {section.tips && section.tips.length > 0 && (
                  <div className="mt-3 bg-muted/50 rounded-lg p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-primary">{t('resourceGuide.tips')}</p>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                      {section.tips.map((tip, j) => <li key={j}>{tip}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tags */}
        {resource.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-4">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            {resource.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
