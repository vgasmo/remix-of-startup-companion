import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  FileEdit,
  Send,
  Inbox,
  PenLine,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Archive,
  Clock,
  AlertTriangle,
  FileSignature,
  Sparkles,
} from 'lucide-react';

/**
 * Semantic mapping for every known startup_contract / intake state.
 * Tokens only — no hardcoded palette colors.
 */
const STATE_TOKENS: Record<
  string,
  { className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  // Drafting & intake
  draft: { className: 'bg-muted text-muted-foreground border-border', icon: FileEdit },
  draft_internal: { className: 'bg-muted text-muted-foreground border-border', icon: FileEdit },
  intake_requested: { className: 'bg-info/10 text-info border-info/30', icon: Inbox },
  intake_in_progress: { className: 'bg-info/10 text-info border-info/30', icon: Sparkles },
  intake_review: { className: 'bg-info/10 text-info border-info/30', icon: FileSignature },

  // Signature flow
  pending_signature: { className: 'bg-warning/10 text-warning border-warning/30', icon: PenLine },
  sent_for_signature: { className: 'bg-warning/10 text-warning border-warning/30', icon: Send },
  sent: { className: 'bg-warning/10 text-warning border-warning/30', icon: Send },
  ready_to_send: { className: 'bg-warning/10 text-warning border-warning/30', icon: Clock },
  viewed: { className: 'bg-info/10 text-info border-info/30', icon: FileSignature },

  // Active / lifecycle
  signed: { className: 'bg-success/10 text-success border-success/30', icon: CheckCircle2 },
  active: { className: 'bg-success/10 text-success border-success/30', icon: CheckCircle2 },
  activated: { className: 'bg-success/10 text-success border-success/30', icon: CheckCircle2 },
  completed: { className: 'bg-success/10 text-success border-success/30', icon: CheckCircle2 },

  // Negative / terminal
  suspended: { className: 'bg-warning/10 text-warning border-warning/30', icon: PauseCircle },
  terminated: { className: 'bg-destructive/10 text-destructive border-destructive/30', icon: XCircle },
  cancelled: { className: 'bg-destructive/10 text-destructive border-destructive/30', icon: XCircle },
  rejected: { className: 'bg-destructive/10 text-destructive border-destructive/30', icon: AlertTriangle },
  expired: { className: 'bg-muted text-muted-foreground border-border', icon: Archive },
  archived: { className: 'bg-muted text-muted-foreground border-border', icon: Archive },
};

const FALLBACK = { className: 'bg-muted text-muted-foreground border-border', icon: FileEdit };

interface ContractStatusBadgeProps {
  status: string | null | undefined;
  withIcon?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function ContractStatusBadge({ status, withIcon = true, className, size = 'sm' }: ContractStatusBadgeProps) {
  const { t } = useTranslation();
  const key = (status || 'draft').toLowerCase();
  const cfg = STATE_TOKENS[key] || FALLBACK;
  const Icon = cfg.icon;
  const label = t(`admin.backoffice.contractStatus.${key}`, { defaultValue: key.replace(/_/g, ' ') });

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium border',
        size === 'sm' ? 'text-[10px] h-5 px-2' : 'text-xs h-6 px-2.5',
        cfg.className,
        className,
      )}
    >
      {withIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
      {label}
    </Badge>
  );
}
