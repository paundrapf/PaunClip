import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "elevated" | "outlined";
}

const paddingClasses: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

const variantClasses: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "bg-panel border border-stroke",
  elevated: "bg-panel border border-stroke shadow-lg",
  outlined: "bg-transparent border border-stroke",
};

export function Card({
  children,
  className,
  padding = "md",
  variant = "default",
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card transition-colors",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
