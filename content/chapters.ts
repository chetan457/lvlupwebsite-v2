import { games, platform, type Game } from '@/content/games';
import {
  buyout,
  cheapestHour,
  cheapestHourWhen,
  dearestHour,
  included,
  payment,
  rates,
  standardHour,
} from '@/content/pricing';
import { faqs } from '@/content/reviews';
import { bookingMessage, partyMessage, site } from '@/content/site';
import { liveStations, soonStations, stations } from '@/content/stations';

/**
 * The home page as a run of levels.
 *
 * Every chapter has the same three beats — a title card, a brief, and a row of
 * slides — and each one owns a voxel formation in the scene, in this order:
 * controller, bays, tunnel, rate pillars, trophy. The finale (the pin) lives in
 * components/finale.tsx because it carries hours and reviews instead of slides.
 *
 * Every figure is derived from the content files, so v2 cannot quote a rate or
 * a seat count that v1 does not.
 */

export type Slide = {
  id: string;
  kicker: string;
  title: string;
  body?: string;
  stat?: { label: string; value: string };
  tag?: 'live' | 'soon' | 'best';
  /** Set on the game rack: the card renders as v1's game case, cover art and all. */
  game?: Game;
};

export type Chapter = {
  id: string;
  /** Short label for the menu and the level HUD. */
  nav: string;
  overline: string;
  /** One entry per display line. */
  title: string[];
  heading: string;
  body: string;
  stats: { label: string; value: string }[];
  slidesLabel: string;
  slidesUnit: string;
  slides: Slide[];
  cta: { label: string; message?: string };
};

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
const answer = (start: string) => faqs.find((faq) => faq.question.startsWith(start))?.answer ?? '';

const liveRates = liveStations.map((s) => s.rate).filter((r): r is number => r !== null);
const hourly = rates.filter((rate) => rate.unit === '/hr');

