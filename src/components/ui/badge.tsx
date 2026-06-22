import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15",
        outline: "text-foreground border-border/70",
        success: "border-transparent bg-[hsl(var(--success))]/12 text-[hsl(var(--success))]",
        warning: "border-transparent bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
        info: "border-transparent bg-[hsl(var(--info))]/12 text-[hsl(var(--info))]",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
      size: {
        default: "px-2 py-0.5 text-[11px] leading-4",
        sm: "px-1.5 py-px text-[10px] leading-4",
        lg: "px-2.5 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  /** Render a leading status dot. */
  dot?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, dot, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props}>
        {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
        {children}
      </div>
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
