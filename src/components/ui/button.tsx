import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold shadow-sm transition-[background,color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px active:scale-[0.99]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[#1d1308] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.32),0_12px_26px_rgb(242_162_58_/_0.16)] hover:bg-[var(--accent-strong)]",
        secondary:
          "bg-[var(--panel-raised)] text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--panel-soft)] hover:ring-[var(--border-strong)]",
        ghost:
          "bg-transparent text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]",
        danger:
          "bg-[var(--danger)] text-[#210707] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.28)] hover:bg-[#ff8a8a]"
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-5 text-sm",
        icon: "h-11 w-11 px-0"
      }
    },
    defaultVariants: {
      variant: "secondary",
      size: "md"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
