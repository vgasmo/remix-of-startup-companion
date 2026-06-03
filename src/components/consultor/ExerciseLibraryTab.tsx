import { useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Plus,
  Clock,
  Users,
  Tag,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  FileEdit,
  Trash2,
  MoreVertical,
  BookOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useExerciseLibrary, Exercise } from '@/hooks/useExerciseLibrary';
import { useAuth } from '@/contexts/AuthContext';
import { ExerciseFormDialog } from './ExerciseFormDialog';
import { ExerciseDetailDialog } from './ExerciseDetailDialog';
import { cn } from '@/lib/utils';

const CONTEXT_TAGS = [
  'idea',
  'validation',
  'early_traction',
  'growth',
  'b2b',
  'b2c',
  'marketplace',
  'deep_tech',
  'impact',
  'saas',
  'fundraising',
];

const GROUP_SIZE_LABELS: Record<string, string> = {
  '1:1': '1:1',
  small_group: 'Small Group',
  cohort: 'Cohort',
};

export function ExerciseLibraryTab() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [groupSizeFilter, setGroupSizeFilter] = useState<string>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [editExercise, setEditExercise] = useState<Exercise | null>(null);

  const { data: exercises, isLoading } = useExerciseLibrary({
    tags: tagFilter ? [tagFilter] : undefined,
    groupSize: groupSizeFilter || undefined,
  });

  const filteredExercises = exercises?.filter(
    (ex) =>
      ex.title.toLowerCase().includes(search.toLowerCase()) ||
      ex.purpose?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('consultorTools.searchExercises', 'Search exercises...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={tagFilter || "all"} onValueChange={(v) => setTagFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('consultorTools.filterByContext', 'Filter by context')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('consultorTools.allContexts', 'All contexts')}</SelectItem>
            {CONTEXT_TAGS.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupSizeFilter || "all"} onValueChange={(v) => setGroupSizeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t('consultorTools.groupSize', 'Group size')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('consultorTools.allSizes', 'All sizes')}</SelectItem>
            <SelectItem value="1:1">1:1</SelectItem>
            <SelectItem value="small_group">{t('consultorTools.smallGroup', 'Small Group')}</SelectItem>
            <SelectItem value="cohort">{t('consultorTools.cohort', 'Cohort')}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('consultorTools.newExercise', 'New Exercise')}
        </Button>
      </div>

      {/* Exercise List */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredExercises?.length === 0 ? (
        <Card className="bg-muted/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-heading text-lg font-semibold mb-2">
              {t('consultorTools.noExercises', 'No exercises found')}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search
                ? t('consultorTools.tryAdjustingSearch', 'Try adjusting your search or filters')
                : t('consultorTools.createFirstExercise', 'Create your first exercise to get started')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredExercises?.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              onView={() => setSelectedExercise(exercise)}
              onEdit={() => setEditExercise(exercise)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ExerciseFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        exercise={null}
      />
      {editExercise && (
        <ExerciseFormDialog
          open={!!editExercise}
          onOpenChange={(open) => !open && setEditExercise(null)}
          exercise={editExercise}
        />
      )}
      {selectedExercise && (
        <ExerciseDetailDialog
          open={!!selectedExercise}
          onOpenChange={(open) => !open && setSelectedExercise(null)}
          exercise={selectedExercise}
        />
      )}
    </div>
  );
}

function ExerciseCard({
  exercise,
  onView,
  onEdit,
  isAdmin,
}: {
  exercise: Exercise;
  onView: () => void;
  onEdit: () => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 cursor-pointer" {...clickableProps(onView)}>
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base truncate">{exercise.title}</CardTitle>
              {exercise.status === 'approved' ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {t('common.approved', 'Approved')}
                </Badge>
              ) : (
                <Badge variant="outline">{t('common.draft', 'Draft')}</Badge>
              )}
            </div>
            <CardDescription className="line-clamp-2">{exercise.purpose}</CardDescription>
          </div>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Exercise options">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <FileEdit className="h-4 w-4 mr-2" />
                  {t('common.edit', 'Edit')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {exercise.duration_minutes} min
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {GROUP_SIZE_LABELS[exercise.group_size] || exercise.group_size}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {exercise.startup_context_tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              <Tag className="h-2.5 w-2.5 mr-1" />
              {tag.replace('_', ' ')}
            </Badge>
          ))}
          {exercise.startup_context_tags.length > 4 && (
            <Badge variant="outline" className="text-xs">
              +{exercise.startup_context_tags.length - 4}
            </Badge>
          )}
        </div>

        {/* Expandable details */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              {expanded ? t('common.lessDetails', 'Less details') : t('common.moreDetails', 'More details')}
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            {exercise.materials_needed.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{t('consultorTools.materialsNeeded', 'Materials needed')}:</p>
                <ul className="text-sm list-disc list-inside">
                  {exercise.materials_needed.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {exercise.success_criteria && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{t('consultorTools.successCriteria', 'Success criteria')}:</p>
                <p className="text-sm">{exercise.success_criteria}</p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// Export for reuse
export { CONTEXT_TAGS, GROUP_SIZE_LABELS };
