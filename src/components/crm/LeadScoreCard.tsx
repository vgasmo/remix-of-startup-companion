import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Flame, 
  ThermometerSun, 
  Snowflake,
  TrendingUp,
  Clock,
  Mail,
  Phone,
  Building2,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';

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
  
  // Contact Completeness (max 25 points)
  let contactScore = 0;
  if (item.contact_name) contactScore += 8;
  if (item.contact_email) contactScore += 10;
  if (item.contact_phone) contactScore += 7;
  breakdown.push({
    category: 'Contact Data',
    score: contactScore,
    maxScore: 25,
    details: `${[item.contact_name && 'Name', item.contact_email && 'Email', item.contact_phone && 'Phone'].filter(Boolean).join(', ') || 'None'}`
  });

  // Organization Info (max 15 points)
  let orgScore = 0;
  if (item.organization_name) orgScore += 15;
  breakdown.push({
    category: 'Organization',
    score: orgScore,
    maxScore: 15,
    details: item.organization_name || 'Not provided'
  });

  // Engagement Recency (max 30 points)
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
      : 'No activity'
  });

  // Pipeline Progress (max 20 points)
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
    details: item.stage.replace(/_/g, ' ')
  });

  // Next Action Planned (max 10 points)
  let actionScore = 0;
  if (item.next_action_at) {
    const daysUntilAction = differenceInDays(new Date(item.next_action_at), now);
    if (daysUntilAction >= 0 && daysUntilAction <= 7) actionScore = 10;
    else if (daysUntilAction < 0 && daysUntilAction >= -3) actionScore = 5; // Slightly overdue
    else if (daysUntilAction > 7) actionScore = 7;
  }
  breakdown.push({
    category: 'Next Action',
    score: actionScore,
    maxScore: 10,
    details: item.next_action_at 
      ? `Scheduled ${differenceInDays(new Date(item.next_action_at), now)} days`
      : 'None planned'
  });

  const totalScore = breakdown.reduce((sum, b) => sum + b.score, 0);
  
  let temperature: 'hot' | 'warm' | 'cold' = 'cold';
  if (totalScore >= 70) temperature = 'hot';
  else if (totalScore >= 40) temperature = 'warm';

  return { totalScore, temperature, breakdown };
}

export function LeadScoreCard({ item, compact = false }: LeadScoreProps) {
  const { t } = useTranslation();
  const { totalScore, temperature, breakdown } = calculateLeadScore(item);

  const getTemperatureConfig = () => {
    switch (temperature) {
      case 'hot':
        return {
          icon: Flame,
          color: 'text-destructive',
          bgColor: 'bg-destructive/10',
          label: t('crm.leadScore.hot', 'Hot Lead'),
          description: t('crm.leadScore.hotDesc', 'High engagement, ready to progress')
        };
      case 'warm':
        return {
          icon: ThermometerSun,
          color: 'text-[hsl(var(--warning))]',
          bgColor: 'bg-[hsl(var(--warning))]/10',
          label: t('crm.leadScore.warm', 'Warm Lead'),
          description: t('crm.leadScore.warmDesc', 'Good potential, needs nurturing')
        };
      default:
        return {
          icon: Snowflake,
          color: 'text-[hsl(var(--info))]',
          bgColor: 'bg-[hsl(var(--info))]/10',
          label: t('crm.leadScore.cold', 'Cold Lead'),
          description: t('crm.leadScore.coldDesc', 'Needs re-engagement or qualification')
        };
    }
  };

  const config = getTemperatureConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', config.bgColor)}>
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{totalScore}</span>
            <Badge variant="outline" className={cn('text-xs', config.color)}>
              {config.label}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {t('crm.leadScore.title', 'Lead Score')}
          </span>
          <div className="flex items-center gap-2">
            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', config.bgColor)}>
              <Icon className={cn('h-4 w-4', config.color)} />
            </div>
            <span className="text-2xl font-bold">{totalScore}</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cn('gap-1', config.color)}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{config.description}</span>
        </div>

        <div className="space-y-3">
          {breakdown.map((item) => (
            <div key={item.category}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  {item.category === 'Contact Data' && <Mail className="h-3 w-3" />}
                  {item.category === 'Organization' && <Building2 className="h-3 w-3" />}
                  {item.category === 'Engagement' && <Clock className="h-3 w-3" />}
                  {item.category === 'Pipeline Stage' && <TrendingUp className="h-3 w-3" />}
                  {item.category === 'Next Action' && <CheckCircle className="h-3 w-3" />}
                  {item.category}
                </span>
                <span className="font-medium">{item.score}/{item.maxScore}</span>
              </div>
              <Progress value={(item.score / item.maxScore) * 100} className="h-1.5" />
              <p className="text-xs text-muted-foreground mt-0.5">{item.details}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