export const chapters: Chapter[] = [
  {
    id: 'start',
    nav: 'Start',
    overline: 'Press start',
    title: ['PS5 by', 'the hour'],
    heading: `${site.bays} PS5 bays on the third floor of ${site.address.line2}, ${site.address.city} — 65-inch screens, bean bags, and the game already installed when you sit down.`,
    body: `${rupees(cheapestHour)} an hour on your own, ${rupees(standardHour)} for two, ${rupees(dearestHour)} with four pads going. Walk in on a weekday afternoon, or send one WhatsApp for an evening and we will keep a bay aside — tell us the day, the time and how many of you.`,
    stats: [
      { label: 'From', value: `${rupees(cheapestHour)}/hr ${cheapestHourWhen}` },
      { label: 'Capacity', value: `${site.bays} bays · ${site.seats} seats` },
      { label: 'Getting here', value: site.transit },
    ],
    slidesLabel: 'How a session works',
    slidesUnit: 'steps',
    slides: [
      {
        id: 'message',
        kicker: 'WhatsApp',
        title: 'Message before you leave',
        body: answer('Do I need to book'),
      },
      {
        id: 'sit-down',
        kicker: 'Setup',
        title: 'Sit down and play',
        body: `${included[2]}. Four pads on every bay, so nobody waits their turn.`,
      },
      {
        id: 'on-the-house',
        kicker: 'On the house',
        title: 'Free Wi-Fi',
        body: `${included[1]}. ${included[0]}.`,
      },
      {
        id: 'pay',
        kicker: 'UPI or cash',
        title: 'Pay at the counter',
        body: `${payment.methods} ${payment.cancellation}`,
      },
    ],
    cta: { label: 'Book on WhatsApp' },
  },
  {
    id: 'bays',
    nav: 'Bays',
    overline: 'Character select',
    title: ['Pick', 'your bay'],
    heading: 'Three bays, each one the full setup.',
    body: 'A PS5, a 65-inch screen and bean bags on every bay, with four pads so nobody sits out. Book one for the group or take it alone.',
    stats: [
      { label: 'Live now', value: `${liveStations.length} bays` },
      { label: 'Screens', value: '65-inch, one each' },
      // only shown once there is something to announce; an empty "coming soon" reads as a gap
      ...(soonStations.length
        ? [{ label: 'Coming soon', value: soonStations.map((s) => s.name).join(', ') }]
        : [{ label: 'Per bay', value: `from ${rupees(Math.min(...liveRates))}/hr` }]),
    ],
    slidesLabel: 'The stations',
    slidesUnit: 'stations',
    slides: stations.map((station) => ({
      id: station.id,
      kicker: station.specs.slice(0, 3).join(' · '),
      title: station.name,
      body: station.blurb,
      stat:
        station.rate === null
          ? { label: 'Rate', value: 'Soon' }
          : { label: `Up to ${station.seats}`, value: `from ${rupees(station.rate)}/hr` },
      tag: station.status,
    })),
    cta: { label: 'Hold a bay' },
  },
  {
    id: 'games',
    nav: 'Games',
    overline: 'Game library',
    title: ['Pick', 'a game'],
    heading: `${games.length} ${platform} titles, installed and patched before you sit down.`,
    body: answer('What can I play'),
    stats: [
      { label: 'Platform', value: platform },
      { label: 'Four-player', value: `${games.filter((g) => g.players.endsWith('4')).length} titles` },
      { label: 'Not on the rack', value: 'Ask ahead' },
    ],
    slidesLabel: 'On the rack',
    slidesUnit: 'titles',
    slides: games.map((game) => ({
      id: game.slug,
      kicker: `${game.players} ${game.players === '1' ? 'player' : 'players'}`,
      title: game.title,
      body: game.note,
      game,
    })),
    cta: {
      label: 'Ask for a title',
      message: `Hi ${site.name}, can you install a game before my booking? `,
    },
  },
  {
    id: 'rates',
    nav: 'Rates',
    overline: 'Level up',
    title: ['Rates by', 'the hour'],
    heading: 'One bill for the bay. The price follows the group.',
    body: answer('Is the rate per person'),
    stats: hourly.map((rate) => ({ label: rate.label, value: `${rupees(rate.amount)}/hr` })),
    slidesLabel: 'The rate card',
    slidesUnit: 'prices',
    slides: [
      ...hourly.map<Slide>((rate) => ({
        id: rate.id,
        kicker: 'Per hour, one bill',
        title: rate.label,
        body: rate.when,
        stat: { label: 'Rate', value: `${rupees(rate.amount)}/hr` },
        tag: rate.highlight ? 'best' : undefined,
      })),
    ],
    cta: { label: 'Book a bay', message: bookingMessage },
  },
  {
    id: 'parties',
    nav: 'Parties',
    overline: 'Boss level',
    title: ['Take the', 'whole room'],
    heading: `All ${buyout.bays} bays and ${buyout.seats} seats, for ${rupees(buyout.ratePerHour)} an hour.`,
    body: `That is every bay at its four-player rate — booking the room costs the same as booking each bay full, so there is no party price to haggle over. Message us the date and how many are coming and we will tell you straight away whether it is free.`,
    stats: [
      { label: 'Whole room', value: `${rupees(buyout.ratePerHour)}/hr` },
      { label: 'Seats', value: String(buyout.seats) },
      { label: 'Bays', value: String(buyout.bays) },
    ],
    slidesLabel: 'Booking the room',
    slidesUnit: 'things to know',
    slides: [
      {
        id: 'buyout',
        kicker: `${buyout.bays} bays · ${buyout.seats} seats`,
        title: 'The whole lounge',
        body: `Every bay at once, ${rupees(dearestHour)} each per hour. Nobody else in the room.`,
        stat: { label: 'Per hour', value: rupees(buyout.ratePerHour) },
        tag: 'best',
      },
      {
        id: 'bracket',
        kicker: 'If you want one',
        title: 'Run a bracket',
        body: 'FC, Tekken or WWE, names on the board and the loser hands over the pad. We set it up and keep score.',
      },
      ...buyout.includes.map<Slide>((item, i) => ({
        id: `includes-${i}`,
        kicker: 'Included',
        title: item,
      })),
      {
        id: 'ask',
        kicker: 'Before you plan around it',
        title: 'Check the date first',
        body: 'One WhatsApp with the date and the number of people. We hold it once we have both.',
      },
    ],
    cta: { label: 'Ask about a date', message: partyMessage },
  },
];

/** Menu and HUD entries: every chapter, then the finale. */
export const chapterNav = [
  ...chapters.map((chapter) => ({ id: chapter.id, label: chapter.nav })),
  { id: 'find', label: 'Find us' },
];
