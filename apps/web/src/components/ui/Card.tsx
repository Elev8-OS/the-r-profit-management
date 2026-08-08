import type { ReactNode } from "react";
import { cn } from "./cn";

type CardProps = {
  children: ReactNode;
  className?: string;
  /**
   * "flat" — default resting card (subtle shadow, static)
   * "interactive" — adds hover elevation + border tint, for cards that lead
   *   somewhere or represent an actionable item (recommendation cards, list
   *   rows rendered as cards)
   * "accent" — gold-tinted background wash, for the single most important
   *   tile on a page (e.g. a hero KPI or an urgent-attention callout)
   */
  variant?: "flat" | "interactive" | "accent";
  as?: "div" | "section" | "article";
};

const variantClasses: Record<NonNullable<CardProps["variant"]>, string> = {
  flat: "bg-white border border-line shadow-card",
  interactive:
    "bg-white border border-line shadow-card transition-all duration-300 ease-out-soft hover:shadow-card-hover hover:border-line-strong",
  accent: "bg-gradient-gold-soft border border-line-gold shadow-card",
};

/**
 * Shared card shell used across dashboard/listings/rate-cards. Centralizing
 * this is the single biggest lever for visual consistency: before this,
 * every page hand-rolled its own `rounded-lg border border-[#e5e7eb] ...`
 * with slight drift between pages.
 */
export function Card({ children, className, variant = "flat", as = "div" }: CardProps) {
  const Tag = as;
  return <Tag className={cn("rounded-xl", variantClasses[variant], className)}>{children}</Tag>;
}
