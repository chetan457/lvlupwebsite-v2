import { ScreenSkeleton } from '@/components/admin/screen-skeleton';

/** Shown the instant this screen is tapped, while its data loads. */
export default function Loading() {
  return <ScreenSkeleton screen="day" />;
}
