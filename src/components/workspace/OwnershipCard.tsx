import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { User, Calendar, Clock, MessageSquare, Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useWorkspaceOwner,
  useUpdateWorkspaceOwner,
  useConsultors,
  useMarkContact,
} from '@/hooks/useWorkspaceOwner';
import { useAuth } from '@/contexts/AuthContext';

interface OwnershipCardProps {
  workspaceId: string;
  compact?: boolean;
}

export function OwnershipCard({ workspaceId, compact = false }: OwnershipCardProps) {
  const { t } = useTranslation();
  const { isConsultor, isAdmin } = useAuth();
  const canEdit = isConsultor || isAdmin;

  const { data: ownership, isLoading } = useWorkspaceOwner(workspaceId);
  const { data: consultors } = useConsultors();
  const updateOwner = useUpdateWorkspaceOwner();
  const markContact = useMarkContact();

  const [isEditingOwner, setIsEditingOwner] = useState(false);
  const [isEditingFollowup, setIsEditingFollowup] = useState(false);

  const handleAssignConsultor = async (consultorId: string) => {
    await updateOwner.mutateAsync({
      workspaceId,
      assigned_consultor_id: consultorId === 'none' ? null : consultorId,
    });
    setIsEditingOwner(false);
  };

  const handleSetFollowup = async (date: Date | undefined) => {
    await updateOwner.mutateAsync({
      workspaceId,
      next_followup_at: date ? date.toISOString() : null,
    });
    setIsEditingFollowup(false);
  };

  const handleMarkContact = async () => {
    await markContact.mutateAsync(workspaceId);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('ownership.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const slaStatus = getSlaStatus(ownership?.last_contact_at, ownership?.next_followup_at, t);

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-3 rounded-lg border bg-card">
        {/* Owner */}
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={ownership?.consultor?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {ownership?.consultor?.full_name?.[0] || '?'}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate max-w-[100px]">
            {ownership?.consultor?.full_name || t('ownership.unassigned')}
          </span>
        </div>

        {/* SLA Status */}
        <Badge variant={slaStatus.variant as any} className="shrink-0">
          {slaStatus.label}
        </Badge>

        {/* Quick Contact Button */}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkContact}
            disabled={markContact.isPending}
            className="ml-auto"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          {t('ownership.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assigned Consultor */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            {t('ownership.assignedConsultor')}
          </label>
          {isEditingOwner && canEdit ? (
            <Select
              value={ownership?.assigned_consultor_id || 'none'}
              onValueChange={handleAssignConsultor}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('ownership.selectConsultor')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('ownership.unassigned')}</SelectItem>
                {consultors?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name || c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={ownership?.consultor?.avatar_url || undefined} />
                <AvatarFallback>
                  {ownership?.consultor?.full_name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">
                  {ownership?.consultor?.full_name || t('ownership.unassigned')}
                </p>
                {ownership?.consultor?.email && (
                  <p className="text-xs text-muted-foreground">{ownership.consultor.email}</p>
                )}
              </div>
              {canEdit && (
                <Button variant="ghost" size="icon" onClick={() = aria-label={t('common.edit')}> setIsEditingOwner(true)} aria-label={t('common.edit')}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Last Contact */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            {t('ownership.lastContact')}
          </label>
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {ownership?.last_contact_at
                ? formatDistanceToNow(new Date(ownership.last_contact_at), { addSuffix: true })
                : t('ownership.never')}
            </p>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkContact}
                disabled={markContact.isPending}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {t('ownership.logContact')}
              </Button>
            )}
          </div>
        </div>

        {/* Next Follow-up */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            {t('ownership.nextFollowup')}
          </label>
          <div className="flex items-center justify-between">
            {isEditingFollowup && canEdit ? (
              <Popover open onOpenChange={() => setIsEditingFollowup(false)}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    {ownership?.next_followup_at
                      ? format(new Date(ownership.next_followup_at), 'MMM d, yyyy')
                      : t('ownership.setDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={ownership?.next_followup_at ? new Date(ownership.next_followup_at) : undefined}
                    onSelect={handleSetFollowup}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <>
                <p className="text-sm">
                  {ownership?.next_followup_at
                    ? format(new Date(ownership.next_followup_at), 'MMM d, yyyy')
                    : t('ownership.notSet')}
                </p>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() = aria-label={t('common.edit')}> setIsEditingFollowup(true)} aria-label={t('common.edit')}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* SLA Status */}
        <div className="pt-2 border-t">
          <Badge variant={slaStatus.variant as any} className="w-full justify-center py-1">
            <Clock className="h-3.5 w-3.5 mr-2" />
            {slaStatus.label}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function getSlaStatus(lastContact: string | null | undefined, nextFollowup: string | null | undefined, t: (key: string, options?: any) => string) {
  const now = new Date();

  // Check if follow-up is overdue
  if (nextFollowup) {
    const followupDate = new Date(nextFollowup);
    if (followupDate < now) {
      return { label: t('ownership.followupOverdue'), variant: 'destructive' };
    }
    const daysUntil = Math.ceil((followupDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 2) {
      return { label: t('ownership.followupInDays', { days: daysUntil }), variant: 'warning' };
    }
  }

  // Check last contact freshness
  if (lastContact) {
    const contactDate = new Date(lastContact);
    const daysSince = Math.floor((now.getTime() - contactDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 30) {
      return { label: t('ownership.noContact30Days'), variant: 'destructive' };
    }
    if (daysSince > 14) {
      return { label: t('ownership.noContact14Days'), variant: 'warning' };
    }
    return { label: t('ownership.onTrack'), variant: 'default' };
  }

  return { label: t('ownership.noContactRecorded'), variant: 'secondary' };
}
