import { useTranslation } from 'react-i18next';
import { GraduationCap, Download, FileText, ExternalLink, Tag } from 'lucide-react';
import { notify } from "@/lib/notify";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useSupportMaterials,
  useSupportMaterialDownloadUrl,
  SupportMaterial,
} from '@/hooks/useSupportMaterials';
import { useWorkspace } from '@/hooks/useWorkspaces';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface ProgramMaterialsPanelProps {
  workspaceId: string;
}

/**
 * Founder-facing panel listing support materials uploaded by consultors
 * for the workspace's program (plus globals). Read-only with download.
 */
export function ProgramMaterialsPanel({ workspaceId }: ProgramMaterialsPanelProps) {
  const { t } = useTranslation();
  const { data: workspace } = useWorkspace(workspaceId);
  const programId = workspace?.program_id ?? undefined;

  const { data: materials, isLoading } = useSupportMaterials({
    programId,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (!materials || materials.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title={t('documents.programMaterials.emptyTitle', 'Sem materiais do programa')}
        description={t(
          'documents.programMaterials.emptyDescription',
          'Os consultores ainda não publicaram materiais para este programa. Vão aparecer aqui assim que carregarem PowerPoints, PDFs ou outros recursos.'
        )}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">
          {t('documents.programMaterials.title', 'Materiais do Programa')}
        </h2>
        <Badge variant="secondary">{materials.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          'documents.programMaterials.description',
          'Recursos carregados pelos consultores para os founders deste programa (slides de sessões, guias, checklists).'
        )}
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {materials.map((m) => (
          <ProgramMaterialCard key={m.id} material={m} />
        ))}
      </div>
    </div>
  );
}

function ProgramMaterialCard({ material }: { material: SupportMaterial }) {
  const { t } = useTranslation();
  const getUrl = useSupportMaterialDownloadUrl();

  const handleDownload = async () => {
    if (!material.file_path) return;
    try {
      const url = await getUrl.mutateAsync(material.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      notify.error(t('common.error', 'Erro'), { description: (err as Error).message });
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base line-clamp-2">{material.title}</CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {material.category && (
                <Badge variant="outline" className="text-xs">{material.category}</Badge>
              )}
              {material.startup_stage && (
                <Badge variant="secondary" className="text-xs">
                  {material.startup_stage.replace('_', ' ')}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {material.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{material.description}</p>
        )}
        {material.tags && material.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {material.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag className="h-2.5 w-2.5 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {material.file_path && (
            <Button onClick={handleDownload} disabled={getUrl.isPending} size="sm" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              {getUrl.isPending
                ? t('common.loading', 'A carregar…')
                : t('documents.programMaterials.download', 'Descarregar')}
            </Button>
          )}
          {material.external_links?.map((link, i) => (
            <a
              key={i}
              href={sanitizeUrl(link.url) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {link.title || link.url}
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
