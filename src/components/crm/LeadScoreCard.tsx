import { useTranslation } from 'react-i18next';
import {
  Flame,
  ThermometerSun,
  Snowflake,
  TrendingUp,
  Clock,
  Mail,
  Building2,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { ReadinessCard, type ReadinessItem, type ReadinessTone } from '@/components/shared/ReadinessCard';

interface LeadScoreProps {
  item: {
    id: string;
    stage: string;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    organization_name?: string | null;
    next_action_at?: string | null;
    last_activity_at?: string | null;
    created_at: string;
    source?: string | null;
    notes?: string | null;
  };
  compact?: boolean;
}

interface ScoreBreakdown {
  category: string;
  score: number;
  maxScore: number;
  details: string;
}

export function calculateLeadScore(item: LeadScoreProps['item']): {
  totalScore: number;
  temperature: 'hot' | 'warm' | 'cold';
  breakdown: ScoreBreakdown[];
} {
  const breakdown: ScoreBreakdown[] = [];
  const now = new Date();

  let contactScore = 0;
  if (item.contact_name) contactScore += 8;
  if (item.contact_email) contactScore += 10;
  if (item.contact_phone) contactScore += 7;
  breakdown.push({
    category: 'Contact Data',
    score: contactScore,
    maxScore: 25,
    details: `${[item.contact_name && 'Name', item.contact_email && 'Email', item.contact_phone && 'Phone']
      .filter(Boolean)
      .join(', ') || 'None'}`,
  });

  let orgScore = 0;
  if (item.organization_name) orgScore += 15;
  breakdown.push({
    category: 'Organization',
    score: orgScore,
    maxScore: 15,
    details: item.organization_name || 'Not provided',
  });

  let engagementScore = 0;
  if (item.last_activity_at) {
    const daysSinceActivity = differenceInDays(now, new Date(item.last_activity_at));
    if (daysSinceActivity <= 3) engagementScore = 30;
    else if (daysSinceActivity <= 7) engagementScore = 25;
    else if (daysSinceActivity <= 14) engagementScore = 15;
    else if (daysSinceActivity <= 30) engagementScore = 5;
  }
  breakdown.push({
    category: 'Engagement',
    score: engagementScore,
    maxScore: 30,
    details: item.last_activity_at
      ? `${differenceInDays(now, new Date(item.last_activity_at))} days ago`
      : 'No activity',
  });

  let stageScore = 0;
  const stageScores: Record<string, number> = {
    new: 5,
    first_contact_booked: 10,
    met: 12,
    qualified: 15,
    proposal_sent: 17,
    negotiating: 19,
    contracted: 20,
  };
  stageScore = stageScores[item.stage] || 0;
  breakdown.push({
    category: 'Pipeline Stage',
    score: stageScore,
    maxScore: 20,
    details: item.stage.replace(/_/g, ' '),
  });

  let actionScore = 0;
  if (item.next_action_at) {
    const daysUntilAction = differenceInDays(new Date(item.next_action_at), now);
    if (daysUntilAction >= 0 && daysUntilAction <= 7) actionScore = 10;
    else if (daysUntilAction < 0 && daysUntilAction >= -3) actionScore = 5;
    else if (daysUntilAction > 7) actionScore = 7;
  }
  breakdown.push({
    category: 'Next Action',
    score: actionScore,
    maxScore: 10,
    details: item.next_action_at
      ? `Scheduled ${differenceInDays(new Date(item.next_action_at), now)} days`
      : 'None planned',
  });

  const totalScore = breakdown.reduce((sum, b) => sum + b.score, 0);

  let temperature: 'hot' | 'warm' | 'cold' = 'cold';
  if (totalScore >= 70) temperature = 'hot';
  else if (totalScore >= 40) temperature = 'warm';

  return { totalScore, temperature, breakdown };
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Contact Data': Mail,
  Organization: Building2,
  Engagement: Clock,
  'Pipeline Stage': TrendingUp,
  'Next Action': CheckCircle,
};

export function LeadScoreCard({ item, compact = false }: LeadScoreProps) {
  const { t } = useTranslation();
  const { totalScore, temperature, breakdown } = calculateLeadScore(item);

  const tempConfig: Record<'hot' | 'warm' | 'cold', {
    icon: LucideIcon;
    tone: ReadinessTone;
    label: string;
    description: string;
  }> = {
    hot: {
      icon: Flame,
      tone: 'warning',
      label: t('crm.leadScore.hot', 'Hot Lead'),
      description: t('crm.leadScore.hotDesc', 'High engagement, ready to progress'),
    },
    warm: {
      icon: ThermometerSun,
      tone: 'warning',
      label: t('crm.leadScore.warm', 'Warm Lead'),
      description: t('crm.leadScore.warmDesc', 'Good potential, needs nurturing'),
    },
    cold: {
      icon: Snowflake,
      tone: 'info',
      label: t('crm.leadScore.cold', 'Cold Lead'),
      description: t('crm.leadScore.coldDesc', 'Needs re-engagement or qualification'),
    },
  };
  const config = tempConfig[temperature];
  const Icon = config.icon;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'h-8 w-8 rounded-full flex items-center justify-center',
            temperature === 'cold' ? 'bg-[hsl(var(--info))]/10' : 'bg-[hsl(var(--warning))]/10',
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              temperature === 'cold' ? 'text-[hsl(var(--info))]' : 'text-[hsl(var(--warning))]',
            )}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold tabular-nums">{totalScore}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                temperature === 'cold' ? 'text-[hsl(var(--info))]' : 'text-[hsl(var(--warning))]',
              )}
            >
              {config.label}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  const items: ReadinessItem[] = breakdown.map((b) => ({
    key: b.category,
    label: b.category,
    score: b.score,
    maxScore: b.maxScore,
    detail: b.details,
    icon: CATEGORY_ICONS[b.category],
  }));

  return (
    <ReadinessCard
      titleIcon={TrendingUp}
      title={t('crm.leadScore.title', 'Prontidão de Engajamento')}
      items={items}
      score={totalScore}
      maxScore={100}
      statusLabel={config.label}
      statusDescription={config.description}
      statusIcon={Icon}
      statusTone={config.tone}
    />
  );
}
