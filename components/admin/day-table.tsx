import type { ReactNode } from 'react';

import { clockTime, rupees } from '@/lib/admin/billing';
import type { DaySession } from '@/lib/admin/queries';

/**
 * Every session on one day, newest first. No client JS: the numbers are already
 * settled by the time they get here, and a running row says so rather than
 * ticking — the floor screen is where a live timer belongs.
 */

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  pending: 'Pending',
};

export function DayTable({ sessions, total }: { sessions: DaySession[]; total: number }) {
  return (
    /* the table, not the page, is what scrolls sideways on a phone */
    <div className="overflow-x-auto border border-edge bg-surface">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <caption className="sr-only">Sessions played on this day, newest first</caption>
        <thead>
          <tr className="border-b border-edge-hi text-left">
            <Th>Station</Th>
            <Th>Guest</Th>
            <Th align="right">Start</Th>
            <Th align="right">End</Th>
            <Th align="right">Minutes</Th>
            <Th>Payment</Th>
            <Th align="right">Amount</Th>
          </tr>
        </thead>

        <tbody>
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-dim">
                Nothing played on this day yet.
              </td>
            </tr>
          ) : (
            sessions.map((row) => {
              const endedAt = row.ended_at;
              const live = endedAt === null;
              return (
                <tr key={row.id} className="border-b border-edge last:border-0 align-middle">
                  <Td className="font-mono text-paper">{row.station_name}</Td>
                  <Td className="text-paper">
                    {row.guest_name || 'Walk-in'}
                    {/* the number sits under the name rather than taking a column a phone cannot spare */}
                    {row.guest_phone ? (
                      <span className="block font-mono text-[0.72rem] text-dimmer">{row.guest_phone}</span>
                    ) : null}
                  </Td>
                  <Td align="right" className="font-mono text-dim tabular-nums">
                    {clockTime(row.started_at)}
                  </Td>
                  <Td align="right" className="font-mono tabular-nums">
                    {endedAt ? (
                      <span className="text-dim">{clockTime(endedAt)}</span>
                    ) : (
                      <span className="text-live">In play</span>
                    )}
                  </Td>
                  <Td align="right" className="font-mono text-dim tabular-nums">
                    {live ? '—' : row.billed_minutes ?? 0}
                  </Td>
                  <Td className="font-mono text-dim">
                    {live ? '—' : PAYMENT_LABEL[row.payment_method ?? 'pending'] ?? 'Pending'}
                  </Td>
                  <Td align="right" className="font-mono text-paper tabular-nums">
                    {live ? (
                      <span className="text-live">In play</span>
                    ) : (
                      <>
                        {rupees(row.amount)}
                        {/* settled off the clock: show what the rule said, so the gap is on the record */}
                        {row.quoted_amount != null && row.quoted_amount !== row.amount ? (
                          <span className="block text-[0.72rem] text-dimmer">
                            was {rupees(row.quoted_amount)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>

        <tfoot>
          <tr className="border-t border-edge-hi bg-surface-hi/50">
            {/* a running session has no amount yet, so it is not in this figure */}
            <td colSpan={6} className="px-4 py-3 font-mono text-xs uppercase tracking-[0.14em] text-dimmer">
              Total, closed sessions only
            </td>
            <td className="px-4 py-3 text-right font-mono text-base text-paper tabular-nums">{rupees(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-dimmer ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  align = 'left',
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  return <td className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>{children}</td>;
}
