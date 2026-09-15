/**
 * Whether search engines may index this build.
 *
 * Off unless SITE_INDEXABLE=true is set at build time. v2 still carries
 * placeholder business details and placeholder reviews (which feed the rating
 * markup), and it shares every word of copy with v1 — so a stray deploy must not
 * be crawled. Flip it on for the production build once content/ holds real data.
 */
export const indexable = process.env.SITE_INDEXABLE === 'true';
