/**
 * PLACEHOLDER BUSINESS DETAILS.
 * Everything here is stand-in content. Replace from the filled
 * LvlUp-business-info.xlsx before launch — this file feeds the visible pages,
 * the structured data and the sitemap, so nothing can drift out of sync.
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

  /** Set to the real domain before launch; used for canonicals and OG tags. */
  url: 'https://lvlup-lounge.example',

  phone: '+918401665488',
  phoneDisplay: '+91 84016 65488',
  whatsapp: '918401665488',
  email: 'bookings@lvlup-lounge.example',

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

  instagram: 'https://instagram.com/lvlup.lounge',
  instagramHandle: '@lvlup.lounge',

  rating: { value: 4.7, count: 23 },
  priceRange: '₹₹',
  currency: 'INR',

  /** Four bean bags to a bay, three bays. */
  seats: 12,
  bays: 3,
} as const;

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
