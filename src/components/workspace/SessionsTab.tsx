import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSessions, useDeleteSession } from '@/hooks/useSessions';
import { useExportSessions, exportSessionsToCsv } from '@/hooks/useExportData';
import { notify } from "@/lib/notify";
import { useAuth } from '@/contexts/AuthContext';
import { FacilitatorMode } from '@/components/sessions/FacilitatorMode';
import { SessionCard } from './sessions/SessionCard';
import { CreateSessionDialog } from './sessions/CreateSessionDialog';
import { SessionDetailDialog } from './sessions/SessionDetailDialog';

interface SessionsTabProps {
  workspaceId: string;
  canWrite: boolean;
}

export function SessionsTab({ workspaceId, canWrite }: SessionsTabProps) {
  const { t } = useTranslation();
  const { isAdmin, isConsultor } = useAuth();
  const canUseFacilitator = isAdmin || isConsultor;

  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [facilitatorSession, setFacilitatorSession] = useState<any>(null);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const { data: sessions, isLoading } = useSessions(workspaceId);
  const deleteMutation = useDeleteSession(workspaceId);
  const { refetch: fetchExportData } = useExportSessions(workspaceId);

  const handleExport = async () => {
    const { data } = await fetchExportData();
    if (data && data.length > 0) {
      exportSessionsToCsv(data, `sessions-${workspaceId}`);
      notify.success(t('sessions.exportedSuccess'));
    } else {
      notify.error(t('sessions.noDataToExport'));
    }
  };

  const filteredSessions = sessions?.filter(session =>
    session.title.toLowerCase().includes(search.toLowerCase()) ||
    session.agenda?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!sessionToDelete) return;
    try {
      await deleteMutation.mutateAsync(sessionToDelete);
      notify.success(t('sessions.sessionDeleted'));
      setShowDeleteAlert(false);
      setSessionToDelete(null);
    } catch (error) {
      notify.error(t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('sessions.searchSessions')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('sessions.export')}
          </Button>
          {canWrite && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('sessions.createSession')}
            </Button>
          )}
        </div>
      </div>

      {/* Sessions List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : filteredSessions?.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search ? t('sessions.noSearchResults') : t('emptyStates.sessions.title')}
          description={search ? t('sessions.tryAdjustingSearch') : t('emptyStates.sessions.description')}
          action={!search && canWrite ? {
            label: t('sessions.createSession'),
            onClick: () => setShowCreateDialog(true),
            icon: Plus,
          } : (!search && !canWrite ? {
            label: t('sessions.askConsultor', { defaultValue: 'Pedir sessão ao consultor' }),
            onClick: () => {
              try {
                window.dispatchEvent(new CustomEvent('messaging:open'));
              } catch { /* ignore */ }
            },
          } : undefined)}
        />
      ) : (
        <div className="space-y-3">
          {filteredSessions?.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              workspaceId={workspaceId}
              canWrite={canWrite}
              onEdit={() => setSelectedSession(session)}
              onDelete={() => {
                setSessionToDelete(session.id);
                setShowDeleteAlert(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Create Session Dialog */}
      <CreateSessionDialog
        workspaceId={workspaceId}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* Edit Session Dialog */}
      {selectedSession && (
        <SessionDetailDialog
          workspaceId={workspaceId}
          session={selectedSession}
          canWrite={canWrite}
          open={!!selectedSession}
          onOpenChange={(open) => !open && setSelectedSession(null)}
          onOpenFacilitator={(session) => {
            if (!canUseFacilitator) {
              notify.error(t('sessions.facilitatorStaffOnly', 'Facilitator Mode is only available for consultants.'));
              return;
            }
            setSelectedSession(null);
            setFacilitatorSession(session);
          }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sessions.deleteSession')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sessions.deleteSessionConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Facilitator Mode */}
      {facilitatorSession && canUseFacilitator && (
        <FacilitatorMode
          session={facilitatorSession}
          onClose={() => setFacilitatorSession(null)}
          onCreateAction={() => {
            setFacilitatorSession(null);
            setSelectedSession(facilitatorSession);
          }}
        />
      )}
    </div>
  );
}
