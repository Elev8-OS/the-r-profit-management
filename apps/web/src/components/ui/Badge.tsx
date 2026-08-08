import type { ReactNode } from "react";
import { cn } from "./cn";

type BadgeVariant = "neutral" | "gold" | "success" | "warning" | "danger" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-ink-900/5 text-ink-700 border-transparent",
  gold: "bg-brand-yellow/15 text-[#8a6d1f] border-brand-gold/30",
  success: "bg-success-bg text-success-text border-success-border",
  warning: "bg-warning-bg text-warning-text border-warning-border",
  danger: "bg-danger-bg text-danger-text border-danger-border",
  outline: "bg-transparent text-ink-500 border-line-strong",
};

export function Badge({
  children,
  variant = "neutral",
  icon,
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
        variantClasses[variant],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
