import type { ReactNode } from "react";
import { Card } from "./Card";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900/5 text-ink-500">{icon}</span>}
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
      {action}
    </Card>
  );
}
