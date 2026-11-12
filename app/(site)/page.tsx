import { ChapterSection } from '@/components/chapter-section';
import { Experience } from '@/components/experience/experience';
import { Finale } from '@/components/finale';
import { ScrollDirector } from '@/components/scroll-director';
import { chapters } from '@/content/chapters';
import { faqSchema, jsonLd, reviewsSchema } from '@/lib/schema';

/**
 * Refreshed every ten minutes so the open badge and today's row in the hours
 * table stay close on first paint; the badge re-checks in the browser anyway.
 */
export const revalidate = 600;

export default function HomePage() {
  const rating = reviewsSchema();

  return (
    <>
      <Experience />
      {chapters.map((chapter, index) => (
        <ChapterSection key={chapter.id} chapter={chapter} index={index} />
      ))}
      <Finale index={chapters.length} />
      <ScrollDirector />
      {/* the FAQ is rendered in the finale, which is what entitles the page to
          FAQPage markup */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema()) }} />
      {/* rating markup rides with the visible reviews in the finale, and is null
          until there are real ones */}
      {rating ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(rating) }} /> : null}
    </>
  );
}
