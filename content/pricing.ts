/** PLACEHOLDER RATES. Replace from the Pricing and Passes tabs before launch. */

export type Rate = {
  id: string;
  label: string;
  amount: number;
  unit: string;
  when: string;
  highlight?: boolean;
};

export const rates: Rate[] = [
  {
    id: 'off-peak',
    label: 'Off-peak',
    amount: 90,
    unit: '/hr',
    when: 'Mon–Fri, 1–5 pm. Any standard bay.',
    highlight: true,
  },
  { id: 'standard', label: 'Standard', amount: 120, unit: '/hr', when: 'Mon–Fri, 5 pm onwards.' },
  { id: 'weekend', label: 'Weekend', amount: 150, unit: '/hr', when: 'Sat & Sun, all day.' },
  {
    id: 'pass-10',
    label: '10-hour pass',
    amount: 999,
    unit: '',
    when: 'Works out to ₹100 an hour. Valid 3 months.',
  },
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
export const standardHour = rates.find((r) => r.id === 'standard')?.amount ?? 120;
export const dearestHour = Math.max(...hourly.map((r) => r.amount));
/** The condition the cheapest figure comes with; never quote one without the other. */
export const cheapestHourWhen = 'on a weekday afternoon';

export type BayRate = {
  station: string;
  players: string;
  weekday: number;
  weekend: number;
  offPeak: number | null;
};

export const bayRates: BayRate[] = [
  { station: 'Bay 01 · 02 · 03 · 05', players: '1–2', weekday: 120, weekend: 150, offPeak: 90 },
  { station: 'The Recliner', players: '1–2', weekday: 250, weekend: 300, offPeak: 190 },
  { station: 'Whole lounge', players: 'up to 10', weekday: 1200, weekend: 1500, offPeak: null },
];

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
  'Air conditioning and water, both on the house',
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
