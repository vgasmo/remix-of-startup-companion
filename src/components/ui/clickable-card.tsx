/**
 * ClickableCard — Batch G4 primitive.
 *
 * Wraps a shadcn <Card> with proper keyboard + role semantics so any card
 * used as a navigation target passes accessibility checks. Prefer this over
 * attaching onClick directly to <Card> / <div>.
 */
import * as React from 'react';
import { Card } from '@/components/ui/card';
import { clickableProps } from '@/lib/clickable';
import { cn } from '@/lib/utils';

export interface ClickableCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  onActivate: (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void;
  ariaLabel?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export const ClickableCard = React.forwardRef<HTMLDivElement, ClickableCardProps>(
  ({ onActivate, ariaLabel, disabled, className, children, ...rest }, ref) => {
    const activation = clickableProps<HTMLDivElement>(onActivate, {
      label: ariaLabel,
      disabled,
    });
    return (
      <Card
        ref={ref}
        {...rest}
        {...activation}
        className={cn(
          'cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'pointer-events-none opacity-60',
          className,
        )}
      >
        {children}
      </Card>
    );
  },
);
ClickableCard.displayName = 'ClickableCard';
