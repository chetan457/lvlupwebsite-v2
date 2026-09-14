import { games, platform, type Game } from '@/content/games';
import { buyout, included, notIncluded, passes, payment, rates, standardHour, cheapestHour, tournament } from '@/content/pricing';
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
    heading: `A dark room in ${site.address.locality} with ${site.bays} bays, big screens and a rack of games already installed.`,
    body: `Walk in on a weekday afternoon from ${rupees(cheapestHour)} an hour. For an evening, message us first and we will hold a bay at ${rupees(standardHour)}.`,
    stats: [
      { label: 'Google rating', value: `${site.rating.value} · ${site.rating.count} reviews` },
      { label: 'Getting here', value: site.transit },
      { label: 'Capacity', value: `${site.bays} bays · ${site.seats} seats` },
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
        body: `${included[3]}. ${included[0]}.`,
      },
      {
        id: 'on-the-house',
        kicker: 'On the house',
        title: 'Cold room, free water',
        body: `${included[1]}. ${notIncluded[0]}.`,
      },
      {
        id: 'pay',
        kicker: 'UPI or cash',
        title: 'Pay at the counter',
        body: `${payment.methods} ${payment.cancellation}`,
      },
    ],
    cta: { label: 'Book a bay' },
  },
  {
    id: 'bays',
    nav: 'Bays',
    overline: 'Character select',
    title: ['Pick', 'your bay'],
    heading: 'Each bay suits a different kind of night.',
    body: 'The Recliner goes first at the weekend. Bays 01 and 02 sit side by side for couch co-op. Bay 03 is the quiet corner at the back, and Bay 05 is the one you can grab without booking.',
    stats: [
      { label: 'Live now', value: `${liveStations.length} stations` },
      { label: 'Per bay', value: `${rupees(Math.min(...liveRates))}–${rupees(Math.max(...liveRates))} /hr` },
      { label: 'Coming soon', value: soonStations.map((s) => s.name).join(', ') },
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
          : { label: `${station.seats} seats`, value: `${rupees(station.rate)}/hr` },
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
    title: ['Rates &', 'passes'],
    heading: 'Per bay, per hour. Not per person.',
    body: `${answer('Is the rate per person')} Regulars save more with a pass.`,
    stats: hourly.map((rate) => ({ label: rate.label, value: `${rupees(rate.amount)}/hr` })),
    slidesLabel: 'The rate card',
    slidesUnit: 'prices',
    slides: [
      ...hourly.map<Slide>((rate) => ({
        id: rate.id,
        kicker: 'Per bay, per hour',
        title: rate.label,
        body: rate.when,
        stat: { label: 'Rate', value: `${rupees(rate.amount)}/hr` },
        tag: rate.highlight ? 'best' : undefined,
      })),
      ...passes.map<Slide>((pass) => ({
        id: pass.id,
        kicker: `Valid ${pass.validity}`,
        title: pass.name,
        body: `${pass.includes}. ${pass.saving}.`,
        stat: { label: 'Price', value: rupees(pass.price) },
      })),
    ],
    cta: { label: 'Book a bay', message: bookingMessage },
  },
  {
    id: 'parties',
    nav: 'Parties',
    overline: 'Boss level',
    title: ['Take the', 'whole room'],
    heading: `Every bay, ${buyout.seats} seats and the sound system, on a ${buyout.minimumHours}-hour minimum.`,
    body: `${rupees(buyout.rate)} an hour on weekdays, ${rupees(buyout.weekendRate)} at the weekend. A ${rupees(buyout.deposit)} advance holds the date. Message us with the date and we will check it is free.`,
    stats: [
      { label: 'Seats', value: String(buyout.seats) },
      { label: 'Minimum', value: `${buyout.minimumHours} hours` },
      { label: 'Tournament', value: tournament.when },
    ],
    slidesLabel: 'Parties & brackets',
    slidesUnit: 'ways in',
    slides: [
      {
        id: 'buyout',
        kicker: `${buyout.minimumHours}-hour minimum`,
        title: 'Whole-lounge buyout',
        body: `Every bay and ${buyout.seats} seats. ${rupees(buyout.weekendRate)} an hour at the weekend.`,
        stat: { label: 'Weekday', value: `${rupees(buyout.rate)}/hr` },
        tag: 'best',
      },
      {
        id: 'tournament',
        kicker: tournament.when,
        title: tournament.name,
        body: `${tournament.format}. ${tournament.prize}.`,
        stat: { label: 'Entry', value: rupees(tournament.entry) },
      },
      ...buyout.includes.map<Slide>((item, i) => ({
        id: `includes-${i}`,
        kicker: 'In every buyout',
        title: item,
      })),
    ],
    cta: { label: 'Ask about a date', message: partyMessage },
  },
];

/** Menu and HUD entries: every chapter, then the finale. */
export const chapterNav = [
  ...chapters.map((chapter) => ({ id: chapter.id, label: chapter.nav })),
  { id: 'find', label: 'Find us' },
];
