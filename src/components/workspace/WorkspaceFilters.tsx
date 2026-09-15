import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, ArrowUpDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ViewToggle, ViewMode } from '@/components/ui/ViewToggle';
import { StartupStage, HealthScore, WorkspacePriority } from '@/types/database';
import { SortOption } from '@/hooks/useWorkspaces';

const stages: StartupStage[] = ['ideation', 'validation', 'mvp', 'growth', 'scale'];
const healthScores: HealthScore[] = ['critical', 'at_risk', 'stable', 'healthy', 'thriving'];
const priorities: WorkspacePriority[] = ['star', 'high', 'standard', 'maintenance'];

interface Program {
  id: string;
  name: string;
}

interface WorkspaceFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  programFilter: string;
  onProgramFilterChange: (value: string) => void;
  stageFilter: StartupStage | 'all';
  onStageFilterChange: (value: StartupStage | 'all') => void;
  healthFilter: HealthScore | 'all';
  onHealthFilterChange: (value: HealthScore | 'all') => void;
  priorityFilter: WorkspacePriority | 'all';
  onPriorityFilterChange: (value: WorkspacePriority | 'all') => void;
  missingKpi: boolean;
  onMissingKpiChange: (value: boolean) => void;
  overdueActions: boolean;
  onOverdueActionsChange: (value: boolean) => void;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  programs: Program[];
  activeFiltersCount: number;
  activeQuickFiltersCount: number;
  onClearFilters: () => void;
}

export const WorkspaceFilters = memo(function WorkspaceFilters({
  search,
  onSearchChange,
  programFilter,
  onProgramFilterChange,
  stageFilter,
  onStageFilterChange,
  healthFilter,
  onHealthFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  missingKpi,
  onMissingKpiChange,
  overdueActions,
  onOverdueActionsChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  programs,
  activeFiltersCount,
  activeQuickFiltersCount,
  onClearFilters,
}: WorkspaceFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-6 space-y-4">
      {/* Search - always full width on mobile */}
      <div className="relative w-full lg:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('filters.searchStartups', { defaultValue: 'Pesquisar startups...' })}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters row - scrollable on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible lg:flex-wrap items-center">
        <ViewToggle view={viewMode} onChange={onViewModeChange} />

        <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortOption)}>
          <SelectTrigger className="w-[130px] sm:w-[150px] flex-shrink-0">
            <ArrowUpDown className="h-4 w-4 mr-1 sm:mr-2" />
            <SelectValue placeholder={t('filters.sortBy', { defaultValue: 'Ordenar' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">{t('filters.byPriority', { defaultValue: 'Por Prioridade' })}</SelectItem>
            <SelectItem value="urgency">{t('filters.byUrgency', { defaultValue: 'Por Urgência' })}</SelectItem>
            <SelectItem value="meeting">{t('filters.byNextMeeting', { defaultValue: 'Por Próxima Reunião' })}</SelectItem>
            <SelectItem value="name">{t('filters.byName', { defaultValue: 'Por Nome' })}</SelectItem>
            <SelectItem value="updated">{t('filters.lastUpdated', { defaultValue: 'Última Atualização' })}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={programFilter} onValueChange={onProgramFilterChange}>
          <SelectTrigger className="w-[130px] sm:w-[160px] flex-shrink-0">
            <SelectValue placeholder={t('filters.program', { defaultValue: 'Programa' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allPrograms', { defaultValue: 'Todos os Programas' })}</SelectItem>
            {programs?.length > 0 ? (
              programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.name}
                </SelectItem>
              ))
            ) : (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                {t('filters.noProgramsAvailable', { defaultValue: 'Sem programas disponíveis' })}
              </div>
            )}
          </SelectContent>
        </Select>

        {/* Hidden on mobile, shown on sm+ */}
        <div className="hidden sm:contents">
          <Select
          value={stageFilter}
          onValueChange={(v) => onStageFilterChange(v as StartupStage | 'all')}
        >
          <SelectTrigger className="w-[120px] sm:w-[140px] flex-shrink-0">
            <SelectValue placeholder={t('filters.stage', { defaultValue: 'Fase' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allStages', { defaultValue: 'Todas as Fases' })}</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {t(`stages.${stage}`, { defaultValue: stage })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={healthFilter}
          onValueChange={(v) => onHealthFilterChange(v as HealthScore | 'all')}
        >
          <SelectTrigger className="w-[120px] sm:w-[140px] flex-shrink-0">
            <SelectValue placeholder={t('filters.health', { defaultValue: 'Saúde' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allHealth', { defaultValue: 'Toda a Saúde' })}</SelectItem>
            {healthScores.map((health) => (
              <SelectItem key={health} value={health}>
                {t(`health.levels.${health}`, { defaultValue: health.replace('_', ' ') })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={priorityFilter}
          onValueChange={(v) => onPriorityFilterChange(v as WorkspacePriority | 'all')}
        >
          <SelectTrigger className="w-[120px] sm:w-[140px] flex-shrink-0">
            <SelectValue placeholder={t('filters.priority', { defaultValue: 'Prioridade' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allPriorities', { defaultValue: 'Todas as Prioridades' })}</SelectItem>
            {priorities.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {t(`priorities.${priority}`, { defaultValue: priority })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1 sm:gap-2 flex-shrink-0">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">{t('filters.more', { defaultValue: 'Mais' })}</span>
              {activeFiltersCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 w-5 p-0 flex items-center justify-center"
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="missing-kpi"
                  checked={missingKpi}
                  onCheckedChange={(v) => onMissingKpiChange(!!v)}
                />
                <Label htmlFor="missing-kpi" className="text-sm cursor-pointer">
                  {t('filters.missingKpi', { defaultValue: 'KPI em falta este mês' })}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="overdue-actions"
                  checked={overdueActions}
                  onCheckedChange={(v) => onOverdueActionsChange(!!v)}
                />
                <Label htmlFor="overdue-actions" className="text-sm cursor-pointer">
                  {t('filters.overdueActionItems', { defaultValue: 'Ações em atraso' })}
                </Label>
              </div>
              {(activeFiltersCount > 0 || activeQuickFiltersCount > 0) && (
                <Button variant="ghost" size="sm" className="w-full" onClick={onClearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  {t('filters.clearAll', { defaultValue: 'Limpar Todos os Filtros' })}
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
});
