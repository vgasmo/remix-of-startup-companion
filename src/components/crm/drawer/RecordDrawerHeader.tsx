import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Activity, Pencil, Phone } from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FunnelItem, FunnelStage } from '@/hooks/useFunnel';
import { getFunnelStageLabel } from '@/lib/stageLabels';
import { getRelationshipStatus, getRelationshipStatusConfig } from '@/lib/crmUtils';
import { cn } from '@/lib/utils';
import { useUpdateFunnelItem } from '@/hooks/useFunnel';

const STAGE_OPTIONS: FunnelStage[] = [
  'new', 'first_contact_booked', 'met', 'qualified', 'proposal_sent',
  'negotiating', 'intake_requested', 'intake_filling', 'intake_submitted',
  'intake_review', 'intake_changes_requested', 'approved_for_signature',
  'sent_for_signature', 'contracted', 'incubating', 'accelerating', 'rejected', 'archived',
];

const STAGE_COLORS: Record<FunnelStage, string> = {
  new: 'bg-muted',
  first_contact_booked: 'bg-[hsl(var(--info))]',
  met: 'bg-[hsl(var(--info))]/10',
  qualified: 'bg-primary/10',
  proposal_sent: 'bg-[hsl(var(--warning))]',
  negotiating: 'bg-[hsl(var(--warning))]/10',
  intake_requested: 'bg-[hsl(var(--info))]/10',
  intake_filling: 'bg-[hsl(var(--info))]/10',
  intake_submitted: 'bg-[hsl(var(--success))]/10',
  intake_review: 'bg-[hsl(var(--success))]/10',
  intake_changes_requested: 'bg-[hsl(var(--warning))]',
  approved_for_signature: 'bg-lime-500',
  sent_for_signature: 'bg-[hsl(var(--success))]',
  contracted: 'bg-[hsl(var(--success))]',
  incubating: 'bg-[hsl(var(--success))]/10',
  accelerating: 'bg-primary',
  rejected: 'bg-destructive',
  archived: 'bg-muted-foreground',
};

interface RecordDrawerHeaderProps {
  item: FunnelItem;
  onStageChange: (stage: FunnelStage) => void;
  isUpdating: boolean;
}

export function RecordDrawerHeader({ item, onStageChange, isUpdating }: RecordDrawerHeaderProps) {
  const { t } = useTranslation();
  const [localStage, setLocalStage] = useState<FunnelStage>(item.stage);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.organization_name || item.contact_name || '');
  const [editEmail, setEditEmail] = useState(item.contact_email || '');
  const [editPhone, setEditPhone] = useState(item.contact_phone || '');
  const updateItem = useUpdateFunnelItem();

  // Sync local state when the prop item changes
  useEffect(() => {
    setLocalStage(item.stage);
    setEditName(item.organization_name || item.contact_name || '');
    setEditEmail(item.contact_email || '');
    setEditPhone(item.contact_phone || '');
    setIsEditing(false);
  }, [item.id, item.stage, item.organization_name, item.contact_name, item.contact_email, item.contact_phone]);
  
  const stageColor = STAGE_COLORS[localStage];
  const stageLabel = getFunnelStageLabel(t, localStage);
  const nextActionAt = item.next_action_at ?? null;
  const lastActivityAt = item.last_activity_at ?? null;
  
  const relationshipStatus = getRelationshipStatus({
    next_action_at: nextActionAt,
    last_activity_at: lastActivityAt,
  });
  const statusConfig = getRelationshipStatusConfig(relationshipStatus);

  const handleSaveContact = () => {
    updateItem.mutate({
      id: item.id,
      organization_name: editName || null,
      contact_email: editEmail || null,
      contact_phone: editPhone || null,
    } as any);
    setIsEditing(false);
  };

  return (
    <SheetHeader className="p-4 pb-2 border-b">
      <div className="flex items-start justify-between">
        {isEditing ? (
          <div className="min-w-0 flex-1 mr-3 space-y-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('crm.nameOrOrg', 'Name / Organization')}
              className="h-8 text-sm"
            />
            <Input
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="email@..."
              className="h-8 text-sm"
            />
            <Input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="+351..."
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveContact} disabled={updateItem.isPending}>
                {t('common.save', 'Save')}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-lg truncate">
                {item.organization_name || item.contact_name || t('crm.unnamedLead')}
              </SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Badge className={cn('h-5 text-[10px] shrink-0', statusConfig.bgColor, statusConfig.color)}>
                <Activity className="h-3 w-3 mr-1" />
                {t(`crm.relationshipStatus.${relationshipStatus}`)}
              </Badge>
            </div>
            {item.contact_email && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Mail className="h-3 w-3" />
                {item.contact_email}
              </p>
            )}
            {item.contact_phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" />
                {item.contact_phone}
              </p>
            )}
          </div>
        )}
        <Select
          value={localStage}
          onValueChange={(value) => {
            const newStage = value as FunnelStage;
            setLocalStage(newStage);
            onStageChange(newStage);
          }}
          disabled={isUpdating}
        >
          <SelectTrigger className={cn('w-auto min-w-[200px] h-8', stageColor, 'text-white border-0 hover:opacity-90')} data-testid="stage-select">
            <SelectValue>{stageLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[260px]" align="end">
            {STAGE_OPTIONS.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {getFunnelStageLabel(t, stage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </SheetHeader>
  );
}

export { STAGE_COLORS };
