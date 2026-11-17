'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { preload } from 'react-dom';

import { activeChapter, sceneStatus } from '@/lib/experience-store';
import { useSignal } from '@/lib/use-signal';

import type { Quality } from './formations';

/**
 * The fixed stage behind every chapter, and the gate in front of three.js.
 *
 * This file must not import three. The canvas chunk is only requested once the
 * checks below pass, so a reduced-motion or save-data visitor never downloads
 * it and gets the painted grid instead — the page reads the same either way,
 * because nothing the scene draws carries information.
 *
 * Unlike v1, phones get the scene too: it is the point of this version. They
 * get the low tier — coarser voxels, no bloom, a lower pixel ratio.
 */
const ExperienceCanvas = dynamic(() => import('./experience-canvas').then((m) => m.ExperienceCanvas), {
  ssr: false,
});

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

function chooseQuality(): Quality | null {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const nav = navigator as NavigatorWithHints;
  if (nav.connection?.saveData) return null;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 2) return null;

  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return null;
  probe.getExtension('WEBGL_lose_context')?.loseContext();

  // Screen size and input only. Core and memory counts are not trusted: Brave and other
  // privacy browsers report randomised values, which put fast laptops on the low tier (no
  // bloom at all). A machine that really cannot keep up is caught by the scene's
  // frame-rate check instead, which steps effects down one at a time.
  const small = window.innerWidth < 1024 || window.matchMedia('(pointer: coarse)').matches;

  return small ? 'low' : 'high';
}

/**
 * The low tier, in CSS: the same test as `chooseQuality` (narrow or touch). The
 * still is painted for it from the prerender on, so a phone's first paint already
 * has its console and the image can be preloaded — desktop keeps today's empty stage
 * until the scene lights.
 */
const LOW_TIER_MEDIA = '(max-width: 1023.98px), (pointer: coarse)';
const STILL = '/stills/console.webp';

export function Experience() {
  // on a phone the still is the largest thing on the first screen, so fetch it with the HTML
  preload(STILL, { as: 'image', fetchPriority: 'high', media: LOW_TIER_MEDIA });

  const [quality, setQuality] = useState<Quality | null>(null);
  const status = useSignal(sceneStatus, 'pending');
  const chapter = useSignal(activeChapter, 0);

  useEffect(() => {
    const chosen = chooseQuality();
    if (!chosen) {
      sceneStatus.set('off');
      return;
    }
    // Start three.js once the browser is idle, not during first paint: the headline and
    // copy paint and become interactive first, and the scene fades in behind them.
    const begin = () => setQuality(chosen);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(begin, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(begin, 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div data-experience aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-room">
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${status === 'ready' ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="stage-glow absolute inset-0" />
        <div className="stage-grid absolute inset-x-[-50%] bottom-0 h-[55%]" />
        {/*
          No scene at all (reduced motion, no WebGL, save-data): the opening chapter
          still shows its console, as a still rendered by the same Blender build.
          Phones also show it while the scene is pending, and it fades out with this
          layer as the canvas fades in on the first frame. On desktop the pending stage
          stays as it was (glow and grid only): `stage-still-low` hides it there.
        */}
        <div
          className={`${status === 'off' ? '' : 'stage-still-low '}absolute left-1/2 top-[26%] w-[52vw] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 lg:left-auto lg:right-[10%] lg:top-1/2 lg:w-[min(28vw,30rem)] lg:translate-x-0 ${
            chapter === 0 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* the same glow the scene gives the console, painted: a pool behind it and a halo on its edge */}
          <div className="stage-still-glow absolute inset-[-12%]" />
          <img
            src={STILL}
            alt=""
            width={1000}
            height={1250}
            className="relative w-full [filter:drop-shadow(0_0_18px_rgb(var(--ch-accent)/0.35))_drop-shadow(0_0_60px_rgb(var(--ch-lamp)/0.25))]"
          />
        </div>
      </div>
      <div data-stage-layer className="absolute inset-0">
        {quality ? <ExperienceCanvas quality={quality} /> : null}
      </div>
      <div className="stage-scrim absolute inset-0" />
    </div>
  );
}
