import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import {
  useTierTags,
  useSetWorkspaceTier,
  type TierTag,
} from '@/hooks/useWorkspaceTiers';

interface Props {
  workspaceId: string;
  currentTier: TierTag | null;
}

/**
 * Compact inline tier picker for the Ecosystem table. Staff (admin +
 * consultant) can change or clear the tier directly — RLS on
 * `workspace_tags` enforces write access via `can_write_workspace`.
 */
export function InlineTierSelect({ workspaceId, currentTier }: Props) {
  const { t } = useTranslation();
  const { data: tierTags = [] } = useTierTags();
  const setTier = useSetWorkspaceTier();
  const allTierTagIds = tierTags.map((tag) => tag.id);

  const handleSelect = (tagId: string | null) => {
    if ((currentTier?.id ?? null) === tagId) return;
    setTier.mutate({ workspaceId, tagId, allTierTagIds });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="inline-flex items-center gap-1 focus:outline-none"
          disabled={setTier.isPending}
          aria-label={t('ecosystem.tierChange', { defaultValue: 'Change tier' })}
        >
          {currentTier ? (
            <Badge
              variant="outline"
              className="text-xs font-medium cursor-pointer hover:opacity-80"
              style={{
                borderColor: currentTier.color ?? undefined,
                color: currentTier.color ?? undefined,
              }}
            >
              {currentTier.name}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
              {t('common.setLabel', { defaultValue: 'Definir' })}
              <ChevronDown className="h-3 w-3" />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {tierTags.map((tag) => (
          <DropdownMenuItem
            key={tag.id}
            onClick={(e) => {
              e.stopPropagation();
              handleSelect(tag.id);
            }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full mr-2"
              style={{ backgroundColor: tag.color ?? '#94a3b8' }}
            />
            {tag.name}
          </DropdownMenuItem>
        ))}
        {currentTier && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
              }}
            >
              {t('common.clear', { defaultValue: 'Limpar' })}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
