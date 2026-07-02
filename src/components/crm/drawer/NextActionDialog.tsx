import { useState, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { DialogFooterActions } from '@/components/ui/dialog-footer-actions';

interface NextActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { date: string; description: string }) => void;
  isPending: boolean;
  currentDate?: string | null;
  currentDescription?: string | null;
}

export function NextActionDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  currentDate,
  currentDescription,
}: NextActionDialogProps) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      if (currentDate) {
        const d = new Date(currentDate);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        setDate(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setDate('');
      }
      setDescription(currentDescription || '');
    }
  }, [open, currentDate, currentDescription]);

  const handleSubmit = () => {
    if (!date) return;
    onSubmit({
      date: new Date(date).toISOString(),
      description,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('crm.setNextAction')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('crm.nextActionDate')}</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'tomorrow', labelKey: 'common.presets.tomorrow', days: 1 },
                { key: 'threeDays', labelKey: 'common.presets.threeDays', days: 3 },
                { key: 'nextWeek', labelKey: 'common.presets.nextWeek', days: 7 },
              ].map((p) => (
                <Button
                  key={p.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + p.days);
                    d.setHours(9, 0, 0, 0);
                    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                      .toISOString()
                      .slice(0, 16);
                    setDate(iso);
                  }}
                >
                  {t(p.labelKey)}
                </Button>
              ))}
            </div>
            <Input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('crm.nextActionDescription')}</Label>
            <Textarea
              placeholder={t('crm.detailsPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooterActions
            onCancel={() => onOpenChange(false)}
            onConfirm={handleSubmit}
            confirmLabel={t('common.save')}
            isLoading={isPending}
            disabled={!date}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
