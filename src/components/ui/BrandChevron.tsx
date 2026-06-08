import { forwardRef, type SVGAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BrandChevronProps extends Omit<SVGAttributes<SVGSVGElement>, 'color'> {
  /** Visual size in px (width = height). Defaults to 16. */
  size?: number;
  /** Color token to use. 'current' inherits from text color. */
  color?: 'lime' | 'red' | 'ink' | 'current';
  /** Stroke width in SVG units (viewBox 24). Defaults to 3. */
  strokeWidth?: number;
}

const COLOR_CLASS: Record<NonNullable<BrandChevronProps['color']>, string> = {
  lime: 'text-[hsl(var(--primary))]',
  red: 'text-[hsl(var(--brand-red))]',
  ink: 'text-[hsl(var(--brand-ink))]',
  current: '',
};

/**
 * BrandChevron — the Startup Leiria signature mark.
 * A forward chevron "›" with rounded caps, mirroring the logo geometry.
 * Pure presentational; color is driven by `color` prop or `currentColor`.
 */
export const BrandChevron = forwardRef<SVGSVGElement, BrandChevronProps>(
  function BrandChevron(
    { size = 16, color = 'current', strokeWidth = 3, className, ...rest },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={cn('inline-block shrink-0', COLOR_CLASS[color], className)}
        {...rest}
      >
        <path
          d="M9 5 L17 12 L9 19"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  },
);
