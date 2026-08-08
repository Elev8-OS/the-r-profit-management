"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

/**
 * Minimal trend sparkline for StatTile. Split into its own client component
 * (recharts needs a browser layout pass via ResizeObserver) so the rest of
 * StatTile — and every server-component page that renders it — stays a
 * plain server component.
 */
export function Sparkline({
  data,
  color = "#EFB100",
}: {
  data: Array<{ value: number }>;
  color?: string;
}) {
  if (!data || data.length < 2) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.15 || 1;

  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={[min - padding, max + padding]} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
