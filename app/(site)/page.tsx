import { ChapterSection } from '@/components/chapter-section';
import { Experience } from '@/components/experience/experience';
import { Finale } from '@/components/finale';
import { ScrollDirector } from '@/components/scroll-director';
import { chapters } from '@/content/chapters';
import { jsonLd, reviewsSchema } from '@/lib/schema';

/**
 * Refreshed every ten minutes so the open badge and today's row in the hours
 * table stay close on first paint; the badge re-checks in the browser anyway.
 */
export const revalidate = 600;

export default function HomePage() {
  return (
    <>
      <Experience />
      {chapters.map((chapter, index) => (
        <ChapterSection key={chapter.id} chapter={chapter} index={index} />
      ))}
      <Finale index={chapters.length} />
      <ScrollDirector />
      {/* rating markup rides with the visible reviews in the finale */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(reviewsSchema()) }} />
    </>
  );
}
