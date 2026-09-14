'use client';

import type { ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { bookingMessage, whatsappLink } from '@/content/site';

declare global {
  interface Window {
    /** Vercel Analytics, present only once its script has loaded. */
    va?: (event: string, properties?: Record<string, unknown>) => void;
  }
}

type BookButtonProps = {
  message?: string;
  variant?: 'primary' | 'ghost';
  size?: 'md' | 'lg';
  className?: string;
  children?: ReactNode;
};

/**
 * One booking event, dispatched on the window so any listener can pick it up,
 * and forwarded to analytics only when that script actually arrived.
 */
function trackBooking(detail: { message: string; label: string }) {
  window.dispatchEvent(new CustomEvent('lvlup:book', { detail }));
  window.va?.('event', { name: 'book_whatsapp', ...detail });
}

export function BookButton({
  message,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: BookButtonProps) {
  const text = message ?? bookingMessage;
  const label = typeof children === 'string' ? children : 'Book on WhatsApp';

  return (
    <a
      href={whatsappLink(text)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackBooking({ message: text, label })}
      className={buttonClass(variant, size, className)}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M20.4 11.7a8.4 8.4 0 0 1-12.3 7.4l-4.6 1.4 1.4-4.5A8.4 8.4 0 1 1 20.4 11.7Z" />
        <path d="M9.1 8.4c.3-.6 1-.6 1.3 0l.6 1.4a1 1 0 0 1-.2 1l-.4.4a5.6 5.6 0 0 0 2.5 2.5l.4-.4a1 1 0 0 1 1-.2l1.4.6c.6.3.6 1 0 1.3a3 3 0 0 1-2.7.2 8.8 8.8 0 0 1-4.5-4.5 3 3 0 0 1 .1-2.3Z" />
      </svg>
      {children ?? 'Book on WhatsApp'}
    </a>
  );
}
