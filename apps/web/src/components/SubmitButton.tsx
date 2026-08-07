"use client";

import { useFormStatus } from "react-dom";

/**
 * Generic submit button that shows a pending label while its parent <form>'s
 * server action is in flight. useFormStatus only works inside a descendant
 * of the <form>, which is why this has to be its own client component rather
 * than inline in a (server) page component.
 *
 * Added after Reto reported "button drücke, aber nichts passiert" on the
 * "Neuen KI-Vorschlag generieren" button — the action was actually
 * succeeding every time (confirmed via Railway http logs: HTTP 200, ~24-28s
 * each, matching the web-search-enabled Anthropic call), but a plain
 * <button type="submit"> gives zero visual feedback during that wait, so it
 * looked frozen and got clicked 2-3 times in a row.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
