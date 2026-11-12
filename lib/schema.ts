import { site } from '@/content/site';
import { hours } from '@/content/hours';
import { reviews, faqs, type Faq } from '@/content/reviews';
import { buyout, cheapestHour, cheapestHourWhen, dearestHour, rates } from '@/content/pricing';

/**
 * Structured data, generated from the same content files the pages render.
 * Nothing here is hand-typed, so the markup can never claim a price or an
 * opening time the visible page contradicts.
 */

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Schema.org wants "23:59" rather than "24:00" for a midnight close. */
function schemaTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  // 24:00 is the same instant as 00:00, which reads as "closes before it opens";
  // Google's guidance is to write a midnight close as 23:59 instead.
  if (h >= 24 && m === 0) return '23:59';
  const hour = h % 24;
  return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EntertainmentBusiness',
    '@id': `${site.url}/#business`,
    name: site.legalName,
    alternateName: site.name,
    description: site.description,
    url: site.url,
    telephone: site.phone,
    ...(site.email ? { email: site.email } : {}),
    priceRange: site.priceRange,
    currenciesAccepted: site.currency,
    paymentAccepted: 'UPI, Cash',
    image: `${site.url}/opengraph-image`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${site.address.line1}, ${site.address.line2}`,
      addressLocality: site.address.city,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    // omitted rather than guessed: a wrong pin in structured data misdirects Maps
    ...(site.geo ? { geo: { '@type': 'GeoCoordinates', latitude: site.geo.lat, longitude: site.geo.lng } } : {}),
    sameAs: [site.instagram],
    openingHoursSpecification: hours
      .filter((h) => h.opens && h.closes)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAY_NAMES[h.day]}`,
        opens: schemaTime(h.opens as string),
        closes: schemaTime(h.closes as string),
      })),
    makesOffer: [
      {
        '@type': 'Offer',
        name: 'PS5 bay, per hour',
        // the cheapest hour actually sellable, matching the "from" figure the
        // pages quote — pricing this at the cheapest BAY overstated it by a third
        description: `Per bay, not per person. Lowest rate ${cheapestHourWhen}.`,
        price: cheapestHour,
        priceCurrency: site.currency,
        availability: 'https://schema.org/InStock',
      },
      // one offer per tier of the visible rate card, so the markup and the page
      // quote the same four prices
      ...rates.map((rate) => ({
        '@type': 'Offer',
        name: `PS5 bay, ${rate.label.toLowerCase()}`,
        description: rate.when,
        price: rate.amount,
        priceCurrency: site.currency,
        availability: 'https://schema.org/InStock',
      })),
      {
        '@type': 'Offer',
        name: 'Whole-lounge booking, per hour',
        description: `All ${buyout.bays} bays and ${buyout.seats} seats — every bay at the ${dearestHour} four-player rate`,
        price: buyout.ratePerHour,
        priceCurrency: site.currency,
      },
    ],
  };
}

/**
 * Ratings live apart from the business node on purpose.
 *
 * The business identity is emitted from the root layout, so it appears on every
 * page. Rating markup must only appear where the reviews are actually visible —
 * Google issues manual actions for rating snippets with no on-page source — so
 * this half is rendered beside <Reviews /> on the home page alone. Sharing the
 * @id merges the two nodes back into one business.
 */
export function reviewsSchema() {
  // No rating markup without reviews on the page to back it: an AggregateRating
  // with nothing visible behind it earns a manual action, and with reviews empty
  // there would be nothing true to put in it.
  if (!reviews.length || !site.rating) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'EntertainmentBusiness',
    '@id': `${site.url}/#business`,
    name: site.legalName,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: site.rating.value,
      reviewCount: site.rating.count,
      bestRating: 5,
    },
    review: reviews.map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.name },
      reviewRating: { '@type': 'Rating', ratingValue: r.stars, bestRating: 5 },
      reviewBody: r.text,
    })),
  };
}

export function faqSchema(items: Faq[] = faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/*
 * tournamentSchema() lived here and emitted an Event for a weekly FC bracket
 * with a ₹200 entry and a ₹2,000 pot. No such event has been scheduled, and
 * Event markup for one that does not happen is exactly what Google's
 * spam policies are about. Write it again when there is a real first date.
 */

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${site.url}${item.path}`,
    })),
  };
}

/**
 * Renders JSON-LD. The payload is built from local content only, never from
 * user input, so there is nothing to escape beyond closing-tag safety.
 */
export function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
