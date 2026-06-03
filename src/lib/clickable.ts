import type { KeyboardEvent } from "react";

/**
 * Spread on a non-button element (e.g. <div>, <span>) that you want to behave
 * as a button — adds role, tabIndex, click handler and keyboard activation
 * (Enter / Space) so it passes WCAG keyboard interaction requirements.
 *
 * Example:
 *   <div {...clickableProps(() => navigate('/x'))} className="...">
 */
export function clickableProps<E extends HTMLElement = HTMLElement>(
  onActivate: (e: KeyboardEvent<E> | React.MouseEvent<E>) => void,
  options?: { label?: string; disabled?: boolean }
) {
  if (options?.disabled) {
    return { "aria-disabled": true as const };
  }
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": options?.label,
    onClick: onActivate as (e: React.MouseEvent<E>) => void,
    onKeyDown: (e: KeyboardEvent<E>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}
