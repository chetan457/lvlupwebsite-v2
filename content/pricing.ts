/**
 * The real hourly card, matching what the console charges (station_rates in
 * Supabase): the price is per hour and goes up with the size of the group.
 *
 * Everything BELOW the rate card — passes, bay rates, the buyout, the
 * tournament — is still placeholder and is not shown on the public page.
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
  { id: 'squad', label: 'Four players', amount: 450, unit: '/hr', when: 'Four pads, the full couch.' },
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
/** Two on a couch is the ordinary booking, so it is the figure to quote when one is needed. */
export const standardHour = rates.find((r) => r.id === 'duo')?.amount ?? 250;
export const dearestHour = Math.max(...hourly.map((r) => r.amount));
/** The condition the cheapest figure comes with; never quote one without the other. */
export const cheapestHourWhen = 'for one player';

export type BayRate = {
  station: string;
  players: string;
  weekday: number;
  weekend: number;
  offPeak: number | null;
};

/** PLACEHOLDER. Not rendered anywhere; the public card is `rates` above. */
export const bayRates: BayRate[] = [];

export type Pass = {
  id: string;
  name: string;
  includes: string;
  price: number;
  validity: string;
  saving: string;
};

export const passes: Pass[] = [
  {
    id: 'pass-10',
    name: '10-hour pass',
    includes: '10 hours on any standard PS5 bay',
    price: 999,
    validity: '3 months',
    saving: '₹100/hr instead of ₹120',
  },
  {
    id: 'pass-weekend',
    name: 'Weekend pass',
    includes: '5 weekend hours',
    price: 649,
    validity: '2 months',
    saving: '₹130/hr instead of ₹150',
  },
  {
    id: 'pass-month',
    name: 'Monthly regular',
    includes: '25 hours, any time',
    price: 2199,
    validity: '1 month',
    saving: '₹88/hr — the cheapest hour we sell',
  },
];

export const buyout = {
  rate: 1200,
  weekendRate: 1500,
  minimumHours: 2,
  seats: 10,
  deposit: 1000,
  includes: [
    'Every bay and every screen',
    'The sound system on your playlist',
    'An FC or Tekken bracket if you want one',
    'The counter cleared for cake',
  ],
};

export const tournament = {
  name: 'Saturday night FC bracket',
  entry: 200,
  format: '16 players, single elimination',
  prize: '₹2,000 pot plus 5 free hours',
  when: 'Every Saturday, 8 pm',
  /**
   * The anchor date the weekly recurrence repeats from. Required by the Event
   * markup, and the reason it has to be a real date rather than "every
   * Saturday" — move it forward when the season actually starts.
   */
  startDate: '2026-09-12T20:00:00+05:30',
  endDate: '2026-09-12T23:00:00+05:30',
  startTime: '20:00',
  endTime: '23:00',
};

export const included = [
  'Controllers, cleaned and charged between sessions',
  'Wi-Fi, free while you play',
  'Phone chargers, kept behind the counter',
  'Your game, installed and patched before you sit down',
];

export const notIncluded = [
  'Snacks and cold drinks, sold at the counter',
  'Headsets, rented at ₹20 a session',
];

export const payment = {
  methods: 'UPI or cash. No card machine yet.',
  cancellation:
    'Cancel a bay booking any time. Party bookings need 24 hours notice for the advance to come back.',
};
