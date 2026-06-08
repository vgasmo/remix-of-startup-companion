import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LucideIcon } from 'lucide-react';
import { EmptyStateIllustration } from '@/components/ui/EmptyStateIllustration';
import { BrandSurface } from '@/components/ui/BrandSurface';
import { BrandChevron } from '@/components/ui/BrandChevron';

type IllustrationType = 'no-data' | 'no-results' | 'success' | 'error' | 'empty-inbox' | 'welcome' | 'rocket' | 'chart' | 'documents' | 'team';

interface EmptyStateProps {
  icon?: LucideIcon;
  illustration?: IllustrationType;
  title: string;
  description: string;
  value?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Color tone of the icon chip. Defaults to 'neutral'. */
  tone?: 'neutral' | 'success' | 'info';
  variant?: 'default' | 'muted' | 'inline';
  className?: string;
}

const TONE_CHIP: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  neutral: 'bg-muted/60 text-muted-foreground',
  success: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
  info: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
};

/**
 * Unified empty-state primitive. Teaches what a surface IS, why it's empty,
 * and offers one or two next-step CTAs. Brand watermark + BrandSurface
 * deliver the Startup Leiria identity even when there's nothing else to show.
 */
export function EmptyState({
  icon: Icon,
  illustration,
  title,
  description,
  value,
  action,
  secondaryAction,
  tone = 'neutral',
  variant = 'default',
  className,
}: EmptyStateProps) {
  const isInline = variant === 'inline';

  const body = (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center text-center px-4',
        isInline ? 'py-6' : 'py-8 sm:py-12',
        className,
      )}
    >
      {illustration ? (
        <EmptyStateIllustration
          type={illustration}
          size={isInline ? 'sm' : 'md'}
          className="mb-4"
        />
      ) : Icon ? (
        <div
          className={cn(
            'flex items-center justify-center rounded-2xl mb-4',
            isInline ? 'h-10 w-10' : 'h-12 w-12',
            TONE_CHIP[tone],
          )}
        >
          <Icon className={cn(isInline ? 'h-5 w-5' : 'h-6 w-6')} />
        </div>
      ) : null}

      <h3 className={cn('text-heading font-semibold text-foreground mb-1.5', isInline ? 'text-sm' : 'text-base')}>
        {title}
      </h3>

      <p className="text-sm text-muted-foreground max-w-md line-clamp-2 leading-relaxed">
        {description}
      </p>

      {value && (
        <p className="text-xs text-primary-strong font-medium max-w-xs mt-1.5">
          {value}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
          {action && (
            <Button size="sm" onClick={action.onClick} className="gap-1.5">
              {action.icon && <action.icon className="h-4 w-4" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}

      {/* Decorative brand watermark — never interactive */}
      <BrandChevron
        size={96}
        color="lime"
        strokeWidth={2}
        className="pointer-events-none absolute bottom-2 right-2 opacity-[0.04]"
        aria-hidden="true"
      />
    </div>
  );

  if (isInline) {
    return (
      <BrandSurface intensity="subtle" className="rounded-lg overflow-hidden">
        {body}
      </BrandSurface>
    );
  }

  return (
    <Card className={cn('border-dashed overflow-hidden', variant === 'muted' && 'bg-muted/30 border-muted')}>
      <CardContent className="p-0">
        <BrandSurface intensity="subtle">{body}</BrandSurface>
      </CardContent>
    </Card>
  );
}
