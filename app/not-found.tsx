import { buttonClass } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="shell flex min-h-[100dvh] flex-col justify-center gap-6 py-32">
      <p className="eyebrow text-accent">Error 404</p>
      <h1 className="display">
        <span className="block">Game</span>{' '}
        <span className="block">over</span>
      </h1>
      <p className="max-w-[40ch] text-dim">This page does not exist. The lounge still does.</p>
      <Link href="/" className={buttonClass('primary', 'lg', 'self-start')}>
        Continue
      </Link>
    </section>
  );
}
