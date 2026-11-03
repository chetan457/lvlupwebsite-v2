'use client';

import { useState, useTransition } from 'react';

import { reopenDay } from '@/lib/admin/actions';

/**
 * The way back from a close pressed by mistake. Owner only — the SQL refuses
 * anyone else — and armed in two steps, because reopening a day that has been
 * reported on is worth a second of thought. The reopen is written to the audit
 * log, so a day that went back and forth says so.
 */
export function ReopenDayForm({ day }: { day: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const button =
    'inline-flex min-h-11 items-center border px-4 font-mono text-[0.72rem] uppercase tracking-[0.12em] transition-colors';

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {armed ? (
        <>
          <button
            type="button"
            className={`${button} border-alarm text-alarm hover:bg-alarm hover:text-room`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await reopenDay(day);
                setError(result.error);
                if (!result.error) setArmed(false);
              })
            }
          >
            {pending ? 'Reopening…' : 'Confirm reopen'}
          </button>
          <button
            type="button"
            className={`${button} border-edge-hi text-dim hover:border-accent hover:text-accent`}
            onClick={() => {
              setArmed(false);
              setError(null);
            }}
          >
            Leave it closed
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`${button} border-edge-hi text-dim hover:border-accent hover:text-accent`}
          onClick={() => setArmed(true)}
        >
          Reopen the day
        </button>
      )}

      <p role="status" aria-live="polite" className="text-sm text-alarm">
        {error}
      </p>
    </div>
  );
}
