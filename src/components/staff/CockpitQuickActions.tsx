/**
 * Cockpit Quick Actions - One-click actions for consultors
 * P0.4: Quick actions for daily operations
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Calendar,
  ClipboardList,
  MessageSquare,
  Bell,
  Zap,
  ChevronDown,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { notify } from "@/lib/notify";
import { supabase } from '@/lib/supabaseClient';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { CreateSessionDialog } from '@/components/workspace/sessions/CreateSessionDialog';

interface CockpitQuickActionsProps {
  workspaces: WorkspaceWithDetails[];
  compact?: boolean;
}

export function CockpitQuickActions({ workspaces, compact = false }: CockpitQuickActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showQuickSession, setShowQuickSession] = useState(false);
  const [showQuickAction, setShowQuickAction] = useState(false);
  const [showQuickReminder, setShowQuickReminder] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Quick session form state
  const [sessionWorkspaceId, setSessionWorkspaceId] = useState('');
  // RC13 L1-5: the quick dialog only picks the startup; the full session dialog does the rest
  // (notification, Outlook, Teams, invitation and conflict checks).
  const [createSessionWorkspaceId, setCreateSessionWorkspaceId] = useState<string | null>(null);

  // Quick action form state
  const [actionWorkspaceId, setActionWorkspaceId] = useState('');
  const [actionTitle, setActionTitle] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');

  const handleCreateQuickSession = () => {
    if (!sessionWorkspaceId) {
      notify.error(t('staff.pleaseFillAllFields'));
      return;
    }
    setCreateSessionWorkspaceId(sessionWorkspaceId);
    setShowQuickSession(false);
    resetSessionForm();
  };

  const handleCreateQuickAction = async () => {
    if (!actionWorkspaceId || !actionTitle) {
      notify.error(t('staff.pleaseFillRequiredFields'));
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('action_items')
        .insert({
          workspace_id: actionWorkspaceId,
          title: actionTitle,
          due_date: actionDueDate || null,
          priority: 'medium',
          status: 'pending',
          created_by: user?.id,
        });

      if (error) throw error;
      notify.success(t('staff.actionItemCreated'));
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['work-queue'] });
      queryClient.invalidateQueries({ queryKey: ['action-items', actionWorkspaceId] });
      setShowQuickAction(false);
      resetActionForm();
    } catch (error) {
      notify.error(t('staff.failedToCreateAction'));
    } finally {
      setIsLoading(false);
    }
  };

  const resetSessionForm = () => {
    setSessionWorkspaceId('');
  };

  const resetActionForm = () => {
    setActionWorkspaceId('');
    setActionTitle('');
    setActionDueDate('');
  };

  if (compact) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            {t('quickActions.title')}:
          </span>
          <div className="flex gap-1.5 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuickSession(true)}>
              <Calendar className="h-3.5 w-3.5 mr-1" />
              {t('quickActions.scheduleSession')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuickAction(true)}>
              <ClipboardList className="h-3.5 w-3.5 mr-1" />
              {t('quickActions.addAction')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('/my-workspaces?filter=attention')}>
              <Bell className="h-3.5 w-3.5 mr-1 text-warning" />
              {t('quickActions.viewAlerts')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('/consultor-tools')}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-success" />
              {t('consultorTools.title')}
            </Button>
          </div>
        </div>
        <QuickSessionDialog
          open={showQuickSession}
          onOpenChange={setShowQuickSession}
          workspaces={workspaces}
          sessionWorkspaceId={sessionWorkspaceId}
          setSessionWorkspaceId={setSessionWorkspaceId}
          onSubmit={handleCreateQuickSession}
        />
        {createSessionWorkspaceId && (
          <CreateSessionDialog
            workspaceId={createSessionWorkspaceId}
            open={!!createSessionWorkspaceId}
            onOpenChange={(open) => { if (!open) setCreateSessionWorkspaceId(null); }}
          />
        )}
        <QuickActionDialog
          open={showQuickAction}
          onOpenChange={setShowQuickAction}
          workspaces={workspaces}
          actionWorkspaceId={actionWorkspaceId}
          setActionWorkspaceId={setActionWorkspaceId}
          actionTitle={actionTitle}
          setActionTitle={setActionTitle}
          actionDueDate={actionDueDate}
          setActionDueDate={setActionDueDate}
          isLoading={isLoading}
          onSubmit={handleCreateQuickAction}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          {t('quickActions.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            className="h-auto py-3 flex flex-col gap-1"
            onClick={() => setShowQuickSession(true)}
          >
            <Calendar className="h-5 w-5 text-primary" />
            <span className="text-xs">{t('quickActions.scheduleSession')}</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-3 flex flex-col gap-1"
            onClick={() => setShowQuickAction(true)}
          >
            <ClipboardList className="h-5 w-5 text-primary" />
            <span className="text-xs">{t('quickActions.addAction')}</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-3 flex flex-col gap-1"
            onClick={() => navigate('/my-workspaces?filter=attention')}
          >
            <Bell className="h-5 w-5 text-warning" />
            <span className="text-xs">{t('quickActions.viewAlerts')}</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-3 flex flex-col gap-1"
            onClick={() => navigate('/consultor-tools')}
          >
            <CheckCircle2 className="h-5 w-5 text-success" />
            <span className="text-xs">{t('consultorTools.title')}</span>
          </Button>
        </div>
      </CardContent>

      <QuickSessionDialog
        open={showQuickSession}
        onOpenChange={setShowQuickSession}
        workspaces={workspaces}
        sessionWorkspaceId={sessionWorkspaceId}
        setSessionWorkspaceId={setSessionWorkspaceId}
        onSubmit={handleCreateQuickSession}
      />
      {createSessionWorkspaceId && (
        <CreateSessionDialog
          workspaceId={createSessionWorkspaceId}
          open={!!createSessionWorkspaceId}
          onOpenChange={(open) => { if (!open) setCreateSessionWorkspaceId(null); }}
        />
      )}
      <QuickActionDialog
        open={showQuickAction}
        onOpenChange={setShowQuickAction}
        workspaces={workspaces}
        actionWorkspaceId={actionWorkspaceId}
        setActionWorkspaceId={setActionWorkspaceId}
        actionTitle={actionTitle}
        setActionTitle={setActionTitle}
        actionDueDate={actionDueDate}
        setActionDueDate={setActionDueDate}
        isLoading={isLoading}
        onSubmit={handleCreateQuickAction}
      />
    </Card>
  );
}

// Dialog components
function QuickSessionDialog({
  open,
  onOpenChange,
  workspaces,
  sessionWorkspaceId,
  setSessionWorkspaceId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: WorkspaceWithDetails[];
  sessionWorkspaceId: string;
  setSessionWorkspaceId: (v: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cockpit.quickScheduleSession', { defaultValue: 'Agendar Sessão Rápida' })}</DialogTitle>
          <DialogDescription>
            {t('cockpit.quickScheduleDesc', { defaultValue: 'Agendar uma sessão para qualquer startup do portfólio' })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('cockpit.startup', { defaultValue: 'Startup' })}</Label>
            <Select value={sessionWorkspaceId} onValueChange={setSessionWorkspaceId}>
              <SelectTrigger>
                <SelectValue placeholder={t('cockpit.selectStartup', { defaultValue: 'Selecionar startup...' })} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.slice(0, 50).map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.startup?.name || t('common.unknown', { defaultValue: 'Desconhecido' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Button>
          <Button onClick={onSubmit} disabled={!sessionWorkspaceId}>
            {t('common.continue', { defaultValue: 'Continuar' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickActionDialog({
  open,
  onOpenChange,
  workspaces,
  actionWorkspaceId,
  setActionWorkspaceId,
  actionTitle,
  setActionTitle,
  actionDueDate,
  setActionDueDate,
  isLoading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: WorkspaceWithDetails[];
  actionWorkspaceId: string;
  setActionWorkspaceId: (v: string) => void;
  actionTitle: string;
  setActionTitle: (v: string) => void;
  actionDueDate: string;
  setActionDueDate: (v: string) => void;
  isLoading: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cockpit.quickAddAction', { defaultValue: 'Adicionar Ação Rápida' })}</DialogTitle>
          <DialogDescription>
            {t('cockpit.quickAddActionDesc', { defaultValue: 'Adicionar uma ação a qualquer startup' })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('cockpit.startup', { defaultValue: 'Startup' })}</Label>
            <Select value={actionWorkspaceId} onValueChange={setActionWorkspaceId}>
              <SelectTrigger>
                <SelectValue placeholder={t('cockpit.selectStartup', { defaultValue: 'Selecionar startup...' })} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.slice(0, 50).map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.startup?.name || t('common.unknown', { defaultValue: 'Desconhecido' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('cockpit.actionTitle', { defaultValue: 'Título da Ação' })}</Label>
            <Input
              placeholder={t('cockpit.actionTitlePlaceholder', { defaultValue: 'ex., Submeter projeções financeiras' })}
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
            />
          </div>
          <div>
            <Label>{t('cockpit.dueDateOptional', { defaultValue: 'Data Limite (opcional)' })}</Label>
            <Input
              type="date"
              value={actionDueDate}
              onChange={(e) => setActionDueDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Button>
          <Button onClick={onSubmit} disabled={isLoading} loading={isLoading}>
            {isLoading ? t('common.creating', { defaultValue: 'A criar...' }) : t('actions.addAction', { defaultValue: 'Adicionar Ação' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
