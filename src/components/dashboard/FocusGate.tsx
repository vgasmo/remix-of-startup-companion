import { forwardRef, ReactNode } from 'react';
import { useFocusMode } from '@/components/ui/FocusModeToggle';

/**
 * Render children only when the dashboard is in "focus" mode (default).
 * Used to keep the primary triage surface visible even after the user
 * expands the full view.
 *
 * Wrapped in `forwardRef` so parents that forward a ref (layout wrappers,
 * Radix `asChild` slots) don't trigger React's "function components cannot be
 * given refs" dev warning. The ref is intentionally ignored: these gates render
 * a fragment and own no DOM node.
 */
export const FocusOnly = forwardRef<unknown, { children: ReactNode }>(function FocusOnly({ children }, _ref) {
  const { isFocused } = useFocusMode();
  if (!isFocused) return null;
  return <>{children}</>;
});

/**
 * Render children only when the dashboard is in "full view" mode
 * (i.e. the user has toggled "Ver tudo").
 */
export const FullViewOnly = forwardRef<unknown, { children: ReactNode }>(function FullViewOnly({ children }, _ref) {
  const { isFocused } = useFocusMode();
  if (isFocused) return null;
  return <>{children}</>;
});
