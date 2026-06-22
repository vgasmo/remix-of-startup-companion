import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { 
  Search, Rocket, Users, FileText, BookOpen, GraduationCap, 
  ExternalLink, Star, StarOff, ArrowRight, Lightbulb, X, HelpCircle
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import {
  RESOURCES_CATALOG,
  CATEGORY_LABELS,
  STAGE_LABELS,
  type ResourceItem,
  getFavorites,
  toggleFavorite,
  addRecent,
} from '@/lib/resourcesCatalog';
import { FAQ_ITEMS } from '@/lib/faqCatalog';

// ── Helpers ──
function ResourceCard({ r, favs, onToggleFav, lang }: { r: ResourceItem; favs: string[]; onToggleFav: (id: string) => void; lang: string }) {
  const { t } = useTranslation();
  const isFav = favs.includes(r.id);
  const title = lang === 'pt' ? r.title_pt : r.title_en;
  const desc = lang === 'pt' ? r.desc_pt : r.desc_en;
  const isExternal = r.type === 'external';
  const catLabel = CATEGORY_LABELS[r.category]?.[lang === 'pt' ? 'pt' : 'en'] || r.category;

  const handleClick = () => addRecent(r.id);

  return (
    <Card className="group hover:shadow-md transition-shadow border-border/60">
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isExternal ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={handleClick} className="font-medium text-sm hover:text-primary flex items-center gap-1.5 leading-tight">
                {title} <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
              </a>
            ) : (
              <Link to={r.url} onClick={handleClick} className="font-medium text-sm hover:text-primary flex items-center gap-1.5 leading-tight">
                {title} <ArrowRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
              </Link>
            )}
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{desc}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={()=> onToggleFav(r.id)} aria-label={t('common._iconToggleFavorite')}>
            {isFav ? <Star className="h-3.5 w-3.5 text-[hsl(var(--warning))] fill-amber-500" /> : <StarOff className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{catLabel}</Badge>
          {r.stages.slice(0, 2).map(s => (
            <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{STAGE_LABELS[s]?.[lang === 'pt' ? 'pt' : 'en'] || s}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sections ──
type FilterType = 'all' | 'external' | 'internal';

export default function Resources() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { roles } = useAuth();
  const isFounder = roles.includes('founder');
  const isMentor = roles.includes('mentor_externo');
  const { data: workspaces = [] } = useWorkspaces();
  const firstWsId = workspaces[0]?.id;

  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState<string[]>(getFavorites);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStage, setFilterStage] = useState('');

  const handleToggleFav = useCallback((id: string) => {
    setFavs(toggleFavorite(id));
  }, []);

  const userRole = isFounder ? 'founder' : isMentor ? 'mentor' : 'staff';

  const filtered = useMemo(() => {
    let items = RESOURCES_CATALOG;
    if (filterType !== 'all') items = items.filter(r => r.type === filterType);
    if (filterCategory) items = items.filter(r => r.category === filterCategory);
    if (filterStage) items = items.filter(r => r.stages.includes(filterStage as any));
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(r =>
        r.title_pt.toLowerCase().includes(q) ||
        r.title_en.toLowerCase().includes(q) ||
        r.desc_pt.toLowerCase().includes(q) ||
        r.desc_en.toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return items;
  }, [query, filterType, filterCategory, filterStage]);

  const isSearching = query.trim().length > 0;
  const isFiltering = filterType !== 'all' || filterCategory !== '' || filterStage !== '';

  const filteredFaqs = useMemo(() => {
    if (!isSearching) return [];
    const q = query.toLowerCase();
    return FAQ_ITEMS.filter(f =>
      f.q_pt.toLowerCase().includes(q) || f.q_en.toLowerCase().includes(q) ||
      f.a_pt.toLowerCase().includes(q) || f.a_en.toLowerCase().includes(q) ||
      f.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }, [isSearching, query]);

  const searchGroups = useMemo(() => {
    if (!isSearching) return null;
    const groups: Record<string, ResourceItem[]> = {};
    for (const r of filtered) {
      const key = r.type === 'internal' ? (lang === 'pt' ? 'Internos' : 'Internal') : (CATEGORY_LABELS[r.category]?.[lang === 'pt' ? 'pt' : 'en'] || r.category);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [isSearching, filtered, lang]);

  const recommended = useMemo(() => {
    return RESOURCES_CATALOG
      .filter(r => r.roles.includes(userRole))
      .filter(r => r.stages.includes('pre_seed') || r.stages.includes('ideation'))
      .slice(0, 3);
  }, [userRole]);

  const hasFilters = filterType !== 'all' || filterCategory || filterStage;

  return (
    <AppLayout
      title={t('resources.title', { defaultValue: 'Rede & Recursos' })}
      subtitle={t('resources.subtitle', { defaultValue: 'Guias, playbooks, mentoria e materiais de apoio para avançar mais depressa — sem perder rigor.' })}
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {firstWsId && (
          <p className="text-xs text-muted-foreground/70">
            {t('resources.docsHint', { defaultValue: 'Procura os ficheiros da sua startup (pitch deck, modelo financeiro)?' })}{' '}
            <Link to={`/workspace/${firstWsId}?tab=documents`} className="text-primary hover:underline font-medium">
              {t('resources.docsHintLink', { defaultValue: 'Abrir Documentos da Startup →' })}
            </Link>
          </p>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('resources.searchPlaceholder', { defaultValue: 'Pesquisar mentores, templates, playbooks, termos e FAQs…' })}
            className="pl-10 pr-10"
          />
          {query && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={()=> setQuery('')} aria-label={t('common.close')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'external', 'internal'] as FilterType[]).map(ft => (
            <Badge key={ft} variant={filterType === ft ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => setFilterType(ft)}>
              {ft === 'all' ? t('resources.filters.all', { defaultValue: 'Todos' }) : ft === 'external' ? t('resources.filters.external', { defaultValue: 'Externos' }) : t('resources.filters.internal', { defaultValue: 'Internos' })}
            </Badge>
          ))}
          <span className="w-px h-6 bg-border self-center" />
          {Object.entries(CATEGORY_LABELS).map(([key, labels]) => (
            <Badge key={key} variant={filterCategory === key ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => setFilterCategory(filterCategory === key ? '' : key)}>
              {lang === 'pt' ? labels.pt : labels.en}
            </Badge>
          ))}
          <span className="w-px h-6 bg-border self-center" />
          {Object.entries(STAGE_LABELS).map(([key, labels]) => (
            <Badge key={key} variant={filterStage === key ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => setFilterStage(filterStage === key ? '' : key)}>
              {lang === 'pt' ? labels.pt : labels.en}
            </Badge>
          ))}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => { setFilterType('all'); setFilterCategory(''); setFilterStage(''); }}>
              {t('filters.clearAll', { defaultValue: 'Limpar Todos os Filtros' })}
            </Button>
          )}
        </div>

        {/* Search results */}
        {isSearching ? (
          <div className="space-y-6">
            {searchGroups && Object.keys(searchGroups).length > 0 && (
              Object.entries(searchGroups).map(([group, items]) => (
                <div key={group}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">{group}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(r => <ResourceCard key={r.id} r={r} favs={favs} onToggleFav={handleToggleFav} lang={lang} />)}
                  </div>
                </div>
              ))
            )}
            {filteredFaqs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5" /> FAQ
                </h3>
                <Accordion type="multiple" className="max-w-3xl space-y-2">
                  {filteredFaqs.slice(0, 5).map(f => (
                    <AccordionItem key={f.id} value={f.id} className="border rounded-lg px-4">
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">
                        {lang === 'pt' ? f.q_pt : f.q_en}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                        {lang === 'pt' ? f.a_pt : f.a_en}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                {filteredFaqs.length > 5 && (
                  <Button variant="link" size="sm" className="mt-2" asChild>
                    <Link to="/help">{t('common.viewAll', { defaultValue: 'Ver todas' })} ({filteredFaqs.length})</Link>
                  </Button>
                )}
              </div>
            )}
            {(!searchGroups || Object.keys(searchGroups).length === 0) && filteredFaqs.length === 0 && (
              <div className="text-center py-8 space-y-1">
                <p className="text-sm text-muted-foreground">{t('common.noResults', { defaultValue: 'Nenhum resultado encontrado' })}</p>
                <p className="text-xs text-muted-foreground/70">
                  {t('resources.noResultsHint', { defaultValue: 'Experimente termos diferentes ou consulte o Glossário & FAQ para definições.' })}
                </p>
              </div>
            )}
          </div>
        ) : isFiltering ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {lang === 'pt'
                ? `${filtered.length} recurso${filtered.length !== 1 ? 's' : ''} encontrado${filtered.length !== 1 ? 's' : ''}`
                : `${filtered.length} resource${filtered.length !== 1 ? 's' : ''} found`}
            </p>
            {filtered.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(r => <ResourceCard key={r.id} r={r} favs={favs} onToggleFav={handleToggleFav} lang={lang} />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t('common.noResults', { defaultValue: 'Nenhum resultado encontrado' })}</p>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            {/* Recommended for you */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-4.5 w-4.5 text-primary" />
                <h2 className="text-base font-semibold">{t('resources.recommendedForYou', { defaultValue: 'Recomendado para si' })}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recommended.map(r => <ResourceCard key={r.id} r={r} favs={favs} onToggleFav={handleToggleFav} lang={lang} />)}
              </div>
            </section>

            {/* 1. Get Started */}
            <SectionCard
              icon={Rocket}
              title={t('resources.sections.getStarted', { defaultValue: 'Começar / Próximos passos' })}
              desc={t('resources.sections.getStartedDesc', { defaultValue: 'Passos essenciais para arrancar com a sua startup na plataforma.' })}
            >
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {lang === 'pt' ? 'Definir milestones e objetivos' : 'Define milestones and goals'}
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {lang === 'pt' ? 'Criar 3 ações desta semana' : 'Create 3 actions for this week'}
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {lang === 'pt' ? 'Agendar sessão / pedir mentoria' : 'Schedule session / request mentoring'}
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {lang === 'pt' ? 'Submeter pitch deck ou modelo financeiro' : 'Submit pitch deck or financial model'}
                </li>
              </ul>
              <div className="flex flex-wrap gap-2 mt-4">
                {firstWsId && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/workspace/${firstWsId}`}>{lang === 'pt' ? 'Abrir a minha startup' : 'Open my startup'} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to="/mentors">{lang === 'pt' ? 'Pedir mentoria' : 'Request mentoring'} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
              </div>
            </SectionCard>

            {/* 2. Mentoring & Network */}
            <SectionCard
              icon={Users}
              title={t('resources.sections.mentoringNetwork', { defaultValue: 'Mentoria & Rede' })}
              desc={t('resources.sections.mentoringNetworkDesc', { defaultValue: 'Conecte-se com mentores especializados e expanda a sua rede.' })}
            >
              <p className="text-sm text-muted-foreground">
                {isFounder
                  ? (lang === 'pt' ? 'Peça mentoria, explore perfis de mentores e agende sessões.' : 'Request mentoring, explore mentor profiles and schedule sessions.')
                  : isMentor
                    ? (lang === 'pt' ? 'Gerir as suas startups e sessões atribuídas.' : 'Manage your assigned startups and sessions.')
                    : (lang === 'pt' ? 'Acompanhe pedidos de mentoria e gerir atribuições.' : 'Track mentoring requests and manage assignments.')}
              </p>
              <div className="mt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/mentors">{t('resources.actions.openMentoring', { defaultValue: 'Abrir Mentoria' })} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
              </div>
            </SectionCard>

            {/* 3. Templates & Tools */}
            <SectionCard
              icon={FileText}
              title={t('resources.sections.templatesTools', { defaultValue: 'Templates & Ferramentas' })}
              desc={t('resources.sections.templatesToolsDesc', { defaultValue: 'Modelos prontos para pitch decks, financeiros, legais e mais.' })}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {RESOURCES_CATALOG.filter(r => r.category === 'fundraising' || r.category === 'finance').slice(0, 3).map(r => (
                  <ResourceCard key={r.id} r={r} favs={favs} onToggleFav={handleToggleFav} lang={lang} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {firstWsId && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/workspace/${firstWsId}?tab=templates`}>{t('resources.actions.openTemplates', { defaultValue: 'Ver templates' })} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to="/documents">{t('resources.actions.openRepository', { defaultValue: 'Abrir repositório' })} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
              </div>
            </SectionCard>

            {/* 4. Playbooks */}
            <SectionCard
              icon={BookOpen}
              title={t('resources.sections.playbooks', { defaultValue: 'Playbooks' })}
              desc={t('resources.sections.playbooksDesc', { defaultValue: 'Guias processuais passo a passo para cada fase da sua startup.' })}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {RESOURCES_CATALOG.filter(r => r.category === 'product' || r.category === 'gtm').slice(0, 3).map(r => (
                  <ResourceCard key={r.id} r={r} favs={favs} onToggleFav={handleToggleFav} lang={lang} />
                ))}
              </div>
              {firstWsId && (
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/workspace/${firstWsId}?tab=playbooks`}>{t('resources.actions.openPlaybooks', { defaultValue: 'Abrir playbooks' })} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                  </Button>
                </div>
              )}
            </SectionCard>

            {/* 5. Learn */}
            <SectionCard
              icon={GraduationCap}
              title={t('resources.sections.learn', { defaultValue: 'Aprender' })}
              desc={t('resources.sections.learnDesc', { defaultValue: 'Glossário, FAQs e recursos externos essenciais para crescer.' })}
            >
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-primary" />
                  {lang === 'pt' ? 'Perguntas frequentes' : 'Frequently asked questions'}
                </h3>
                <Accordion type="multiple" className="space-y-1.5">
                  {FAQ_ITEMS.slice(0, 4).map(f => (
                    <AccordionItem key={f.id} value={f.id} className="border rounded-lg px-4">
                      <AccordionTrigger className="text-sm font-medium hover:no-underline py-2.5">
                        {lang === 'pt' ? f.q_pt : f.q_en}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                        {lang === 'pt' ? f.a_pt : f.a_en}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {RESOURCES_CATALOG.filter(r => r.type === 'external').slice(0, 3).map(r => (
                  <ResourceCard key={r.id} r={r} favs={favs} onToggleFav={handleToggleFav} lang={lang} />
                ))}
              </div>
              <div className="mt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/help">{t('resources.actions.openGlossary', { defaultValue: 'Abrir Glossário & FAQ' })} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ── Reusable section wrapper ──
function SectionCard({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-1">
        <Icon className="h-4.5 w-4.5 text-primary shrink-0" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{desc}</p>
      {children}
    </section>
  );
}
