import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { EcosystemTable } from '@/components/ecosystem/EcosystemTable';
import { EcosystemFilters, type EcosystemFiltersState } from '@/components/ecosystem/EcosystemFilters';
import { CommunityFeed } from '@/components/ecosystem/CommunityFeed';
import { ConsultorPortfolioView } from '@/components/ecosystem/ConsultorPortfolioView';
import { useEcosystemItems } from '@/hooks/useEcosystemItems';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SavedViewsDropdown } from '@/components/crm/SavedViewsDropdown';
import { Button } from '@/components/ui/button';
import { Globe2, Users, Building2, UserCog, Loader2 } from 'lucide-react';

export default function Ecosystem() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'startups';

  const [filters, setFilters] = useState<EcosystemFiltersState>({
    search: '',
    programId: 'all',
    stage: 'all',
    healthScore: 'all',
    ownerId: 'all',
    buildingId: 'all',
    incubationTypeId: 'all',
    categoryId: 'all',
    tagId: 'all',
    needsAttention: false,
    hasStartupPortugal: false,
  });

  const {
    items,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useEcosystemItems(filters);

  const showingCountLabel = t('ecosystem.showingCount', {
    defaultValue: 'A mostrar {{shown}} de {{total}}',
    shown: items.length,
    total: totalCount,
  });

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title={t('ecosystem.title', 'Ecosystem Command Center')}
          subtitle={t('ecosystem.description', 'Unified view of all workspaces and leads')}
          icon={<Globe2 className="h-6 w-6" />}
        />

        <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="startups" className="gap-2">
              <Building2 className="h-4 w-4" />
              {t('ecosystem.startupsTab', 'Startups & Leads')}
            </TabsTrigger>
            <TabsTrigger value="by-consultant" className="gap-2">
              <UserCog className="h-4 w-4" />
              {t('ecosystem.byConsultantTab', 'Por Consultor')}
            </TabsTrigger>
            <TabsTrigger value="community" className="gap-2">
              <Users className="h-4 w-4" />
              {t('ecosystem.communityTab', 'Comunidade')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="startups" className="space-y-6 mt-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <EcosystemFilters filters={filters} onChange={setFilters} />
              <SavedViewsDropdown
                viewType="ecosystem"
                currentFilters={filters as unknown as Record<string, unknown>}
                onApplyView={(f) => setFilters({ ...filters, ...(f as Partial<EcosystemFiltersState>) })}
              />
            </div>
            {isLoading ? (
              <ContentSkeleton type="list" count={10} />
            ) : (
              <>
                <div className="text-xs text-muted-foreground" aria-live="polite">
                  {showingCountLabel}
                </div>
                <EcosystemTable
                  items={items}
                  onOpenItem={(item) => {
                    if (item.item_type === 'workspace' && item.workspace_id) {
                      navigate(`/workspace/${item.workspace_id}`);
                    } else if (item.item_type === 'lead' && item.funnel_item_id) {
                      navigate(`/crm?open=${item.funnel_item_id}`);
                    }
                  }}
                />
                {hasNextPage && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {t('ecosystem.loadMore', { defaultValue: 'Carregar mais' })}
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="by-consultant" className="space-y-6 mt-0">
            <EcosystemFilters filters={filters} onChange={setFilters} showOwnerFilter />
            {isLoading ? (
              <ContentSkeleton type="list" count={6} />
            ) : (
              <>
                <ConsultorPortfolioView items={items} ownerId={filters.ownerId} />
                {hasNextPage && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {t('ecosystem.loadMore', { defaultValue: 'Carregar mais' })}
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="community" className="mt-0">
            <CommunityFeed />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

