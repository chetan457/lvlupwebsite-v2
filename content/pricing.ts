import { liveStations } from './stations';

/**
 * The real hourly card, matching what the console charges (station_rates in
 * Supabase): the price is per hour and goes up with the size of the group.
 *
 * Nothing in this file may be invented. Every figure below is either the rate
 * card the lounge actually charges or arithmetic on top of it. Passes, an
 * off-peak rate, a deposit and a weekly tournament used to live here as
 * placeholders; they were deleted rather than left behind a comment, because a
 * placeholder price is a lie the moment it renders.
 */

export type Rate = {
  id: string;
  label: string;
  amount: number;
  unit: string;
  when: string;
  highlight?: boolean;
};

export const rates: Rate[] = [
  { id: 'solo', label: 'One player', amount: 150, unit: '/hr', when: 'One pad, one player.', highlight: true },
  { id: 'duo', label: 'Two players', amount: 250, unit: '/hr', when: 'Two pads on the same screen.' },
  { id: 'trio', label: 'Three players', amount: 350, unit: '/hr', when: 'Three pads. FC, Rocket League, WWE.' },
  { id: 'squad', label: 'Four players', amount: 450, unit: '/hr', when: 'Four pads, the full bay.' },
];

/**
 * The cheapest hour anyone can actually walk in and buy, and the rate most
 * people will pay. Derived, because the site quotes a "from" figure in seven
 * places — hero, mobile dock, contact, 404, OG image, meta description, rates
 * heading — and they were drifting apart from the rate card.
 *
 * Not the same thing as `lowestRate` in content/stations.ts, which is the
 * cheapest BAY. Quoting that as the cheapest HOUR advertised the lounge as a
 * third more expensive than it is.
 */
const hourly = rates.filter((r) => r.unit === '/hr');
export const cheapestHour = Math.min(...hourly.map((r) => r.amount));
/** Two on a bay is the ordinary booking, so it is the figure to quote when one is needed. */
export const standardHour = rates.find((r) => r.id === 'duo')?.amount ?? 250;
export const dearestHour = Math.max(...hourly.map((r) => r.amount));
/** The condition the cheapest figure comes with; never quote one without the other. */
export const cheapestHourWhen = 'for one player';

/**
 * Booking the whole room.
 *
 * The rate is not a separate price list: it is every live bay at its
 * four-player rate, added up. That way a group that books the lounge pays what
 * the same group would pay bay by bay, and the figure cannot drift from the
 * rate card. Minimum hours, an advance and a cancellation window are business
 * policy nobody has set yet, so none is claimed.
 */
export const buyout = {
  bays: liveStations.length,
  ratePerHour: liveStations.length * dearestHour,
  seats: liveStations.reduce((total, station) => total + station.seats, 0),
  includes: [
    'Every bay, every screen, every pad',
    'A bracket on FC, Tekken or WWE if you want one',
    'One bill at the end, not a ticket each',
  ],
};

export const included = [
  'Controllers, cleaned and charged between sessions',
  'Wi-Fi, free while you play',
  'Your game, installed and patched before you sit down',
];

export const payment = {
  methods: 'UPI or cash. No card machine yet.',
  cancellation: 'Plans change — message us and the bay goes back on the floor.',
};
