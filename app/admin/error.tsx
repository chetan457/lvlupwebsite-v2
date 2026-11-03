'use client';

/**
 * What the console shows when a query fails.
 *
 * The screens behind this deliberately throw rather than falling back to empty
 * arrays: an unread day sheet that renders as "nothing played" invites someone
 * to close a day that actually took money. A visible failure with a retry is
 * the safer wrong state.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-[var(--gutter)] py-12">
      <div className="hud-card max-w-prose px-5 py-6">
        <p className="eyebrow text-alarm">Could not load</p>
        <h1 className="mt-3 font-display text-[1.6rem] font-semibold uppercase leading-none">
          The console could not reach the database
        </h1>
        <p className="mt-3 text-[0.92rem] text-dim">
          Nothing has been changed. Check the connection and try again — if it keeps failing, the Supabase project may
          be paused or the keys may have been rotated.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[0.75rem] text-dimmer">Reference {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-11 items-center border border-edge-hi px-5 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-paper transition-colors hover:border-accent hover:text-accent"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
