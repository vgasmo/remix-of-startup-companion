import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Rocket, 
  X, 
  TrendingUp, 
  Target, 
  Users, 
  FileText,
  CheckCircle2,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';


interface FounderWelcomePanelProps {
  hasStartup: boolean;
  hasProfile: boolean;
  hasKpis: boolean;
  hasMentor: boolean;
  hasDocuments: boolean;
  onCreateStartup: () => void;
  workspaceId?: string;
  userId?: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  action: () => void;
  actionLabel: string;
  icon: React.ReactNode;
}

const CHECKLIST_DISMISSED_KEY = 'founder_checklist_dismissed';
const WELCOME_DISMISSED_KEY = 'founder_welcome_dismissed';

// Scope localStorage keys to user to avoid cross-user collision
function scopedKey(base: string, userId?: string) {
  return userId ? `${base}_${userId}` : base;
}

export function FounderWelcomePanel({
  hasStartup,
  hasProfile,
  hasKpis,
  hasMentor,
  hasDocuments,
  onCreateStartup,
  workspaceId,
  userId,
}: FounderWelcomePanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const checklistKey = scopedKey(CHECKLIST_DISMISSED_KEY, userId);
  const welcomeKey = scopedKey(WELCOME_DISMISSED_KEY, userId);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => 
    localStorage.getItem(welcomeKey) === 'true'
  );
  const [checklistDismissed, setChecklistDismissed] = useState(() => 
    localStorage.getItem(checklistKey) === 'true'
  );

  const dismissWelcome = () => {
    localStorage.setItem(welcomeKey, 'true');
    setWelcomeDismissed(true);
  };

  const dismissChecklist = () => {
    localStorage.setItem(checklistKey, 'true');
    setChecklistDismissed(true);
  };

  // P0: Reduced to 3 essential items for less clutter
  const checklistItems: ChecklistItem[] = [
    {
      id: 'startup',
      label: t('onboarding.addStartup', 'Register your startup'),
      description: t('onboarding.addStartupDesc', 'Set up your company to start tracking'),
      completed: hasStartup,
      action: onCreateStartup,
      actionLabel: t('onboarding.createStartup', 'Create'),
      icon: <Rocket className="h-4 w-4" />,
    },
    {
      id: 'kpis',
      label: t('onboarding.setKpis', 'Track your metrics'),
      description: t('onboarding.setKpisDesc', 'Define what matters to your growth'),
      completed: hasKpis,
      // B2 Fix: Navigate with query param to auto-open add dialog
      action: () => workspaceId && navigate(`/workspace/${workspaceId}?tab=kpis&openAddKpis=1`),
      actionLabel: t('onboarding.addKpis', 'Add'),
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      id: 'documents',
      label: t('onboarding.uploadDeck', 'Upload your deck'),
      description: t('onboarding.uploadDeckDesc', 'Share with mentors and investors'),
      completed: hasDocuments,
      // B6 Fix: Navigate with query param to auto-open upload with Pitch Deck selected
      action: () => workspaceId && navigate(`/workspace/${workspaceId}?tab=documents&upload=pitch_deck`),
      actionLabel: t('onboarding.uploadDeck', 'Upload'),
      icon: <FileText className="h-4 w-4" />,
    },
  ];

  const completedCount = checklistItems.filter(item => item.completed).length;
  const progress = (completedCount / checklistItems.length) * 100;
  const allCompleted = completedCount === checklistItems.length;

  // Auto-dismiss checklist when complete
  useEffect(() => {
    if (allCompleted && !checklistDismissed) {
      const timer = setTimeout(() => {
        dismissChecklist();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [allCompleted, checklistDismissed]);

  // Don't show if everything is dismissed or complete
  if (welcomeDismissed && (checklistDismissed || allCompleted)) {
    return null;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Welcome Banner - Shows only on first visit */}
      {!welcomeDismissed && (
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-foreground z-10"
            onClick={dismissWelcome}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardContent className="relative p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="flex-shrink-0">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Sparkles className="h-8 w-8 text-primary-foreground" />
                </div>
              </div>
              <div className="flex-1">
                <h2 className="font-heading text-xl md:text-2xl font-bold text-foreground mb-2">
                  {t('onboarding.welcomeTitle', 'Welcome to your startup journey!')}
                </h2>
                <p className="text-muted-foreground max-w-2xl">
                  {t('onboarding.welcomeDescription', 'This platform helps you track progress, connect with mentors, and prepare for investment. Let\'s get you set up in just a few steps.')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button onClick={hasStartup && workspaceId ? () => navigate(`/workspace/${workspaceId}`) : onCreateStartup} className="gap-2">
                  {hasStartup ? t('onboarding.viewWorkspace', 'View Workspace') : t('onboarding.getStarted', 'Get Started')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => navigate('/mentors')}>
                  {t('onboarding.exploreMentors', 'Explore Mentors')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* P0: Compact Progress Checklist */}
      {!checklistDismissed && !allCompleted && (
        <Card className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={dismissChecklist}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Target className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <span className="font-medium text-sm">
                  {t('onboarding.checklistTitle', 'Getting Started')}
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  {t('onboarding.completedOfTotal', {
                    defaultValue: '{{completed}} de {{total}} concluído',
                    completed: completedCount,
                    total: checklistItems.length,
                  })}
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            
            <div className="space-y-1.5">
              {checklistItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2.5 p-2 rounded-md transition-colors",
                    item.completed 
                      ? "bg-success/10" 
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0",
                    item.completed
                      ? "bg-success text-success-foreground"
                      : "bg-muted-foreground/20 text-muted-foreground"
                  )}>
                    {item.completed ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      item.icon
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium text-sm leading-tight",
                      item.completed && "line-through text-muted-foreground"
                    )}>
                      {item.label}
                    </p>
                  </div>
                  {!item.completed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={item.action}
                      className="text-primary hover:text-primary h-6 px-2 text-xs"
                    >
                      {item.actionLabel}
                      <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Complete Celebration (brief) */}
      {allCompleted && !checklistDismissed && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-success">
                {t('onboarding.allComplete', 'You\'re all set!')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('onboarding.allCompleteDesc', 'Great job completing your setup. You\'re ready to make progress.')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
