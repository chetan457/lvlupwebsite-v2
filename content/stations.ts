import type { PhotoKey } from './images';

/**
 * The real floor: three PS5 bays, each with a 65-inch screen and bean bags.
 *
 * They are deliberately described as the same thing three times, because they
 * are. Inventing a "quiet corner" or a "weekend favourite" to make the cards
 * read differently would be a promise about a room the visitor has not seen.
 */

export type Station = {
  id: string;
  name: string;
  /** 'live' is bookable today; 'soon' is announced but not sold. */
  status: 'live' | 'soon';
  kind: 'PS5' | 'Racing' | 'PC';
  /** Rupees for the cheapest hour on this bay — one player. Null while a station is still being built. */
  rate: number | null;
  /** How many can play at once. The rate card in content/pricing.ts prices each head. */
  seats: number;
  blurb: string;
  specs: string[];
  photo: PhotoKey;
  /** Feature tiles take the large slot in the bento grid. */
  feature?: boolean;
};

export const stations: Station[] = [
  {
    id: 'bay-01',
    name: 'Bay 01',
    status: 'live',
    kind: 'PS5',
    rate: 150,
    seats: 4,
    blurb:
      'A PS5, a 65-inch screen and bean bags you sink into. Four pads, so the whole group plays rather than taking turns watching.',
    specs: ['PS5', '65" screen', 'Bean bags', '4 controllers'],
    photo: 'couchCoop',
    feature: true,
  },
  {
    id: 'bay-02',
    name: 'Bay 02',
    status: 'live',
    kind: 'PS5',
    rate: 150,
    seats: 4,
    blurb:
      'The same setup as the others — 65-inch screen, bean bags, four pads. Nothing about the bay decides your night; the game does.',
    specs: ['PS5', '65" screen', 'Bean bags', '4 controllers'],
    photo: 'controller',
  },
  {
    id: 'bay-03',
    name: 'Bay 03',
    status: 'live',
    kind: 'PS5',
    rate: 150,
    seats: 4,
    blurb:
      'PS5, 65-inch screen, bean bags, four pads. Book it for a group or take it alone and stretch out.',
    specs: ['PS5', '65" screen', 'Bean bags', '4 controllers'],
    photo: 'console',
  },
];

export const liveStations = stations.filter((s) => s.status === 'live');
export const soonStations = stations.filter((s) => s.status === 'soon');

/** The "from ₹X" figure quoted across the site. Derived, never hand-typed twice. */
export const lowestRate = Math.min(
  ...liveStations.map((s) => s.rate).filter((r): r is number => r !== null),
);
