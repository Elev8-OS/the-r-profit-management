import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-200 ease-out-soft disabled:cursor-not-allowed disabled:opacity-60";

const sizes: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-gold text-ink-900 shadow-card hover:shadow-glow-gold hover:brightness-105 active:brightness-95",
  secondary: "border border-line-strong bg-white text-ink-700 hover:bg-surface-sunken hover:border-ink-300",
  ghost: "text-ink-500 hover:bg-ink-900/5 hover:text-ink-900",
  danger: "border border-danger-border bg-danger-bg text-danger-text hover:bg-danger/10",
};

/**
 * className builder for buttons/links so every actionable element in the app
 * (native <button>, <SubmitButton>, <ConfirmActionButton>, plain <a>) shares
 * one visual language instead of ad-hoc Tailwind strings scattered per page.
 */
export function buttonClass(opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  const { variant = "primary", size = "md", className } = opts;
  return cn(base, sizes[size], variants[variant], className);
}
