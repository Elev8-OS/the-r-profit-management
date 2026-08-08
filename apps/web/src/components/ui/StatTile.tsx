import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";
import { Sparkline } from "./Sparkline";
import { cn } from "./cn";

export function StatTile({
  label,
  value,
  icon,
  sub,
  trend,
  sparkline,
  accent = false,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  /** Small supporting line under the value, e.g. "24 Listings" */
  sub?: ReactNode;
  /** Signed percent/point delta vs. a prior period; omit if not applicable */
  trend?: { value: number; label?: string };
  /** Optional recent-values sparkline, e.g. last 14 days of a KPI */
  sparkline?: Array<{ value: number }>;
  accent?: boolean;
}) {
  const trendPositive = trend !== undefined && trend.value > 0;
  const trendNegative = trend !== undefined && trend.value < 0;

  return (
    <Card variant={accent ? "accent" : "flat"} className="animate-fade-in-up p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              accent ? "bg-gradient-gold text-ink-900" : "bg-ink-900/5 text-ink-700"
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
        </div>
        {trend !== undefined && (
          <span
            className={cn(
              "mb-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
              trendPositive && "bg-success-bg text-success-text",
              trendNegative && "bg-danger-bg text-danger-text",
              !trendPositive && !trendNegative && "bg-ink-900/5 text-ink-500"
            )}
          >
            {trendPositive && <ArrowUpRight className="h-3 w-3" />}
            {trendNegative && <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend.value).toFixed(1)}
            {trend.label ?? "%"}
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <div className="mt-2 -mb-1">
          <Sparkline data={sparkline} color={accent ? "#C8A84B" : "#9ca3af"} />
        </div>
      )}
    </Card>
  );
}
