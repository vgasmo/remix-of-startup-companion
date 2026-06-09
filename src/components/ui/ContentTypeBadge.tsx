import { useTranslation } from 'react-i18next';
import { FileText, BookOpen, LayoutTemplate, Share2, FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ContentType = 'document' | 'template' | 'resource' | 'support_material' | 'shared';

interface ContentTypeBadgeProps {
  type: ContentType;
  size?: 'sm' | 'default';
  className?: string;
}

// intentional: content-type taxonomy palette — distinct hue per content type, not state semantics
const CONFIG: Record<ContentType, { icon: React.ElementType; labelKey: string; fallback: string; color: string }> = {
  document: { icon: FileText, labelKey: 'contentType.document', fallback: 'Documento', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/30' },
  template: { icon: LayoutTemplate, labelKey: 'contentType.template', fallback: 'Template', color: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400 border-violet-200 dark:border-violet-800/30' },
  resource: { icon: BookOpen, labelKey: 'contentType.resource', fallback: 'Recurso', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30' },
  support_material: { icon: FolderOpen, labelKey: 'contentType.supportMaterial', fallback: 'Material de Apoio', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/30' },
  shared: { icon: Share2, labelKey: 'contentType.shared', fallback: 'Partilhado', color: 'bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-400 border-slate-200 dark:border-slate-800/30' },
};

export function ContentTypeBadge({ type, size = 'default', className }: ContentTypeBadgeProps) {
  const { t } = useTranslation();
  const config = CONFIG[type] || CONFIG.document;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-normal border',
        config.color,
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
        className
      )}
    >
      <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {t(config.labelKey, config.fallback)}
    </Badge>
  );
}
