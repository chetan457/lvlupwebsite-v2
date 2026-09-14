import type { PhotoKey } from './images';

/** PLACEHOLDER INVENTORY. Replace from the Stations tab of the spreadsheet. */

export type Station = {
  id: string;
  name: string;
  /** 'live' is bookable today; 'soon' is announced but not sold. */
  status: 'live' | 'soon';
  kind: 'PS5' | 'Racing' | 'PC';
  /** Rupees per hour. Null while a station is still being built. */
  rate: number | null;
  seats: number;
  blurb: string;
  specs: string[];
  photo: PhotoKey;
  /** Feature tiles take the large slot in the bento grid. */
  feature?: boolean;
};

export const stations: Station[] = [
  {
    id: 'recliner',
    name: 'The Recliner',
    status: 'live',
    kind: 'PS5',
    rate: 250,
    seats: 2,
    blurb:
      'The bay that goes first at the weekend. 2 full recliners, a 65-inch OLED at eye level and the only bay with its own sound bar instead of headsets.',
    specs: ['PS5 Pro', '65" OLED · 120Hz', '2 recliners', 'Sound bar', 'Private corner'],
    photo: 'recliner',
    feature: true,
  },
  {
    id: 'bay-01-02',
    name: 'Bay 01 · 02',
    status: 'live',
    kind: 'PS5',
    rate: 120,
    seats: 4,
    blurb:
      '2 bays side by side, close enough that you watch the other screen between rounds. Best for couch co-op and anyone who turned up with one friend.',
    specs: ['PS5', '55" 4K · 120Hz', '2 seats each', '4 controllers'],
    photo: 'couchCoop',
  },
  {
    id: 'bay-03',
    name: 'Bay 03',
    status: 'live',
    kind: 'PS5',
    rate: 120,
    seats: 2,
    blurb:
      'The back corner, furthest from the door. The counter noise and the lane outside both drop away here, which is why people who come alone to finish a story sit here.',
    specs: ['PS5', '55" 4K', '2 seats'],
    photo: 'controller',
  },
  {
    id: 'bay-05',
    name: 'Bay 05',
    status: 'live',
    kind: 'PS5',
    rate: 120,
    seats: 2,
    blurb:
      'Nearest the counter, so it is the easiest one to grab without booking. You will hear us on the phone; that is the trade.',
    specs: ['PS5', '55" 4K', '2 seats'],
    photo: 'console',
  },
  {
    id: 'racing-rig',
    name: 'Racing rig',
    status: 'soon',
    kind: 'Racing',
    rate: null,
    seats: 1,
    blurb:
      'Wheel, pedals and a bucket seat, bolted to a frame rather than clamped to a table. You sit low in it, the way you would in the car.',
    specs: ['Force feedback wheel', 'Bucket seat'],
    photo: 'racing',
  },
  {
    id: 'pc-bay',
    name: 'PC bay',
    status: 'soon',
    kind: 'PC',
    rate: null,
    seats: 1,
    blurb: '240Hz panel and wired peripherals for the Valorant and CS crowd. One seat, upright, no couch.',
    specs: ['240Hz', 'Wired peripherals'],
    photo: 'pc',
  },
];

export const liveStations = stations.filter((s) => s.status === 'live');
export const soonStations = stations.filter((s) => s.status === 'soon');

/** The "from ₹X" figure quoted across the site. Derived, never hand-typed twice. */
export const lowestRate = Math.min(
  ...liveStations.map((s) => s.rate).filter((r): r is number => r !== null),
);
