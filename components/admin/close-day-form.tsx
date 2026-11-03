'use client';

import { useState, useTransition } from 'react';

import { closeDay } from '@/lib/admin/actions';
import { buttonClass } from '@/components/ui/button';

/**
 * Closing a day is the one change in the console that cannot be undone from the
 * console, so it asks twice. The confirm step is a second button rather than
 * window.confirm: a native dialog on a shared counter tablet is easy to dismiss
 * by accident, and it cannot say what closing actually does.
 */
export function CloseDayForm({ day, running }: { day: string; running: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const blocked = running > 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await closeDay(day);
      // on success the page re-renders as closed and this form is gone
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <section className="border border-edge-hi bg-surface p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-paper">Close the day</h2>
      <p className="mt-1.5 max-w-prose text-sm text-dim">
        Closing stores today&apos;s totals and freezes the sessions above. After that nobody can change them —
        a correction has to be a new session with a note.
      </p>

      {blocked ? (
        <p className="mt-3 font-mono text-sm text-accent tabular-nums">
          {running === 1 ? '1 session is still in play' : `${running} sessions are still in play`}. Stop them on
          the floor first.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className={buttonClass('primary', 'md', 'disabled:opacity-50')}
            >
              {pending ? 'Closing' : 'Confirm close'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className={buttonClass('ghost', 'md', 'disabled:opacity-50')}
            >
              Keep it open
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            disabled={blocked}
            className={buttonClass('ghost', 'md', 'disabled:pointer-events-none disabled:opacity-40')}
          >
            Close the day
          </button>
        )}

        {confirming && !pending ? (
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-dimmer">
            This cannot be undone here
          </span>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-alarm">
        {error}
      </p>
    </section>
  );
}
