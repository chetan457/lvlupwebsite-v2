'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

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

export function Experience() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const status = useSignal(sceneStatus, 'pending');
  const chapter = useSignal(activeChapter, 0);

  useEffect(() => {
    const chosen = chooseQuality();
    if (!chosen) {
      sceneStatus.set('off');
      return;
    }
    setQuality(chosen);
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
          still shows its pad, as a still rendered by the same Blender build.
        */}
        {status === 'off' ? (
          <img
            src="/stills/controller.webp"
            alt=""
            width={1600}
            height={1000}
            decoding="async"
            className={`absolute right-[3%] top-1/2 hidden w-[min(50vw,56rem)] -translate-y-1/2 transition-opacity duration-700 lg:block ${
              chapter === 0 ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : null}
      </div>
      <div data-stage-layer className="absolute inset-0">
        {quality ? <ExperienceCanvas quality={quality} /> : null}
      </div>
      <div className="stage-scrim absolute inset-0" />
    </div>
  );
}
