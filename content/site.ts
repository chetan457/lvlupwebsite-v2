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
   * Both strings below carry the "from ₹90" figure by hand, because meta text
   * has to read as a sentence rather than as an interpolation. It has to match
   * `cheapestHour` in content/pricing.ts — change the rate card and change these.
   * `shortDescription` is not rendered anywhere yet; it is here for the day a
   * card or a share sheet needs the tagline-length version.
   */
  description:
    'A PS5 lounge in Kalyani Nagar, Pune. 5 bays, big screens, controllers cleaned between sessions. Book by the hour from ₹90 on a weekday afternoon, or take the whole room for a party.',
  shortDescription: 'PS5 by the hour in Kalyani Nagar, Pune. From ₹90.',

  /** Set to the real domain before launch; used for canonicals and OG tags. */
  url: 'https://lvlup-lounge.example',

  phone: '+918401665488',
  phoneDisplay: '+91 84016 65488',
  whatsapp: '918401665488',
  email: 'bookings@lvlup-lounge.example',

  address: {
    line1: 'Shop 4, First floor, Meridian Plaza',
    line2: 'Lane 6, Kalyani Nagar',
    locality: 'Kalyani Nagar',
    city: 'Pune',
    region: 'Maharashtra',
    postalCode: '411006',
    country: 'IN',
  },

  landmark: 'Above Kayani Bakery, opposite the HP pump',
  transit: '3 min from Ramwadi metro',
  geo: { lat: 18.5484, lng: 73.9042 },
  mapsUrl: 'https://maps.google.com/?q=Kalyani+Nagar+Pune',

  instagram: 'https://instagram.com/lvlup.lounge',
  instagramHandle: '@lvlup.lounge',

  rating: { value: 4.7, count: 23 },
  priceRange: '₹₹',
  currency: 'INR',

  seats: 10,
  bays: 5,
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
