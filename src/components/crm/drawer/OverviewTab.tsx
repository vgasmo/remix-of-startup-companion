import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Clock, X, Plus, DollarSign, CalendarDays, TrendingUp, Tag, Briefcase, Calendar, FileText, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FunnelItem, FunnelStage, useUpdateFunnelItem } from '@/hooks/useFunnel';
import { LeadScoreCard } from '@/components/crm/LeadScoreCard';
import { getFunnelStageLabel } from '@/lib/stageLabels';
import { formatRelativeTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { STAGE_COLORS } from './RecordDrawerHeader';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from "@/lib/notify";
import { useIncubationTypes } from '@/hooks/backoffice/useIncubationTypes';

interface OverviewTabProps {
  item: FunnelItem;
  nextActionAt: string | null;
  nextActionDescription: string | null;
  lastActivityAt: string | null;
  onSetNextAction: () => void;
  onClearNextAction: () => void;
  isClearingNextAction: boolean;
}

const DEFAULT_WIN_PROBABILITY: Record<string, number> = {
  new: 5, first_contact_booked: 10, met: 20, qualified: 40,
  proposal_sent: 60, negotiating: 75, contracted: 95,
};

export function OverviewTab({
  item,
  nextActionAt,
  nextActionDescription,
  lastActivityAt,
  onSetNextAction,
  onClearNextAction,
  isClearingNextAction,
}: OverviewTabProps) {
  const { t } = useTranslation();
  const stageColor = STAGE_COLORS[item.stage];
  const stageLabel = getFunnelStageLabel(t, item.stage);
  const updateItem = useUpdateFunnelItem();
  const { data: incubationTypes } = useIncubationTypes();

  const [editingDeal, setEditingDeal] = useState(false);
  const [dealValue, setDealValue] = useState(item.deal_value?.toString() || '');
  const [dealCurrency, setDealCurrency] = useState(item.deal_currency || 'EUR');
  const [expectedClose, setExpectedClose] = useState(item.expected_close_date || '');
  const [winProb, setWinProb] = useState(
    (item.win_probability ?? DEFAULT_WIN_PROBABILITY[item.stage] ?? 0).toString()
  );
  const [proposedFee, setProposedFee] = useState('');
  const [proposedDiscount, setProposedDiscount] = useState('');
  const [proposedIncubationTypeId, setProposedIncubationTypeId] = useState('');
  const [commercialNotes, setCommercialNotes] = useState('');

  useEffect(() => {
    const metadata = ((item as any).metadata_json && typeof (item as any).metadata_json === 'object')
      ? (item as any).metadata_json
      : {};

    setProposedFee(metadata?.proposed_fee != null ? String(metadata.proposed_fee) : '');
    setProposedDiscount(metadata?.proposed_discount != null ? String(metadata.proposed_discount) : '');
    setProposedIncubationTypeId(typeof metadata?.proposed_incubation_type_id === 'string' ? metadata.proposed_incubation_type_id : '');
    setCommercialNotes(typeof metadata?.commercial_notes === 'string' ? metadata.commercial_notes : '');
  }, [item.id]);

  const handleSaveDeal = () => {
    updateItem.mutate({
      id: item.id,
      deal_value: dealValue ? parseFloat(dealValue) : null,
      deal_currency: dealCurrency,
      expected_close_date: expectedClose || null,
      win_probability: winProb ? parseInt(winProb) : null,
    } as any);
    setEditingDeal(false);
  };

  const handleSaveCommercialProposal = () => {
    const baseMetadata = ((item as any).metadata_json && typeof (item as any).metadata_json === 'object')
      ? (item as any).metadata_json
      : {};

    const nextMetadata = {
      ...baseMetadata,
      proposed_fee: proposedFee === '' ? null : Number(proposedFee),
      proposed_discount: proposedDiscount === '' ? null : Number(proposedDiscount),
      proposed_incubation_type_id: proposedIncubationTypeId || null,
      commercial_notes: commercialNotes.trim() || null,
    };

    updateItem.mutate({
      id: item.id,
      metadata_json: nextMetadata,
    } as any);
  };

  const weightedValue = (item.deal_value || 0) * ((item.win_probability ?? DEFAULT_WIN_PROBABILITY[item.stage] ?? 0) / 100);

  return (
    <div className="space-y-4">
      {/* Deal Value Card */}
      <Card className="border-primary/20">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              {t('crm.dealValue', { defaultValue: 'Valor do Deal' })}
            </span>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingDeal(!editingDeal)}>
              {editingDeal ? t('common.cancel') : t('common.edit', { defaultValue: 'Editar' })}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {editingDeal ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t('crm.value', { defaultValue: 'Valor' })}</Label>
                  <Input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="0" className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('crm.currency', { defaultValue: 'Moeda' })}</Label>
                  <Select value={dealCurrency} onValueChange={setDealCurrency}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR €</SelectItem>
                      <SelectItem value="USD">USD $</SelectItem>
                      <SelectItem value="GBP">GBP £</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t('crm.expectedClose', { defaultValue: 'Fecho previsto' })}</Label>
                  <Input type="date" value={expectedClose} onChange={e => setExpectedClose(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('crm.winProbability', { defaultValue: 'Probabilidade (%)' })}</Label>
                  <Input type="number" min="0" max="100" value={winProb} onChange={e => setWinProb(e.target.value)} className="h-8" />
                </div>
              </div>
              <Button size="sm" className="w-full h-7 text-xs" onClick={handleSaveDeal} disabled={updateItem.isPending} loading={updateItem.isPending}>
                {t('common.save')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {item.deal_value ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">
                      {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: item.deal_currency || 'EUR' }).format(item.deal_value)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {t('crm.weighted', { defaultValue: 'Ponderado' })}: {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: item.deal_currency || 'EUR' }).format(weightedValue)}
                    </span>
                    <span>{item.win_probability ?? DEFAULT_WIN_PROBABILITY[item.stage] ?? 0}%</span>
                  </div>
                  {item.expected_close_date && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {t('crm.closeBy', { defaultValue: 'Fecho' })}: {new Date(item.expected_close_date).toLocaleDateString('pt-PT')}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('crm.noDealValue', { defaultValue: 'Sem valor atribuído — clique Editar' })}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Action Card */}
      <Card className={cn(
        nextActionAt && new Date(nextActionAt) < new Date() && 'border-warning/50 bg-warning/5'
      )}>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            {t('crm.nextAction')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {nextActionAt ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className={cn(
                  'h-4 w-4',
                  new Date(nextActionAt) < new Date() ? 'text-warning' : 'text-muted-foreground'
                )} />
                <span className={cn(
                  'text-sm',
                  new Date(nextActionAt) < new Date() && 'text-warning font-medium'
                )}>
                  {formatRelativeTime(nextActionAt)}
                </span>
              </div>
              {nextActionDescription && (
                <p className="text-sm text-muted-foreground">{nextActionDescription}</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSetNextAction} data-testid="next-action-open">
                  {t('crm.updateNextAction')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={onClearNextAction}
                  disabled={isClearingNextAction}
                >
                  <X className="h-3 w-3 mr-1" />
                  {t('crm.clearNextAction')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('crm.noNextActionSet')}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSetNextAction} data-testid="next-action-open">
                <Plus className="h-3 w-3 mr-1" />
                {t('crm.setNextAction')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead Score */}
      <LeadScoreCard
        item={{
          id: item.id,
          stage: item.stage,
          contact_name: item.contact_name,
          contact_email: item.contact_email,
          contact_phone: item.contact_phone,
          organization_name: item.organization_name,
          next_action_at: nextActionAt,
          last_activity_at: lastActivityAt,
          created_at: item.created_at,
          source: item.source,
          notes: item.notes,
        }}
      />

      {/* Startup Category */}
      {item.linked_workspace_id && (
        <StartupCategorySelector workspaceId={item.linked_workspace_id} />
      )}

      {/* Details */}
      <div className="grid gap-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('crm.stage')}</span>
          <Badge className={cn(stageColor, 'text-white')}>{stageLabel}</Badge>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('crm.owner')}</span>
          <span>{item.owner?.full_name || t('crm.unassigned')}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('crm.created')}</span>
          <span>{formatRelativeTime(item.created_at)}</span>
        </div>
        {item.source && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('crm.source')}</span>
            <span>{item.source}</span>
          </div>
        )}
        {item.contact_phone && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('crm.phone')}</span>
            <span>{item.contact_phone}</span>
          </div>
        )}
      </div>

      {/* Commercial Proposal Section */}
      <div className="space-y-3 pt-4 border-t">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          {t('crm.commercialProposal', { defaultValue: 'Proposta Comercial' })}
        </h4>
        
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">{t('crm.proposedIncubationType', { defaultValue: 'Tipo de Incubação Proposto' })}</Label>
            <Select
              value={proposedIncubationTypeId || '__none__'}
              onValueChange={(value) => setProposedIncubationTypeId(value === '__none__' ? '' : value)}
            >
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder={t('crm.selectIncubationType', { defaultValue: 'Selecionar tipo' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('common.none', { defaultValue: 'Nenhum' })}</SelectItem>
                {(incubationTypes || [])
                  .filter(type => type.is_active)
                  .map(type => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('crm.proposedMonthlyFee', { defaultValue: 'Mensalidade Proposta (€)' })}</Label>
            <Input 
              type="number" 
              className="w-32 h-8 text-xs" 
              value={proposedFee}
              onChange={(e) => setProposedFee(e.target.value)}
              placeholder="0"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('crm.proposedDiscount', { defaultValue: 'Desconto Proposto (%)' })}</Label>
            <Input 
              type="number" 
              className="w-24 h-8 text-xs" 
              min="0" max="100"
              value={proposedDiscount}
              onChange={(e) => setProposedDiscount(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">{t('crm.commercialNotes', { defaultValue: 'Notas Comerciais' })}</Label>
            <Textarea 
              className="mt-1 text-xs" 
              rows={2}
              value={commercialNotes}
              onChange={(e) => setCommercialNotes(e.target.value)}
              placeholder={t('crm.commercialNotesPlaceholder', { defaultValue: 'Tipo de contrato, condições especiais...' })}
            />
          </div>

          <Button
            size="sm"
            className="w-full h-8 text-xs"
            onClick={handleSaveCommercialProposal}
            disabled={updateItem.isPending} loading={updateItem.isPending}
          >
            {t('crm.saveCommercialProposal', { defaultValue: 'Guardar proposta comercial' })}
          </Button>
        </div>
      </div>

      {/* Booking Questionnaire Data */}
      <BookingQuestionnaireSection item={item} />

      {item.notes && (
        <div className="pt-3 border-t">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">{t('crm.notes')}</p>
          <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}
    </div>
  );
}

const VERTICAL_LABELS: Record<string, string> = {
  cybersecurity: 'Cybersecurity',
  engineering: 'Engineering',
  deeptech: 'DeepTech',
  planettech: 'PlanetTech',
  ai: 'AI',
  healthtech: 'HealthTech',
  fintech: 'FinTech',
  edtech: 'EdTech',
  saas: 'SaaS',
  ecommerce: 'E-commerce',
  social_impact: 'Impacto Social',
  other: 'Outro',
};

const STAGE_LABELS_BOOKING: Record<string, string> = {
  ideation: 'Ideação',
  validation: 'Validação',
  idea: 'Ideia / Conceito',
  mvp: 'MVP / Protótipo',
  early_revenue: 'Early Revenue',
  growth: 'Growth / Escala',
  scale: 'Escala',
};

const REFERRAL_LABELS: Record<string, string> = {
  referral: 'Recomendação',
  event: 'Evento',
  social_media: 'Redes Sociais',
  website: 'Website',
  press: 'Imprensa / Media',
  other: 'Outro',
};

const YES_NO_LABELS: Record<string, string> = {
  yes: 'Sim',
  no: 'Não',
  unsure: 'Não tenho a certeza',
  forming: 'Em formação',
};

function BookingQuestionnaireSection({ item }: { item: FunnelItem }) {
  const { t } = useTranslation();
  const metadata = ((item as any).metadata_json && typeof (item as any).metadata_json === 'object')
    ? (item as any).metadata_json
    : {};

  const isPublicForm = metadata.booking_source === 'public_form'
    || item.source === 'public_booking'
    || metadata.sector || metadata.startup_stage || metadata.vertical
    || metadata.help_expectation || metadata.personal_intro
    || metadata.has_tech || metadata.is_iies;

  if (!isPublicForm) return null;

  const renderRow = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[1fr,2fr] gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground break-words">{value}</span>
    </div>
  );

  const renderTextBlock = (label: string, value: string) => (
    <div className="space-y-1 py-2 border-b border-border/40 last:border-0">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm whitespace-pre-wrap text-foreground">{value}</p>
    </div>
  );

  return (
    <div className="space-y-1 pt-3 border-t">
      <p className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5" />
        {t('crm.bookingQuestionnaire', { defaultValue: 'Questionário de Primeiro Contacto' })}
      </p>
      <div className="grid gap-0.5">
        {item.notes && renderTextBlock(
          t('publicBooking.q1ProjectDescription', { defaultValue: 'Descrição breve do projeto' }),
          item.notes,
        )}
        {item.organization_name && renderRow(
          t('publicBooking.q2ProjectName', { defaultValue: 'Nome do projeto' }),
          item.organization_name,
        )}
        {metadata.has_tech && renderRow(
          t('publicBooking.q3HasTech', { defaultValue: 'Componente tecnológica' }),
          YES_NO_LABELS[metadata.has_tech] || metadata.has_tech,
        )}
        {metadata.is_iies && renderRow(
          t('publicBooking.q4IsIies', { defaultValue: 'IIES' }),
          YES_NO_LABELS[metadata.is_iies] || metadata.is_iies,
        )}
        {metadata.vertical && renderRow(
          t('publicBooking.q5Vertical', { defaultValue: 'Vertical' }),
          VERTICAL_LABELS[metadata.vertical] || metadata.vertical,
        )}
        {metadata.startup_stage && renderRow(
          t('publicBooking.q6Stage', { defaultValue: 'Fase do projeto' }),
          STAGE_LABELS_BOOKING[metadata.startup_stage] || metadata.startup_stage,
        )}
        {metadata.help_expectation && renderTextBlock(
          t('publicBooking.q7HelpExpectation', { defaultValue: 'Como podemos ajudar' }),
          metadata.help_expectation,
        )}
        {metadata.personal_intro && renderTextBlock(
          t('publicBooking.q8PersonalIntro', { defaultValue: 'Apresentação pessoal' }),
          metadata.personal_intro,
        )}
        {metadata.referral_source && renderRow(
          t('publicBooking.q9ReferralSource', { defaultValue: 'Como nos conheceu' }),
          REFERRAL_LABELS[metadata.referral_source] || metadata.referral_source,
        )}
        {metadata.sector && renderRow(
          t('publicBooking.sector', { defaultValue: 'Setor' }),
          metadata.sector,
        )}
        {metadata.has_team && renderRow(
          t('publicBooking.hasTeam', { defaultValue: 'Tem equipa' }),
          YES_NO_LABELS[metadata.has_team] || metadata.has_team,
        )}
        {metadata.booking_date && renderRow(
          t('crm.meetingDate', { defaultValue: 'Data da reunião' }),
          new Date(metadata.booking_date).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }),
        )}
        {metadata.pitch_deck_path && (
          <div className="flex justify-between text-sm items-center pt-2">
            <span className="text-muted-foreground flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {t('publicBooking.pitchDeck', { defaultValue: 'Pitch Deck' })}
            </span>
            <PitchDeckLink path={metadata.pitch_deck_path} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}

function PitchDeckLink({ path, t }: { path: string; t: (key: string, opts?: any) => string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage.from('booking-uploads').createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);

  if (!url) return <span className="text-xs text-muted-foreground">…</span>;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs font-medium">
      <ExternalLink className="h-3 w-3" />
      {t('common.download', { defaultValue: 'Download' })}
    </a>
  );
}

const CATEGORIES = [
  { value: 'A', label: 'A — Alto Potencial', color: 'text-[hsl(var(--success))]' },
  { value: 'B', label: 'B — Médio Potencial', color: 'text-[hsl(var(--info))]' },
  { value: 'C', label: 'C — Baixo Potencial', color: 'text-[hsl(var(--warning))]' },
] as const;

function StartupCategorySelector({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('workspaces')
      .select('startup_category')
      .eq('id', workspaceId)
      .maybeSingle()
      .then(({ data }) => {
        setCurrentCategory(data?.startup_category || null);
        setLoading(false);
      });
  }, [workspaceId]);

  const handleChange = async (value: string) => {
    const newValue = value === 'none' ? null : value;
    setCurrentCategory(newValue);
    const { error } = await supabase
      .from('workspaces')
      .update({ startup_category: newValue })
      .eq('id', workspaceId);
    if (error) {
      notify.error(t('common.error'));
    } else {
      notify.success(t('crm.categoryUpdated', { defaultValue: 'Categoria atualizada' }));
      queryClient.invalidateQueries({ queryKey: ['ecosystem-items'] });
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('crm.startupCategory', { defaultValue: 'Categoria' })}</span>
          </div>
          <div className="flex items-center gap-2">
            {currentCategory && <CategoryBadge category={currentCategory} />}
            <Select value={currentCategory || 'none'} onValueChange={handleChange}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder={t('crm.selectCategory', { defaultValue: 'Definir categoria' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('crm.noCategory', { defaultValue: 'Sem categoria' })}</SelectItem>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className={c.color}>{c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
