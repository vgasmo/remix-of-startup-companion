import { memo, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { AlertTriangle, Calendar, Trash2, GripVertical, Paperclip, FileText, Plus, Check, ExternalLink, Hourglass, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { ActionItem } from '@/hooks/useActionItems';
import type { ActionDeliverable } from '@/hooks/useActionDeliverables';
import type { Database } from '@/integrations/supabase/types';
import { notify } from "@/lib/notify";
import { RequestTemplateDialog } from '@/components/workspace/RequestTemplateDialog';

type ActionStatus = Database['public']['Enums']['action_status'];

const STATUS_CONFIG: Record<ActionStatus, { labelKey: string; color: string }> = {
  pending: { labelKey: 'actions.statusOpen', color: 'bg-muted text-muted-foreground' },
  in_progress: { labelKey: 'actions.statusDoing', color: 'bg-primary/20 text-primary' },
  awaiting_validation: { labelKey: 'actions.awaitingValidation', color: 'bg-info/10 text-info' },
  completed: { labelKey: 'actions.statusDone', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ' },
  cancelled: { labelKey: 'actions.statusCancelled', color: 'bg-muted text-muted-foreground line-through' },
};

const PRIORITY_CONFIG: Record<string, { labelKey: string; color: string }> = {
  low: { labelKey: 'actions.priorityLow', color: 'text-muted-foreground' },
  medium: { labelKey: 'actions.priorityMedium', color: 'text-[hsl(var(--warning))]' },
  high: { labelKey: 'actions.priorityHigh', color: 'text-destructive' },
};

import type { PlatformDocumentOption as PlatformDocument } from '@/lib/platformDocuments';
export type { PlatformDocument };

export interface ActionItemCardProps {
  item: ActionItem;
  canWrite: boolean;
  isStaff: boolean;
  deliverables?: ActionDeliverable[];
  platformDocuments?: PlatformDocument[];
  onStatusChange: (item: ActionItem, status: ActionStatus) => void;
  onDueDateChange: (item: ActionItem, date: Date | undefined) => void;
  onDelete: (item: ActionItem) => void;
  onAddDeliverable?: (actionId: string, deliverable: { title: string; type: string; external_url?: string; document_id?: string }) => void;
  onCompleteDeliverable?: (id: string, actionId: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const ActionItemCard = memo(function ActionItemCard({ 
  item, canWrite, isStaff, deliverables = [], platformDocuments = [], onStatusChange, onDueDateChange, onDelete,
  onAddDeliverable, onCompleteDeliverable, isSelected, onToggleSelect,
}: ActionItemCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const isTerminal = item.status === 'completed' || item.status === 'cancelled' || item.status === 'awaiting_validation';
  const isOverdue = item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date)) && !isTerminal;
  const isDueToday = item.due_date && isToday(parseISO(item.due_date)) && !isTerminal;
  const priorityConfig = PRIORITY_CONFIG[item.priority || 'medium'] || PRIORITY_CONFIG.medium;

  const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
  const [requestTemplateOpen, setRequestTemplateOpen] = useState(false);
  const [newDeliverable, setNewDeliverable] = useState({ document_id: '' });

  const totalDeliverables = deliverables.length;
  const completedDeliverables = deliverables.filter(d => d.completed_at).length;
  const allDeliverablesCompleted = totalDeliverables > 0 && completedDeliverables === totalDeliverables;

  // Status options: founders can set pending/in_progress/awaiting_validation; only staff can set completed.
  const statusOptions = isStaff
    ? [
        { value: 'pending', label: t('status.open', 'Aberta') },
        { value: 'in_progress', label: t('status.doing', 'A Fazer') },
        { value: 'awaiting_validation', label: t('actions.awaitingValidation', 'A aguardar validação') },
        { value: 'completed', label: t('status.done', 'Concluída') },
      ]
    : [
        { value: 'pending', label: t('status.open', 'Aberta') },
        { value: 'in_progress', label: t('status.doing', 'A Fazer') },
        { value: 'awaiting_validation', label: t('actions.requestValidation', 'Concluído — pedir validação') },
      ];

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'completed' && !isStaff) {
      notify.error(t('actions.onlyStaffCanComplete', 'Apenas o consultor pode marcar como concluída'));
      return;
    }
    if ((newStatus === 'completed' || newStatus === 'awaiting_validation') && totalDeliverables > 0 && !allDeliverablesCompleted) {
      notify.error(t('actions.deliverablesRequired', 'Todos os entregáveis devem estar concluídos antes de concluir a ação'));
      return;
    }
    onStatusChange(item, newStatus as ActionStatus);
  };

  const existingDeliverableLinks = useMemo(
    () => new Set(deliverables.map((deliverable) => deliverable.external_url).filter(Boolean)),
    [deliverables],
  );

  const selectedDoc = platformDocuments.find(d => d.id === newDeliverable.document_id);
  const selectedDocAlreadyLinked = !!selectedDoc && existingDeliverableLinks.has(selectedDoc.deeplink);

  const handleAddDeliverable = () => {
    if (!newDeliverable.document_id) {
      notify.error(t('actions.selectPlatformDoc', 'Selecione um documento da plataforma'));
      return;
    }
    const doc = selectedDoc;
    if (!doc) {
      notify.error(t('actions.selectPlatformDoc', 'Selecione um documento da plataforma'));
      return;
    }

    if (doc.isReadyToAttach) {
      if (selectedDocAlreadyLinked) {
        notify.error(t('actions.deliverableAlreadyLinked', 'Este documento já está ligado a esta ação'));
        return;
      }

      onAddDeliverable?.(item.id, {
        title: doc.name || 'Documento',
        type: 'platform_document',
        external_url: doc.deeplink,
      });
    }

    setNewDeliverable({ document_id: '' });
    setAddDeliverableOpen(false);

    navigate(doc.deeplink);
  };

  return (
    <>
      <div className={`
        group bg-background rounded-lg border p-3 space-y-2 transition-all
        ${isOverdue ? 'border-destructive/50 bg-destructive/5' : ''}
        ${isDueToday ? 'border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/50' : ''}
        ${isSelected ? 'ring-2 ring-primary/50 bg-primary/5' : ''}
      `}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {onToggleSelect && (
              <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(item.id)} className="mt-0.5 shrink-0" />
            )}
            <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
            <span className={`text-sm font-medium leading-tight break-words ${item.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{item.title}</span>
          </div>
          {canWrite && (item.source_deliverable_key === null || isStaff) && (
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => onDelete(item)} aria-label={t('common.delete')}>
              <Trash2 className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>

        {item.description && (
          <p className="text-xs text-muted-foreground pl-10 line-clamp-2">{item.description}</p>
        )}

        {isOverdue && (
          <div className="flex items-center gap-1 text-xs text-destructive font-medium">
            <AlertTriangle className="h-3 w-3" />
            {t('actions.overdue', 'Atrasada')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {canWrite && !(!isStaff && (item.status === 'completed' || item.status === 'cancelled')) ? (
            <Select value={item.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-6 w-auto px-2 text-xs border-dashed"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-xs">{t(STATUS_CONFIG[item.status].labelKey)}</Badge>
          )}

          {canWrite ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`h-6 px-2 text-xs border-dashed ${isOverdue ? 'text-destructive border-destructive' : isDueToday ? 'text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30' : ''}`}>
                  <Calendar className="h-3 w-3 mr-1" />
                  {item.due_date ? format(parseISO(item.due_date), 'd MMM') : t('actions.dueDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={item.due_date ? parseISO(item.due_date) : undefined} onSelect={(date) => onDueDateChange(item, date)} initialFocus />
              </PopoverContent>
            </Popover>
          ) : item.due_date ? (
            <Badge variant="outline" className={`text-xs ${isOverdue ? 'text-destructive border-destructive' : ''}`}>
              <Calendar className="h-3 w-3 mr-1" />
              {format(parseISO(item.due_date), 'd MMM')}
            </Badge>
          ) : null}

          <span className={`text-xs ${priorityConfig.color}`}>{t(priorityConfig.labelKey)}</span>

          {item.status === 'awaiting_validation' && (
            <Badge variant="outline" className="text-xs gap-1 bg-info/10 text-info border-info/30">
              <Hourglass className="h-3 w-3" />
              {t('actions.awaitingValidation', 'A aguardar validação')}
            </Badge>
          )}

          {isStaff && item.status === 'awaiting_validation' && canWrite && (
            <>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1"
                onClick={() => handleStatusChange('completed')}>
                <Check className="h-3 w-3" />
                {t('actions.validate', 'Validar')}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                onClick={() => handleStatusChange('in_progress')}>
                <Undo2 className="h-3 w-3" />
                {t('actions.return', 'Devolver')}
              </Button>
            </>
          )}

          {!isStaff && item.status === 'awaiting_validation' && canWrite &&
           (item.owner_user_id === user?.id || (item as any).created_by === user?.id) && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground"
              onClick={() => handleStatusChange('in_progress')}>
              <Undo2 className="h-3 w-3" />
              {t('actions.revertToInProgress', 'Voltar para em curso')}
            </Button>
          )}


          {/* Deliverables count badge */}
          {totalDeliverables > 0 && (
            <Badge variant={allDeliverablesCompleted ? 'default' : 'outline'} className="text-xs gap-1">
              <Paperclip className="h-3 w-3" />
              {completedDeliverables}/{totalDeliverables}
            </Badge>
          )}
        </div>

        {/* Deliverables section */}
        {(totalDeliverables > 0 || canWrite) && (
          <div className="pl-10 space-y-1 pt-1">
            <div className={totalDeliverables > 5 ? 'max-h-48 overflow-y-auto pr-1 space-y-1 rounded-md border border-border/40 bg-muted/20 p-1.5' : 'space-y-1'}>
            {deliverables.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-xs group/del">
                {d.type === 'platform_document' ? <Paperclip className="h-3 w-3 text-primary shrink-0" />
                  : <FileText className="h-3 w-3 text-muted-foreground shrink-0" />}
                <span className={`flex-1 truncate ${d.completed_at ? 'line-through text-muted-foreground' : ''}`}>
                  {d.title}
                </span>
                {d.external_url && (
                  <a href={d.external_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline shrink-0" onClick={e => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {d.completed_at ? (
                  <Check className="h-3 w-3 text-[hsl(var(--success))] shrink-0" />
                ) : isStaff && onCompleteDeliverable ? (
                  <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 opacity-0 group-hover/del:opacity-100" onClick={() => onCompleteDeliverable(d.id, item.id)} aria-label={t('common.confirm')}>
                    <Check className="h-3 w-3 text-[hsl(var(--success))]" />
                  </Button>
                ) : null}
              </div>
            ))}
            </div>
            {canWrite && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground px-1 gap-1" onClick={() => setAddDeliverableOpen(true)}>
                <Plus className="h-3 w-3" />
                {t('actions.addDeliverable', 'Adicionar entregável')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Add Deliverable Dialog — platform documents only */}
      <Dialog open={addDeliverableOpen} onOpenChange={setAddDeliverableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('actions.addDeliverable', 'Adicionar entregável')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('actions.selectPlatformMaterial', 'Material da plataforma')} *</Label>
                <Select value={newDeliverable.document_id} onValueChange={v => setNewDeliverable({ document_id: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t('actions.selectPlatformDocPlaceholder', 'Selecionar material...')} /></SelectTrigger>
                <SelectContent>
                  {platformDocuments.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">{t('actions.noPlatformDocs', 'Sem materiais disponíveis')}</div>
                  ) : (
                    platformDocuments.map(doc => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.isReadyToAttach ? `✓ ${doc.name}` : doc.name}
                        </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
                {selectedDoc?.isReadyToAttach
                  ? t('actions.deliverableDocExistingHint', 'Se o documento já estiver concluído, será ligado a esta ação e aberto na base de documentos.')
                  : t('actions.deliverableDocHint', 'Ao escolher, será redirecionado para o separador de Documentos para preencher e submeter o material da plataforma.')}
            </p>
            <div className="flex items-start gap-2 p-2 rounded-md border border-dashed bg-muted/30">
              <p className="text-xs text-muted-foreground flex-1">
                {t('templateRequests.notFoundHint', { defaultValue: 'Não encontra um template adequado?' })}
              </p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => { setAddDeliverableOpen(false); setRequestTemplateOpen(true); }}
              >
                {t('templateRequests.requestOne', { defaultValue: 'Solicitar template' })}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddDeliverableOpen(false)}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={handleAddDeliverable}>{t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RequestTemplateDialog
        open={requestTemplateOpen}
        onOpenChange={setRequestTemplateOpen}
        workspaceId={workspaceId}
        contextType="action_item"
        contextRef={item.id}
        contextLabel={item.title}
        defaultTitle={item.title}
      />
    </>
  );
});
