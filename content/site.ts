/**
 * The business details, feeding the visible pages, the structured data and the
 * sitemap from one place so nothing can drift out of sync.
 *
 * Confirmed: the address and the phone number. Still to confirm before the site
 * is indexed, each marked TO CONFIRM below: the domain, the email, the
 * Instagram handle and the Maps pin. A placeholder is left as an obvious
 * placeholder rather than dressed up as real.
 */

export const site = {
  name: 'LvlUp',
  legalName: 'LvlUp Gaming Lounge',
  tagline: 'PlayStation 5 by the hour',

  /**
   * Both strings below carry the price figures by hand, because meta text
   * has to read as a sentence rather than as an interpolation. It has to match
   * `cheapestHour` in content/pricing.ts — change the rate card and change these.
   * `shortDescription` is not rendered anywhere yet; it is here for the day a
   * card or a share sheet needs the tagline-length version.
   */
  description:
    'A PS5 lounge in Nadiad, Gujarat. Big screens, controllers cleaned between sessions. ₹150 an hour for one player, ₹250 for two, ₹350 for three, ₹450 for four — one bill for the bay.',
  shortDescription: 'PS5 by the hour in Nadiad, Gujarat. From ₹150.',

  /** TO CONFIRM: the real domain. Used for canonicals and OG tags, and the
   * reason SITE_INDEXABLE stays off — a canonical pointing at .example would
   * teach search engines the wrong home. */
  url: 'https://lvlup-lounge.example',

  phone: '+918401665488',
  phoneDisplay: '+91 84016 65488',
  whatsapp: '918401665488',
  /** TO CONFIRM. Null, not a made-up address: a dead mailbox in the structured
   * data sends enquiries nowhere, and WhatsApp is the booking channel anyway. */
  email: null as string | null,

  /*
   * From the lease dated 17/09/2026: offices 332-333, third floor, Nadiad Nexus-I,
   * 640 sq ft, taken for 11 months from 15/10/2026. TO CONFIRM before launch:
   * the road Nexus-I stands on, the building's own PIN (387001 is the one on the
   * lease's Nadiad address), and the Google Maps pin for `geo`.
   */
  address: {
    line1: 'Office 332–333, Third floor',
    line2: 'Nadiad Nexus-I',
    locality: 'Nadiad Nexus-I',
    city: 'Nadiad',
    region: 'Gujarat',
    postalCode: '387001',
    country: 'IN',
  },

  landmark: 'Third floor of Nadiad Nexus-I',
  transit: 'Lift to the third floor, offices 332–333',
  /** Null until the real pin is known: wrong coordinates send people to the wrong street. */
  geo: null as { lat: number; lng: number } | null,
  mapsUrl: 'https://maps.google.com/?q=Nadiad+Nexus-I%2C+Nadiad%2C+Gujarat',

  /** TO CONFIRM: that this handle is the lounge's own. */
  instagram: 'https://instagram.com/lvlup.lounge',
  instagramHandle: '@lvlup.lounge',

  /**
   * Null until Google shows one. It used to read 4.7 from 23 reviews, which was
   * invented; it drove both the hero stat and the AggregateRating markup. Set it
   * from the real Google figure at the same time as filling content/reviews.ts.
   */
  rating: null as { value: number; count: number } | null,
  priceRange: '₹₹',
  currency: 'INR',

  /** Four bean bags to a bay, three bays. */
  seats: 12,
  bays: 3,
} as const;

/**
 * The embedded map, or null.
 *
 * Only built once `site.geo` holds the real pin. An embed driven by a text
 * search would centre on whatever Google decides "Nadiad Nexus-I" means, and a
 * map showing the wrong building is worse than no map at all — so until the pin
 * is known the page shows the address and a Maps link instead.
 */
export const mapEmbedUrl: string | null = site.geo
  ? `https://maps.google.com/maps?q=${site.geo.lat},${site.geo.lng}&z=17&output=embed`
  : null;

export const addressLines = [
  site.address.line1,
  `${site.address.line2}, ${site.address.city} ${site.address.postalCode}`,
];

/** Prefills the booking conversation rather than dumping the visitor into an empty chat. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const bookingMessage = `Hi ${site.name}, I'd like to book a bay. `;
export const partyMessage = `Hi ${site.name}, I'd like to ask about booking the whole lounge. `;
