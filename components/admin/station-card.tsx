'use client';

import { useState, useTransition } from 'react';

import { cancelSession, setSessionPlayers, startSession, stopSession } from '@/lib/admin/actions';
import {
  billedMinutes,
  clockTime,
  elapsed,
  rateFor,
  rupees,
  runningAmount,
  settlement,
} from '@/lib/admin/billing';
import type { FloorStation, PaymentMethod, SessionSegment } from '@/lib/admin/types';

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
  /**
   * What the clock says this session has run up, right now: the stretches
   * already closed by a head-count change, plus the one still running at its
   * own rate. Never re-rated — a group that grew pays the old price for the
   * time it played at the old size.
   */
  const quoted = session
    ? session.prior_amount + runningAmount(session.segment_rate, session.segment_started_at, now)
    : 0;
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const [settled, setSettled] = useState('');
  const [guest, setGuest] = useState('');
  const [players, setPlayers] = useState('1');
  const [phone, setPhone] = useState('');
  /** A head count being dialled in on a running session, before it is applied. */
  const [draft, setDraft] = useState<{ sessionId: string; players: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  // the draft belongs to one session: a card that has been stopped and restarted
  // must not inherit the last group's number
  const heads = session && draft?.sessionId === session.id ? draft.players : (session?.players ?? 1);
  const headsRate = session ? rateFor(station.rates, station.rate_per_hour, heads) : 0;
  const headsChanged = Boolean(session && heads !== session.players);

  const onPlayers = () => {
    if (!session) return;
    setError(null);
    run(async () => {
      const result = await setSessionPlayers(session.id, heads);
      setError(result.error);
      if (!result.error) setDraft(null);
    });
  };

  const onCancel = () => {
    if (!session) return;
    setError(null);
    run(async () => {
      const result = await cancelSession(session.id, reason);
      setError(result.error);
      if (!result.error) {
        setCancelling(false);
        setReason('');
      }
    });
  };

  /** What an hour costs for the head count being typed, before a session exists. */
  const plannedRate = rateFor(station.rates, station.rate_per_hour, Number.parseInt(players, 10) || 1);

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
          {station.rates.length > 1
          ? `${rupees(station.rates[0].rate_per_hour)}–${rupees(station.rates[station.rates.length - 1].rate_per_hour)}/hr`
          : `${rupees(station.rates[0]?.rate_per_hour ?? station.rate_per_hour)}/hr`}
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
              {session.players} player{session.players === 1 ? '' : 's'} at {rupees(session.segment_rate)}/hr
              {' · from '}
              <span className="tabular-nums">{clockTime(session.started_at)}</span>
            </p>

            {/* what the bill is made of, once the group has changed size at least
                once: the counter has to be able to say where the figure came from */}
            {session.segments.length > 1 ? (
              <p className="font-mono text-[0.68rem] leading-relaxed text-dimmer">
                {session.segments.map((segment, i) => (
                  <span key={segment.started_at}>
                    {i ? ' + ' : ''}
                    {segmentLine(segment, now)}
                  </span>
                ))}
              </p>
            ) : null}

            {/* Players, while it runs. Dialled in first and applied on purpose:
                a stray tap would close one stretch and open another, and each
                stretch rounds its last minute up. */}
            {billing ? null : (
              <div className="grid gap-2 border-t border-edge pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">
                    Players
                  </span>
                  <div className="flex items-center gap-2">
                    <Step
                      label="One player fewer"
                      disabled={pending || heads <= 1}
                      onClick={() => setDraft({ sessionId: session.id, players: Math.max(1, heads - 1) })}
                    >
                      −
                    </Step>
                    <span className="min-w-6 text-center font-mono text-lg tabular-nums text-paper">{heads}</span>
                    <Step
                      label="One player more"
                      disabled={pending || heads >= 50}
                      onClick={() => setDraft({ sessionId: session.id, players: Math.min(50, heads + 1) })}
                    >
                      +
                    </Step>
                  </div>
                </div>
                {headsChanged ? (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={onPlayers}
                      className="min-h-11 border border-accent/60 bg-accent/10 px-3 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-paper transition-colors hover:bg-accent/20 disabled:opacity-50"
                    >
                      {pending ? 'Changing…' : `Charge ${rupees(headsRate)}/hr from now`}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setDraft(null)}
                      className="min-h-11 px-3 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-dim transition-colors hover:text-paper disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </div>
                ) : null}
              </div>
            )}

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
                    step={1}
                    value={settled}
                    /* selected on every tap, not just the first: the box arrives
                       prefilled, and a till amount is retyped whole, never edited
                       digit by digit — appending to the quote is how ₹100 becomes ₹2100 */
                    onFocus={(event) => event.target.select()}
                    onClick={(event) => event.currentTarget.select()}
                    onChange={(event) => setSettled(event.target.value)}
                    className="min-h-11 border border-edge-hi bg-room px-2 font-mono text-[1.05rem] tabular-nums text-paper"
                  />
                </label>
                {/* the size of the gap as it is typed, so nobody discounts 40% meaning to round down */}
                {(() => {
                  const typed = settled.trim();
                  if (typed === '' || Number.isNaN(Number(typed))) return null;
                  const gap = settlement(quoted, Number(typed));
                  if (gap.kind === 'exact') return null;
                  return (
                    <p
                      aria-live="polite"
                      className={`font-mono text-[0.72rem] ${gap.kind === 'discount' ? 'text-alarm' : 'text-live'}`}
                    >
                      {gap.label} ({gap.difference < 0 ? '−' : '+'}
                      {rupees(Math.abs(gap.difference))})
                    </p>
                  );
                })()}
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
              <>
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

                {/* Wrong bay, double tap, a group that walked out before they sat
                    down. Deleting beats billing ₹0: a session nobody played has no
                    business in the day sheet. Two steps, and not next to Stop. */}
                {cancelling ? (
                  <div className="grid gap-2 border border-alarm/40 bg-alarm/5 p-2">
                    <p className="text-[0.8rem] leading-snug text-dim">
                      Delete this session? Nothing is billed and it leaves the day sheet. Who deleted it, and
                      why, stays in the log.
                    </p>
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Why (optional)"
                      autoComplete="off"
                      aria-label="Why this session is being deleted"
                      className="min-h-11 border border-edge-hi bg-room px-2 text-[0.9rem] text-paper placeholder:text-dimmer"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={onCancel}
                        className="min-h-11 border border-alarm/60 bg-alarm/10 px-3 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-paper transition-colors hover:bg-alarm/20 disabled:opacity-50"
                      >
                        {pending ? 'Deleting…' : 'Delete it'}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setCancelling(false);
                          setReason('');
                        }}
                        className="min-h-11 border border-edge-hi px-3 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-dim transition-colors hover:text-paper disabled:opacity-50"
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setCancelling(true)}
                    className="min-h-11 text-left font-mono text-[0.68rem] uppercase tracking-[0.12em] text-dimmer transition-colors hover:text-alarm disabled:opacity-50"
                  >
                    Started by mistake
                  </button>
                )}
              </>
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
                  onFocus={(event) => event.target.select()}
                  onClick={(event) => event.currentTarget.select()}
                  value={players}
                  onChange={(event) => setPlayers(event.target.value)}
                  className="min-h-11 border border-edge-hi bg-room px-2 text-[0.95rem] tabular-nums text-paper"
                />
              </label>
            </div>
            {/* the price follows the head count, so staff see what they are about to charge */}
            <p className="font-mono text-[0.72rem] text-accent" aria-live="polite">
              {rupees(plannedRate)}/hr for {Number.parseInt(players, 10) || 1}
              {station.rates.length ? '' : ' (flat rate)'}
            </p>
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

/** One stretch of a session, as it reads on the card: `2p 15m ₹63`. */
function segmentLine(segment: SessionSegment, now: number): string {
  const minutes = segment.ended_at
    ? segment.billed_minutes ?? 0
    : billedMinutes(segment.started_at, now);
  const amount = segment.ended_at
    ? segment.amount ?? 0
    : Math.round((segment.rate_per_hour * minutes) / 60);
  return `${segment.players}p ${minutes}m ${rupees(amount)}`;
}

/** The − and + beside a running head count. Square, thumb-sized, no label of its own. */
function Step({
  children,
  label,
  disabled,
  onClick,
}: {
  children: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-11 w-11 border border-edge-hi bg-room font-mono text-lg leading-none text-paper transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
    >
      {children}
    </button>
  );
}
