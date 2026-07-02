import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, TrendingUp, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from "@/lib/notify";
import { AiFallbackCard } from '@/components/ui/AiFallbackCard';

interface RelationshipRecapCardProps {
  workspaceId: string;
}

interface RecapData {
  vibe: string;
  momentum: 'accelerating' | 'steady' | 'stalling' | 'unknown';
  summary: string;
  key_points: string[];
  next_best_step: string;
}

const momentumConfig: Record<string, { label: string; color: string }> = {
  accelerating: { label: 'Acelerando', color: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] ' },
  steady: { label: 'Estável', color: 'bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]' },
  stalling: { label: 'A Abrandar', color: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]' },
  unknown: { label: 'Sem Dados', color: 'bg-muted text-muted-foreground' },
};

export function RelationshipRecapCard({ workspaceId }: RelationshipRecapCardProps) {
  const { t, i18n } = useTranslation();
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error: err } = await invokeWithAuth('generate-relationship-recap', {
        body: {
          workspace_id: workspaceId,
          language: i18n.language === 'pt' ? 'pt' : 'en',
          include_vibe: true,
        },
      });
      if (err) throw err;
      const d = data as any;
      setRecap({
        vibe: d.vibe || d.summary?.slice(0, 80) || 'Neutral',
        momentum: d.momentum || (d.key_points?.length > 2 ? 'steady' : 'unknown'),
        summary: d.summary || '',
        key_points: d.key_points || [],
        next_best_step: d.next_best_actions?.[0] || d.next_best_step || '',
      });
    } catch (err: any) {
      const status = err?.status ?? err?.context?.status;
      if (status === 401 || status === 500 || status === 404) {
        setError(true);
        // Don't toast on expected service-unavailable — fallback card is enough
      } else {
        setError(true);
        notify.error(t('workspace.relationshipRecap.error', { defaultValue: 'Não foi possível gerar o resumo. Tente mais tarde.' }));
      }
    } finally {
      setLoading(false);
    }
  };

  if (error && !recap) {
    return <AiFallbackCard title={t('workspace.relationshipRecap.title', { defaultValue: 'Relationship Intelligence' })} />;
  }

  if (!recap && !loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('workspace.relationshipRecap.title', { defaultValue: 'Relationship Intelligence' })}</p>
              <p className="text-xs text-muted-foreground">
                {t('workspace.relationshipRecap.cta', { defaultValue: 'Analisa o vibe e momentum das últimas interações.' })}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={loading} loading={loading} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {t('workspace.relationshipRecap.generate', { defaultValue: 'Gerar Resumo' })}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!recap) return null;

  const momentum = momentumConfig[recap.momentum] || momentumConfig.unknown;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('workspace.relationshipRecap.title', { defaultValue: 'Relationship Intelligence' })}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={`text-[10px] ${momentum.color}`}>{momentum.label}</Badge>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleGenerate}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Vibe */}
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {t('workspace.relationshipRecap.vibe', { defaultValue: 'Vibe' })}
          </p>
          <p className="text-sm">{recap.vibe}</p>
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground">{recap.summary}</p>

        {/* Key Points */}
        {recap.key_points.length > 0 && (
          <ul className="space-y-1.5">
            {recap.key_points.slice(0, 4).map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <TrendingUp className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Next Best Step */}
        {recap.next_best_step && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs font-medium text-primary uppercase tracking-wide mb-1 flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              {t('workspace.relationshipRecap.nextStep', { defaultValue: 'Próximo Passo Recomendado' })}
            </p>
            <p className="text-sm font-medium">{recap.next_best_step}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
