'use client';

import { useEffect, useRef, useState } from 'react';

import { sceneStatus } from '@/lib/experience-store';

import type { Quality } from './formations';
import { createScene } from './scene';

/** Mounts the scene once and fades it in on its first rendered frame. */
export function ExperienceCanvas({ quality }: { quality: Quality }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const dispose = createScene(host, quality, () => setLit(true));
    if (!dispose) {
      sceneStatus.set('off');
      return;
    }
    return dispose;
  }, [quality]);

  return (
    <div
      ref={hostRef}
      className={`absolute inset-0 transition-opacity duration-[1600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        lit ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}
