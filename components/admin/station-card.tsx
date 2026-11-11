'use client';

import { useState, useTransition } from 'react';

import { startSession, stopSession } from '@/lib/admin/actions';
import { clockTime, elapsed, rupees, runningAmount } from '@/lib/admin/billing';
import type { FloorStation, PaymentMethod } from '@/lib/admin/types';

type Props = {
  station: FloorStation;
  /** The shared clock from FloorLive. One timer for the whole floor, not one per card. */
  now: number;
};

/**
 * One bay, rig or arena.
 *
 * Two states and nothing in between: free, with a start form, or in play, with
 * a timer and a bill. The left border carries that state in colour so a glance
 * down the floor answers "what is running" before any text is read.
 *
 * Stopping is two taps on purpose — the first reveals cash or UPI, because the
 * payment method is part of the stop and asking afterwards means a session
 * closed with the wrong one.
 */
export function StationCard({ station, now }: Props) {
  const session = station.open_session;
  /** What the clock says this session has run up, right now. */
  const quoted = session ? runningAmount(session.rate_snapshot ?? station.rate_per_hour, session.started_at, now) : 0;
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const [settled, setSettled] = useState('');
  const [guest, setGuest] = useState('');
  const [players, setPlayers] = useState('1');
  const [phone, setPhone] = useState('');

  const onStart = () => {
    setError(null);
    run(async () => {
      const result = await startSession(station.id, guest, Number.parseInt(players, 10) || 1, phone);
      setError(result.error);
      if (!result.error) {
        setGuest('');
        setPlayers('1');
        setPhone('');
      }
    });
  };

  const onStop = (payment: PaymentMethod) => {
    if (!session) return;
    setError(null);
    // an untouched box bills the quoted figure; a changed one bills what was taken
    const typed = settled.trim();
    const override = typed === '' || Number(typed) === quoted ? undefined : Number(typed);
    run(async () => {
      const result = await stopSession(session.id, payment, override);
      setError(result.error);
      if (!result.error) {
        setBilling(false);
        setSettled('');
      }
    });
  };

  return (
    <article
      className={`border border-edge border-l-4 bg-surface ${session ? 'border-l-live' : 'border-l-edge-hi'}`}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-edge px-3 py-2">
        <h2 className="font-display text-[1.05rem] font-semibold uppercase leading-none tracking-[0.02em]">
          {station.name}
        </h2>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-dimmer">
          {station.kind_label} · {station.seats} seat{station.seats === 1 ? '' : 's'} ·{' '}
          {rupees(station.rate_per_hour)}/hr
        </p>
      </header>

      <div className="px-3 py-3">
        {session ? (
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3">
              <p
                // tabular-nums so the seconds digit never shifts the minutes sideways
                className="font-mono text-4xl leading-none tabular-nums text-live"
                aria-label="Time in play"
              >
                {elapsed(session.started_at, now)}
              </p>
              <p className="font-mono text-xl leading-none tabular-nums text-paper">
                {/* the snapshot, not the station: a rate change mid-session must not change the bill */}
                {rupees(quoted)}
              </p>
            </div>

            <p className="text-[0.85rem] leading-snug text-dim">
              <span className="text-paper">{session.guest_name?.trim() || 'Walk-in'}</span>
              {' · '}
              {session.players} player{session.players === 1 ? '' : 's'}
              {' · from '}
              <span className="tabular-nums">{clockTime(session.started_at)}</span>
            </p>

            {billing ? (
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">
                    Amount taken{' '}
                    <span className="normal-case tracking-normal text-dimmer">(₹{quoted} on the clock)</span>
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={10}
                    value={settled}
                    /* selected on focus: the box arrives prefilled, and a thumb
                       typing a new figure must replace it, not append to it */
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setSettled(event.target.value)}
                    className="min-h-11 border border-edge-hi bg-room px-2 font-mono text-[1.05rem] tabular-nums text-paper"
                  />
                </label>
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">Paid by</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onStop('cash')}
                    className="min-h-11 border border-live/60 bg-live/10 px-3 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-live/20 disabled:opacity-50"
                  >
                    {pending ? 'Stopping…' : 'Cash'}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onStop('upi')}
                    className="min-h-11 border border-accent/60 bg-accent/10 px-3 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-accent/20 disabled:opacity-50"
                  >
                    {pending ? 'Stopping…' : 'UPI'}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setBilling(false);
                    setSettled('');
                  }}
                  className="min-h-11 text-left font-mono text-[0.72rem] uppercase tracking-[0.12em] text-dim transition-colors hover:text-paper disabled:opacity-50"
                >
                  Keep playing
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  // prefilled with the quoted figure: most bills are taken as they stand
                  setSettled(String(quoted));
                  setBilling(true);
                }}
                className="min-h-11 w-full border border-edge-hi bg-surface-hi px-3 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-paper transition-colors hover:border-live disabled:opacity-50"
              >
                Stop &amp; bill
              </button>
            )}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onStart();
            }}
            className="grid gap-2"
          >
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <label className="grid gap-1">
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">Guest</span>
                <input
                  value={guest}
                  onChange={(event) => setGuest(event.target.value)}
                  placeholder="Walk-in"
                  autoComplete="off"
                  className="min-h-11 border border-edge-hi bg-room px-2 text-[0.95rem] text-paper placeholder:text-dimmer"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">Players</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={players}
                  onChange={(event) => setPlayers(event.target.value)}
                  className="min-h-11 border border-edge-hi bg-room px-2 text-[0.95rem] tabular-nums text-paper"
                />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">
                Phone <span className="normal-case tracking-normal text-dimmer">(optional)</span>
              </span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Skip if they would rather not"
                className="min-h-11 border border-edge-hi bg-room px-2 text-[0.95rem] text-paper placeholder:text-dimmer"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 w-full border border-accent/60 bg-accent/10 px-3 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-accent/20 disabled:opacity-50"
            >
              {pending ? 'Starting…' : 'Start'}
            </button>
          </form>
        )}

        {/* stays mounted so the live region is there before there is anything to announce */}
        <p aria-live="polite" className={`text-[0.8rem] leading-snug text-alarm ${error ? 'mt-2' : ''}`}>
          {error}
        </p>
      </div>
    </article>
  );
}
