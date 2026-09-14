'use client';

import { useEffect, useState } from 'react';

import { openState, type OpenState } from '@/lib/hours';

/**
 * "Open now" has to be true when someone reads it, not when the page was built.
 *
 * The page is statically rendered, so the server's answer is only a first
 * paint — correct at build, stale by evening. This leaf re-checks after
 * hydration, then once a minute, and again whenever the tab comes back to the
 * foreground, which is the case that actually bites: a phone left open on the
 * page overnight.
 *
 * It renders the server's state first so hydration matches and nothing shifts.
 */
export function LiveBadge({ initial }: { initial: OpenState }) {
  const [state, setState] = useState<OpenState>(initial);

  useEffect(() => {
    const check = () => setState(openState(new Date()));

    check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return (
    <p className="eyebrow flex min-h-5 items-center gap-[0.6rem] text-dim">
      {state.open ? (
        <span className="relative flex h-[7px] w-[7px] shrink-0" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-live opacity-60" />
          <span className="relative h-[7px] w-[7px] rounded-full bg-live" />
        </span>
      ) : (
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-dimmer" aria-hidden="true" />
      )}
      <span>
        {state.open
          ? `Open now · closes ${state.closesAt}`
          : `Closed · opens ${state.opensAt ?? 'tomorrow'}`}
      </span>
    </p>
  );
}
