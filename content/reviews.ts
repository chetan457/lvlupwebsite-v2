import { buyout, cheapestHour, payment, rates } from './pricing';
import { liveStations } from './stations';

/**
 * REVIEWS: empty, on purpose.
 *
 * This file used to carry three invented Google reviews, and content/site.ts a
 * 4.7 rating from 23 of them. They fed the AggregateRating markup, which makes
 * a fabricated rating a Google policy violation as well as a lie to a visitor
 * who has not been to the room yet. Paste real reviews in here — verbatim, with
 * the reviewer's own name — once the lounge has them, and set `site.rating` to
 * the figure Google shows. The reviews block and the rating markup both appear
 * only when this array is non-empty.
 */

export type Review = {
  name: string;
  stars: number;
  text: string;
  source: string;
};

export const reviews: Review[] = [];

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
const rate = (id: string) => rupees(rates.find((r) => r.id === id)?.amount ?? 0);

export type Faq = { question: string; answer: string };

/**
 * The visible FAQ, and the source of the FAQPage markup. Prices are
 * interpolated from the rate card rather than typed, so an answer cannot quote
 * a figure the rates chapter contradicts.
 */
export const faqs: Faq[] = [
  {
    question: 'Do I need to book ahead?',
    answer:
      'Not on a weekday afternoon — walk in and a bay is usually free. Evenings and weekends fill up, so send a WhatsApp before you leave home and we will keep a bay aside.',
  },
  {
    question: 'Is the rate per person or per bay?',
    answer: `Per hour, and it depends how many are playing: ${rate('solo')} for one, ${rate('duo')} for two, ${rate('trio')} for three, ${rate('squad')} for four. One bill for the bay, not a ticket each.`,
  },
  {
    question: 'What can I play?',
    answer:
      'PlayStation 5 only. Everything on the rack is installed and patched before you sit down. Ask for a title we do not stock and we will download it ahead of your slot.',
  },
  {
    question: 'How many can play at once?',
    answer: `${liveStations.length} bays, four pads and four bean bags on each, so ${buyout.seats} people can play at the same time. A bay is yours whether one of you turns up or four.`,
  },
  {
    question: 'Is there an age limit?',
    answer:
      'No upper limit. Under-12s are welcome with an adult along. We will not put on an 18-rated game for a child, whatever the group says.',
  },
  {
    question: 'Can I book the whole place?',
    answer: `Yes — all ${buyout.bays} bays and ${buyout.seats} seats at ${rupees(buyout.ratePerHour)} an hour, which is the same as booking each bay for four players. Message us with the date and we will check it is free.`,
  },
  {
    question: 'How do I pay?',
    answer: `${payment.methods} ${payment.cancellation}`,
  },
  {
    question: 'Where exactly is it?',
    answer:
      'Nadiad Nexus-I, third floor, offices 332–333. Take the lift to the third floor and you are at the door.',
  },
];

/**
 * House rules. Kept to things that are true of any room with a console in it —
 * the earlier list described a recliner platform the lounge does not have and
 * counted two years of broken controllers before it had opened.
 */
export const houseRules = [
  `Rates start at ${rupees(cheapestHour)} an hour and go up with the group, not with the clock.`,
  'Food and drink stay off the seats and off the pads.',
  'Break a controller and we charge what a new one costs us, nothing on top.',
  'Message us if you are running late and the bay waits; we cannot hold it without a word.',
];
