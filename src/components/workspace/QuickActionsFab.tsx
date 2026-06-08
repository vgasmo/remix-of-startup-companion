import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Calendar, CheckSquare, MessageSquare, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface QuickActionsFabProps {
  onUpdateKpis: () => void;
  onAddAction: () => void;
  onScheduleSession: () => void;
  onCompleteCheckin?: () => void;
  className?: string;
}

export function QuickActionsFab({
  onUpdateKpis,
  onAddAction,
  onScheduleSession,
  onCompleteCheckin,
  className,
}: QuickActionsFabProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const actions: QuickAction[] = [
    { id: 'kpis', label: t('fab.updateKpis', 'Update KPIs'), icon: <BarChart3 className="h-4 w-4" />, onClick: onUpdateKpis },
    { id: 'action', label: t('fab.newAction', 'New Action'), icon: <CheckSquare className="h-4 w-4" />, onClick: onAddAction },
    { id: 'session', label: t('fab.scheduleSession', 'Schedule Session'), icon: <Calendar className="h-4 w-4" />, onClick: onScheduleSession },
  ];

  if (onCompleteCheckin) {
    actions.push({ id: 'weeklyWins', label: t('fab.weeklyWins', 'Weekly Wins'), icon: <MessageSquare className="h-4 w-4" />, onClick: onCompleteCheckin });
  }

  const handleActionClick = (action: QuickAction) => {
    action.onClick();
    setIsOpen(false);
  };

  return (
    <div className={cn("fixed right-4 z-40 md:hidden bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]", className)}>
      {/* Action buttons */}
      <div className={cn(
        "flex flex-col-reverse gap-1.5 mb-2 transition-all duration-150",
        isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
      )}>
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="secondary"
            size="sm"
            className="shadow-md flex items-center gap-2 justify-start pl-3 pr-4 h-11 text-sm"
            onClick={() => handleActionClick(action)}
          >

            {action.icon}
            <span>{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Main FAB button - smaller, less dominant */}
      <Button
        size="icon"
        className={cn(
          "h-11 w-11 rounded-full shadow-lg transition-transform",
          isOpen && "rotate-45"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
