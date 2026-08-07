"use client";

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
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-[#14181f]">Etwas ist schiefgelaufen</h1>
      <p className="mt-3 text-sm text-[#6b7280]">
        {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md bg-brand-yellow px-4 py-2 text-sm font-medium text-[#14181f] transition-colors hover:bg-brand-active"
      >
        Nochmal versuchen
      </button>
      {error.digest && (
        <p className="mt-4 text-xs text-[#9ca3af]">
          Fehler-Digest (für Support): <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
