"use client";

import { useEffect, useState, useTransition } from "react";

/**
 * Button for pushing one AI-suggested action (or all of them at once) to an
 * external system. Unlike the plain <form action={...}> pattern used
 * elsewhere in this app, these pushes come from an AI suggestion whose
 * individual actions were calculated together — pushing just one of them can
 * behave differently than the combined effect the suggestion described. So
 * this always shows an in-app confirmation with that caveat (plus whatever
 * specific dependencyNote the AI attached) before calling the server action,
 * rather than submitting immediately on click.
 *
 * Takes the server action as a plain prop and calls it directly (server
 * actions are valid to invoke as functions from a client component, not just
 * bind to a <form>), so this works for both a single action
 * (pushAiSuggestionAction bound to one index) and the "push all" action.
 */
export function ConfirmActionButton({
  run,
  label,
  pendingLabel,
  dependencyNote,
  className,
}: {
  run: () => Promise<void>;
  label: string;
  pendingLabel: string;
  dependencyNote: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // A pure spinner + static label gives no proof of life on a slow push —
  // real PriceLabs pushes have been observed taking 25-80+ seconds
  // (especially "push all" running several external calls one after
  // another), and that silence reads as "frozen" even though it's working.
  // A visibly ticking counter is unmistakable evidence it's still going.
  useEffect(() => {
    if (!isPending) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isPending]);

  function confirm() {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      try {
        await run();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Push fehlgeschlagen.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={isPending} aria-busy={isPending} className={className}>
        {isPending ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            {pendingLabel} ({elapsedSeconds}s)
          </span>
        ) : (
          label
        )}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[#14181f]">Push bestätigen</h3>
            <p className="mt-2 text-sm text-[#6b7280]">
              Dieser Push wird sofort live ausgeführt, sobald du bestätigst — das ist nicht automatisch rückgängig zu
              machen. Diese Aktion wurde im Zusammenhang mit den anderen Punkten dieses Vorschlags berechnet: führst
              du nur sie allein aus, kann die tatsächliche Wirkung von der im Vorschlag beschriebenen Gesamtwirkung
              abweichen.
            </p>
            {dependencyNote && (
              <p className="mt-2 rounded-md bg-[#fffdf7] p-2 text-xs text-[#8a6d1f]">{dependencyNote}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[#e5e7eb] px-3 py-1.5 text-sm font-medium text-[#6b7280] hover:bg-[#f7f7f8]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirm}
                className="rounded-md bg-brand-yellow px-3 py-1.5 text-sm font-medium text-[#14181f] hover:bg-brand-active"
              >
                Bestätigen &amp; pushen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
