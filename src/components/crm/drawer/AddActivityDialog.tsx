import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ActivityType } from '@/hooks/useActivityTimeline';

interface AddActivityDialogProps {
  type: ActivityType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (type: ActivityType, data: { subject: string; preview: string; shareWithFounder?: boolean }) => void;
  isPending: boolean;
  hasWorkspace: boolean;
}

export function AddActivityDialog({
  type,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  hasWorkspace,
}: AddActivityDialogProps) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [preview, setPreview] = useState('');
  const [shareWithFounder, setShareWithFounder] = useState(false);

  const handleSubmit = () => {
    if (!type || !subject.trim()) return;
    onSubmit(type, { subject, preview, shareWithFounder });
    setSubject('');
    setPreview('');
    setShareWithFounder(false);
  };

  const titles: Record<ActivityType, string> = {
    note: t('crm.addNote'),
    call: t('crm.logCall'),
    meeting: t('crm.logMeeting'),
    task: t('crm.addTask'),
    email: t('crm.logEmail'),
    system: t('crm.system'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type ? titles[type] : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('crm.title')}</Label>
            <Input
              placeholder={t('crm.titlePlaceholder')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('crm.details')}</Label>
            <Textarea
              placeholder={t('crm.detailsPlaceholder')}
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              rows={3}
            />
          </div>
          {hasWorkspace && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share"
                checked={shareWithFounder}
                onCheckedChange={(checked) => setShareWithFounder(!!checked)}
              />
              <Label htmlFor="share" className="text-sm font-normal cursor-pointer">
                {t('crm.shareWithFounder')}
              </Label>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={isPending || !subject.trim()} loading={isPending} className="w-full">
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
