import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BrandSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Intensity of the brand motif (radial bloom + faint dot grid) layered
   * behind children.
   * - 'none'  : no motif rendered (pass-through wrapper)
   * - 'subtle': low-emphasis ambient background (default)
   * - 'hero'  : full-intensity, for hero/greeting surfaces
   */
  intensity?: 'none' | 'subtle' | 'hero';
  as?: keyof JSX.IntrinsicElements;
}

/**
 * BrandSurface — wraps content with the Startup Leiria brand motif.
 * SSR-safe, pointer-events-none on the motif layer, honors
 * prefers-reduced-motion globally (motif is static, no animation).
 */
export const BrandSurface = forwardRef<HTMLDivElement, BrandSurfaceProps>(
  function BrandSurface(
    { intensity = 'subtle', className, children, as: Tag = 'div', ...rest },
    ref,
  ) {
    if (intensity === 'none') {
      return (
        // @ts-expect-error dynamic tag
        <Tag ref={ref} className={className} {...rest}>
          {children}
        </Tag>
      );
    }

    const motifClass =
      intensity === 'hero' ? 'brand-motif brand-motif-hero' : 'brand-motif brand-motif-subtle';

    return (
      // @ts-expect-error dynamic tag
      <Tag ref={ref} className={cn(motifClass, className)} {...rest}>
        {children}
      </Tag>
    );
  },
);
