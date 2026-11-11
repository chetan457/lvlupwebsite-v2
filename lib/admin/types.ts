/** Shapes returned by the queries in lib/admin/queries.ts. Mirrors supabase/migrations/0001_init.sql. */

export type StaffRole = 'owner' | 'manager' | 'staff';

export type Staff = {
  id: string;
  display_name: string;
  role: StaffRole;
  active: boolean;
  created_at: string;
};

export type StationKind = {
  id: string;
  label: string;
  default_rate: number;
  sort: number;
};

export type Station = {
  id: string;
  name: string;
  kind_id: string;
  seats: number;
  rate_per_hour: number;
  active: boolean;
  sort: number;
};

export type PaymentMethod = 'cash' | 'upi' | 'pending';

export type PlaySession = {
  id: string;
  station_id: string;
  guest_name: string;
  /** Optional: a walk-in who would rather not give a number still gets a timer. */
  guest_phone: string | null;
  players: number;
  started_at: string;
  ended_at: string | null;
  rate_snapshot: number;
  billed_minutes: number | null;
  /** What the rule worked out, kept even when the counter settled at something else. */
  quoted_amount: number | null;
  amount: number | null;
  payment_method: PaymentMethod | null;
  note: string | null;
  day: string;
};

/** What an hour costs at a given head count. The highest tier at or below the count wins. */
export type RateTier = {
  players: number;
  rate_per_hour: number;
};

/** A station with its kind, its rate card and whatever is playing on it right now. */
export type FloorStation = Station & {
  kind_label: string;
  rates: RateTier[];
  open_session: PlaySession | null;
};

export type DayTotals = {
  sessions: number;
  minutes: number;
  total: number;
  cash: number;
  upi: number;
};

export type DayClosure = {
  day: string;
  closed_at: string;
  closed_by: string | null;
  /** Resolved from the staff row by getClosure; null when the roster is not readable. */
  closed_by_name: string | null;
  totals: DayTotals;
};
