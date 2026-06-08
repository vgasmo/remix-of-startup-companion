import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, HelpCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDocuments } from '@/hooks/useDocuments';
import { useInvestorUpdates } from '@/hooks/useInvestorUpdates';
import { useDataroomShareLinks, useDataroom } from '@/hooks/useDataroom';


interface InvestorReadinessWidgetProps {
  workspaceId: string;
  compact?: boolean;
}

export function InvestorReadinessWidget({ workspaceId, compact = false }: InvestorReadinessWidgetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const { data: documents } = useDocuments(workspaceId);
  const { data: updates } = useInvestorUpdates(workspaceId);
  const { data: dataroom } = useDataroom(workspaceId);
  const { data: shareLinks } = useDataroomShareLinks(dataroom?.id);

  const { progress, nextStep, completedItems, totalItems } = useMemo(() => {
    let completed = 0;
    const total = 3;
    let next: { label: string; tab: string } | null = null;

    // Check for pitch deck
    const hasPitchDeck = documents?.some(d =>
      d.category?.toLowerCase().includes('pitch') ||
      d.name.toLowerCase().includes('pitch') ||
      d.name.toLowerCase().includes('deck')
    ) || false;
    
    if (hasPitchDeck) {
      completed++;
    } else if (!next) {
      next = { label: t('investorReadiness.uploadDeck'), tab: 'documents' };
    }

    // Check for recent investor update
    const hasRecentUpdate = updates?.some(u => {
      const updateDate = new Date(u.month);
      const now = new Date();
      const monthsAgo = (now.getFullYear() - updateDate.getFullYear()) * 12 + (now.getMonth() - updateDate.getMonth());
      return monthsAgo <= 2;
    }) || false;

    if (hasRecentUpdate) {
      completed++;
    } else if (!next) {
      next = { label: t('investorReadiness.createUpdate'), tab: 'dataroom' };
    }

    // Check for active share link
    const hasActiveShareLink = shareLinks?.some(link =>
      !link.revoked_at && (!link.expires_at || new Date(link.expires_at) > new Date())
    ) || false;

    if (hasActiveShareLink) {
      completed++;
    } else if (!next) {
      next = { label: t('investorReadiness.createLink'), tab: 'dataroom' };
    }

    return {
      progress: (completed / total) * 100,
      nextStep: next,
      completedItems: completed,
      totalItems: total,
    };
  }, [documents, updates, shareLinks, t]);

  // Empty: no investor-readiness signals at all
  if (completedItems === 0 && !compact) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={t('investorReadiness.emptyTitle', { defaultValue: 'Preparação para investidores' })}
        description={t('investorReadiness.emptyDesc', { defaultValue: 'Complete o checklist de investor readiness para ver a sua pontuação aqui.' })}
        action={{
          label: t('investorReadiness.viewChecklist', { defaultValue: 'Ver checklist' }),
          onClick: () => navigate(`/workspace/${workspaceId}?tab=documents`),
          icon: ChevronRight,
        }}
        variant="inline"
      />
    );
  }

  // Compact mode - single line
  if (compact) {

    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t('investorReadiness.title')}</span>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Progress value={progress} className="h-1.5 flex-1 max-w-[80px]" />
          <span className="text-xs text-muted-foreground">{completedItems}/{totalItems}</span>
        </div>
        {nextStep && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs h-6 px-2"
            onClick={() => navigate(`/workspace/${workspaceId}?tab=${nextStep.tab}`)}
          >
            {nextStep.label}
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    );
  }

  // P0: Collapsible by default for less above-fold clutter
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border bg-muted/30">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">{t('investorReadiness.title')}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">{t('investorReadiness.whyMatters')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Progress value={progress} className="h-1.5 w-16" />
                <span className="text-sm font-medium text-primary">{completedItems}/{totalItems}</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t">
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {t('investorReadiness.itemsComplete')}
              </p>
              {nextStep && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="text-xs h-auto p-0"
                  onClick={() => navigate(`/workspace/${workspaceId}?tab=${nextStep.tab}`)}
                >
                  {nextStep.label}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}