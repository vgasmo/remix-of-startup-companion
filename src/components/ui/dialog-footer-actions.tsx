/**
 * Standard footer-actions for Dialog / Sheet / Drawer.
 *
 * Convention (project-wide):
 *   • Sheet   → quick details / drill-down (read-mostly, side panel)
 *   • Dialog  → short form or confirmation (1 step, < 8 fields)
 *   • Page    → multi-step flows (wizards) — do NOT nest in a dialog
 *
 * Button order (LTR): [Cancel] [Primary]  — primary on the right.
 * Destructive primary uses `variant="destructive"`.
 * Loading state disables both buttons; the primary shows the spinner label.
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DialogFooterActionsProps {
  onCancel?: () => void;
  onConfirm?: () => void | Promise<void>;
  cancelLabel?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  confirmType?: 'button' | 'submit';
  confirmVariant?: ButtonProps['variant'];
  className?: string;
  extra?: React.ReactNode;
}

export function DialogFooterActions({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  loadingLabel,
  isLoading = false,
  disabled = false,
  destructive = false,
  confirmType = 'button',
  confirmVariant,
  className,
  extra,
}: DialogFooterActionsProps) {
  const { t } = useTranslation();

  const resolvedCancel = cancelLabel ?? t('common.cancel', { defaultValue: 'Cancelar' });
  const resolvedConfirm = confirmLabel ?? t('common.confirm', { defaultValue: 'Confirmar' });
  const resolvedLoading = loadingLabel ?? t('common.saving', { defaultValue: 'A guardar…' });

  const variant: ButtonProps['variant'] =
    confirmVariant ?? (destructive ? 'destructive' : 'default');

  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2',
        className,
      )}
    >
      {extra && <div className="mr-auto">{extra}</div>}
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading} loading={isLoading}
        >
          {resolvedCancel}
        </Button>
      )}
      <Button
        type={confirmType}
        variant={variant}
        onClick={confirmType === 'submit' ? undefined : onConfirm}
        disabled={disabled || isLoading} loading={isLoading}
      >
        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
        {isLoading ? resolvedLoading : resolvedConfirm}
      </Button>
    </div>
  );
}
