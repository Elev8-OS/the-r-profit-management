"use client";

import { AlertOctagon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/buttonStyles";

/**
 * Route-level error boundary. Without this, ANY thrown error in a server
 * action or page render (e.g. generateAiSuggestion failing because
 * ANTHROPIC_API_KEY isn't set yet, or a transient Anthropic/PriceLabs API
 * error) surfaces as Next.js's raw "Application error: a server-side
 * exception has occurred. Digest: ..." page — which looks like the whole
 * app is broken. This renders a friendly, German, in-context message
 * instead, with a retry button that re-renders the segment without a full
 * page reload.
 */
export default function DashboardSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Card className="flex flex-col items-center px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger-text">
          <AlertOctagon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">Etwas ist schiefgelaufen</h1>
        <p className="mt-2 text-sm text-ink-500">{error.message || "Ein unerwarteter Fehler ist aufgetreten."}</p>
        <button type="button" onClick={() => reset()} className={buttonClass({ className: "mt-6" })}>
          Nochmal versuchen
        </button>
        {error.digest && (
          <p className="mt-4 text-xs text-ink-300">
            Fehler-Digest (für Support): <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </Card>
    </main>
  );
}
