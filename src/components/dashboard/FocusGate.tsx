import { ReactNode } from 'react';
import { useFocusMode } from '@/components/ui/FocusModeToggle';

/**
 * Render children only when the dashboard is in "focus" mode (default).
 * Used to keep the primary triage surface visible even after the user
 * expands the full view.
 */
export function FocusOnly({ children }: { children: ReactNode }) {
  const { isFocused } = useFocusMode();
  if (!isFocused) return null;
  return <>{children}</>;
}

/**
 * Render children only when the dashboard is in "full view" mode
 * (i.e. the user has toggled "Ver tudo").
 */
export function FullViewOnly({ children }: { children: ReactNode }) {
  const { isFocused } = useFocusMode();
  if (isFocused) return null;
  return <>{children}</>;
}
