import { useTranslation } from 'react-i18next';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePrograms } from '@/hooks/useWorkspaces';
import { useTagCategories, useTagsByCategory } from '@/hooks/useEcosystemItems';
import { Card } from '@/components/ui/card';

export interface EcosystemFiltersState {
  search: string;
  programId: string;
  stage: string;
  healthScore: string;
  ownerId: string;
  buildingId: string;
  incubationTypeId: string;
  categoryId: string;
  tagId: string;
  needsAttention: boolean;
  hasStartupPortugal: boolean;
}

interface Props {
  filters: EcosystemFiltersState;
  onChange: (filters: EcosystemFiltersState) => void;
}

// Stage values are now translated in the component using t()
const STAGE_VALUES = ['all', 'ideation', 'validation', 'early_traction', 'scaling', 'growth', 'new', 'first_contact_booked', 'met', 'contracted'] as const;

// Health scores are now translated in the component using t()
const HEALTH_SCORE_VALUES = ['all', 'critical', 'at_risk', 'stable', 'healthy', 'thriving'] as const;

export function EcosystemFilters({ filters, onChange }: Props) {
  const { t } = useTranslation();
  const { data: programs } = usePrograms();
  const { data: categories } = useTagCategories();
  const { data: tags } = useTagsByCategory(filters.categoryId !== 'all' ? filters.categoryId : undefined);

  const updateFilter = (key: keyof EcosystemFiltersState, value: string | boolean) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-4 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground mb-1 block">
            {t('common.search', 'Search')}
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('ecosystem.searchPlaceholder', 'Search by name...')}
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Program Filter */}
        <div className="w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1 block">
            {t('workspace.program', 'Program')}
          </Label>
          <Select value={filters.programId} onValueChange={(v) => updateFilter('programId', v)}>
            <SelectTrigger>
              <SelectValue placeholder={t('ecosystem.allPrograms', 'All Programs')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ecosystem.allPrograms', 'All Programs')}</SelectItem>
              {programs?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stage Filter */}
        <div className="w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1 block">
            {t('workspace.stage', 'Stage')}
          </Label>
          <Select value={filters.stage} onValueChange={(v) => updateFilter('stage', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_VALUES.map(s => (
                <SelectItem key={s} value={s}>
                  {s === 'all' ? t('ecosystem.allStages') : t(`stages.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Health Score Filter */}
        <div className="w-[150px]">
          <Label className="text-xs text-muted-foreground mb-1 block">
            {t('workspace.healthScore', 'Health')}
          </Label>
          <Select value={filters.healthScore} onValueChange={(v) => updateFilter('healthScore', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEALTH_SCORE_VALUES.map(h => (
                <SelectItem key={h} value={h}>
                  {h === 'all' ? t('ecosystem.allHealth') : t(`health.levels.${h}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tag Category Filter */}
        <div className="w-[150px]">
          <Label className="text-xs text-muted-foreground mb-1 block">
            {t('ecosystem.tagCategory', 'Tag Category')}
          </Label>
          <Select value={filters.categoryId} onValueChange={(v) => updateFilter('categoryId', v)}>
            <SelectTrigger>
              <SelectValue placeholder={t('ecosystem.allCategories', 'All')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ecosystem.allCategories', 'All Categories')}</SelectItem>
              {categories?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Needs Attention Toggle */}
        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="needs-attention"
            checked={filters.needsAttention}
            onCheckedChange={(v) => updateFilter('needsAttention', v)}
          />
          <Label htmlFor="needs-attention" className="text-sm cursor-pointer">
            {t('ecosystem.needsAttention', 'Needs Attention')}
          </Label>
        </div>
      </div>
    </Card>
  );
}
