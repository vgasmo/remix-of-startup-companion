import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  X,
  TrendingUp,
  CheckSquare,
  Calendar,
  Upload,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QuickKpiModal } from '@/components/workspace/QuickKpiModal';

interface MobileQuickActionsProps {
  workspaceId: string;
  programId: string;
  onAddAction: () => void;
  onRequestSession?: () => void;
  className?: string;
}

export function MobileQuickActions({
  workspaceId,
  programId,
  onAddAction,
  onRequestSession,
  className,
}: MobileQuickActionsProps) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [showQuickKpi, setShowQuickKpi] = useState(false);

  const actions = [
    {
      id: 'kpi',
      label: t('quickActions.addKpi'),
      icon: <TrendingUp className="h-4 w-4" />,
      onClick: () => {
        setShowQuickKpi(true);
        setIsOpen(false);
      },
      color: 'bg-[hsl(var(--info))] hover:bg-[hsl(var(--info))]',
    },
    {
      id: 'action',
      label: t('quickActions.addAction'),
      icon: <CheckSquare className="h-4 w-4" />,
      onClick: () => {
        onAddAction();
        setIsOpen(false);
      },
      color: 'bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]',
    },
    {
      id: 'session',
      label: t('quickActions.requestSession'),
      icon: <Calendar className="h-4 w-4" />,
      onClick: () => {
        if (onRequestSession) {
          onRequestSession();
        } else {
          setSearchParams({ tab: 'agenda' });
        }
        setIsOpen(false);
      },
      color: 'bg-primary/10 hover:bg-primary/10',
    },
    {
      id: 'document',
      label: t('quickActions.uploadDocument'),
      icon: <Upload className="h-4 w-4" />,
      onClick: () => {
        setSearchParams({ tab: 'documents', sub: 'dataroom' });
        setIsOpen(false);
      },
      color: 'bg-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]',
    },
  ];

  return (
    <>
      <div className={cn('fixed right-6 z-50 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]', className)}>

        {/* Action buttons */}
        <div
          className={cn(
            'flex flex-col-reverse gap-3 mb-3 transition-all duration-300 ease-out',
            isOpen
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-8 pointer-events-none'
          )}
        >
          {actions.map((action, index) => (
            <div
              key={action.id}
              className="flex items-center gap-2 justify-end animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="bg-background/95 backdrop-blur-sm text-foreground px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg border">
                {action.label}
              </span>
              <Button
                size="icon"
                className={cn(
                  'h-12 w-12 rounded-full shadow-lg text-primary-foreground',
                  action.color
                )}
                onClick={action.onClick}
               aria-label={t('common.moreActions')}>
                {action.icon}
              </Button>
            </div>
          ))}
        </div>

        {/* Main FAB button */}
        <Button
          size="lg"
          className={cn(
            'h-14 w-14 rounded-full shadow-xl transition-all duration-300',
            isOpen ? 'bg-destructive hover:bg-destructive/90 rotate-45' : ''
          )}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </Button>

        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm -z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
        )}

      </div>

      <QuickKpiModal
        open={showQuickKpi}
        onOpenChange={setShowQuickKpi}
        workspaceId={workspaceId}
        programId={programId}
      />
    </>
  );
}
