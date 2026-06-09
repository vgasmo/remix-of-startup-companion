/**
 * <ViewReceipt /> — Inline "seen by" indicator for cross-role visibility.
 *
 * Shows a small eye icon + view count next to founder-facing items so the
 * founder can tell their consultant/mentor has actually looked at the work.
 *
 * Renders nothing when there are no views yet (zero noise on cold start).
 */
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLastViewByRole, type EngagementTargetType } from '@/hooks/useEngagementEvents';

interface ViewReceiptProps {
  workspaceId: string;
  targetType: EngagementTargetType;
  targetId: string;
  className?: string;
}

export function ViewReceipt({ workspaceId, targetType, targetId, className }: ViewReceiptProps) {
  const { t, i18n } = useTranslation();
  const { data: views } = useLastViewByRole(workspaceId, targetType, targetId);

  if (!views || views.length === 0) return null;

  const lastView = views[0];
  const when = formatDistanceToNow(new Date(lastView.created_at), {
    addSuffix: true,
    locale: i18n.language === 'pt' ? pt : undefined,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            className ??
            'inline-flex items-center gap-1 text-[10px] text-muted-foreground/70'
          }
          aria-label={t('engagement.viewsCount', {
            defaultValue: '{{count}} visualizações',
            count: views.length,
          })}
        >
          <Eye className="h-3 w-3" aria-hidden="true" />
          {views.length}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {t('engagement.lastViewed', {
          defaultValue: 'Visto {{when}}',
          when,
        })}
      </TooltipContent>
    </Tooltip>
  );
}
