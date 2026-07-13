import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * ViewportDialog — a Dialog composition that keeps the header and footer
 * pinned while the body scrolls independently, so long forms never push
 * the primary action button below the viewport on mobile / short screens.
 *
 * Structure (top → bottom):
 *   [ sticky header  ]  — DialogHeader (title + optional description)
 *   [ scrollable body ] — flex-1 min-h-0 overflow-y-auto
 *   [ sticky footer  ]  — DialogFooter equivalent, optional
 *
 * The base DialogContent already caps at 85dvh; ViewportDialog turns it
 * into a flex column so the middle section takes the remaining space.
 */

type Size = "sm" | "md" | "lg" | "xl";

const sizeClass: Record<Size, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export interface ViewportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  /** Controls the max-width of the dialog. Defaults to 'md'. */
  size?: Size;
  /** Additional class names for the outer DialogContent. */
  className?: string;
  /** Additional class names for the scrollable body. */
  bodyClassName?: string;
  children: React.ReactNode;
}

export function ViewportDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = "md",
  className,
  bodyClassName,
  children,
}: ViewportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Override base scroll behavior — we manage scrolling inside the body.
          "flex flex-col overflow-hidden gap-0 p-0",
          sizeClass[size],
          className,
        )}
      >
        <DialogHeader className="border-b px-6 py-4 shrink-0 text-left">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div
          className={cn(
            "flex-1 min-h-0 overflow-y-auto px-6 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="border-t px-6 py-3 shrink-0 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2 bg-background">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
