import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Three weights, same as v1. The primary is notched like a HUD button; that
 * clip-path would also clip an outline, so it takes an inset focus ring instead.
 */
type Variant = 'primary' | 'ghost' | 'quiet';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2.5 font-mono font-medium uppercase tracking-[0.14em] ' +
  'transition-[transform,background-color,border-color,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ' +
  'active:scale-[0.98]';

const variants: Record<Variant, string> = {
  primary:
    'notch bg-lamp text-lamp-ink hover:bg-lamp-hi focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-paper)]',
  ghost:
    'border border-edge-hi bg-room/40 text-paper backdrop-blur-md hover:border-accent hover:text-accent',
  quiet: 'text-dim hover:text-paper',
};

const sizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-[0.72rem]',
  lg: 'min-h-13 px-6 text-[0.76rem]',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return [base, variants[variant], sizes[size], extra].filter(Boolean).join(' ');
}

type ButtonLinkProps = {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<'a'>, 'href' | 'className' | 'children'>;

export function ButtonLink({ href, variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonLinkProps) {
  const classes = buttonClass(variant, size, className);

  if (href.startsWith('http') || href.startsWith('tel:') || href.startsWith('mailto:')) {
    return (
      <a
        href={href}
        className={classes}
        {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
