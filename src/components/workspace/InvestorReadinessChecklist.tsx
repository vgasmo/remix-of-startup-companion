import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Circle, FileText, Send, Link, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useDocuments } from '@/hooks/useDocuments';
import { useInvestorUpdates } from '@/hooks/useInvestorUpdates';
import { useDataroomShareLinks } from '@/hooks/useDataroom';
import { useDataroom } from '@/hooks/useDataroom';
import { cn } from '@/lib/utils';

interface InvestorReadinessChecklistProps {
  workspaceId: string;
  canWrite: boolean;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  icon: React.ReactNode;
  action: () => void;
  actionLabel: string;
}

export function InvestorReadinessChecklist({ workspaceId, canWrite }: InvestorReadinessChecklistProps) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const { data: documents } = useDocuments(workspaceId);
  const { data: updates } = useInvestorUpdates(workspaceId);
  const { data: dataroom } = useDataroom(workspaceId);
  const { data: shareLinks } = useDataroomShareLinks(dataroom?.id);

  const checklistItems = useMemo<ChecklistItem[]>(() => {
    const hasPitchDeck = documents?.some(d => 
      d.category?.toLowerCase().includes('pitch') || 
      d.name.toLowerCase().includes('pitch') ||
      d.name.toLowerCase().includes('deck')
    ) || false;

    const hasRecentUpdate = updates?.some(u => {
      const updateDate = new Date(u.month);
      const now = new Date();
      const monthsAgo = (now.getFullYear() - updateDate.getFullYear()) * 12 + (now.getMonth() - updateDate.getMonth());
      return monthsAgo <= 2;
    }) || false;

    const hasActiveShareLink = shareLinks?.some(link => 
      !link.revoked_at && (!link.expires_at || new Date(link.expires_at) > new Date())
    ) || false;

    return [
      {
        id: 'pitch-deck',
        title: t('investorReadiness.pitchDeck'),
        description: t('investorReadiness.pitchDeckDesc'),
        completed: hasPitchDeck,
        icon: <FileText className="h-4 w-4" />,
        action: () => setSearchParams({ tab: 'documents' }),
        actionLabel: t('investorReadiness.uploadDeck'),
      },
      {
        id: 'investor-update',
        title: t('investorReadiness.investorUpdate'),
        description: t('investorReadiness.investorUpdateDesc'),
        completed: hasRecentUpdate,
        icon: <Send className="h-4 w-4" />,
        action: () => setSearchParams({ tab: 'dataroom' }),
        actionLabel: t('investorReadiness.createUpdate'),
      },
      {
        id: 'dataroom-link',
        title: t('investorReadiness.dataroomLink'),
        description: t('investorReadiness.dataroomLinkDesc'),
        completed: hasActiveShareLink,
        icon: <Link className="h-4 w-4" />,
        action: () => setSearchParams({ tab: 'dataroom' }),
        actionLabel: t('investorReadiness.createLink'),
      },
    ];
  }, [documents, updates, dataroom, setSearchParams, t]);

  const completedCount = checklistItems.filter(item => item.completed).length;
  const progress = (completedCount / checklistItems.length) * 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {t('investorReadiness.title')}
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{checklistItems.length}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {checklistItems.map(item => (
          <div 
            key={item.id}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              item.completed 
                ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/50 " 
                : "border-border bg-muted/30"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                item.completed 
                  ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] "
                  : "bg-muted text-muted-foreground"
              )}>
                {item.completed ? <CheckCircle2 className="h-4 w-4" /> : item.icon}
              </div>
              <div>
                <p className={cn("text-sm font-medium", item.completed && "line-through text-muted-foreground")}>
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
            {canWrite && !item.completed && (
              <Button variant="ghost" size="sm" onClick={item.action} className="gap-1">
                {item.actionLabel}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
