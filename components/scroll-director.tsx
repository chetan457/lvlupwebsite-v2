'use client';

import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { useEffect } from 'react';

import { TUNNEL_INDEX } from '@/components/experience/formations';
import { activeChapter, bootDone, experience, menuOpen } from '@/lib/experience-store';
import { lockScroll, registerScroller } from '@/lib/smooth';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

/** How far the camera flies down the tunnel across the games chapter, in world units. */
const TUNNEL_FLIGHT = 90;

/**
 * All scroll choreography in one place. Renders nothing.
 *
 * Order matters here: pins are created first, because a pin adds scroll length
 * and every trigger below it has to measure against the page with that length
 * already in it.
 */
export function ScrollDirector() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cleanups: (() => void)[] = [];

    if (!reduced) {
      const lenis = new Lenis({ autoRaf: false, lerp: 0.1 });
      const raf = (time: number) => lenis.raf(time * 1000);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      registerScroller(lenis);

      cleanups.push(() => {
        gsap.ticker.remove(raf);
        registerScroller(null);
        lenis.destroy();
      });
    }

    cleanups.push(menuOpen.subscribe(() => lockScroll(menuOpen.get())));

    const chapters = gsap.utils.toArray<HTMLElement>('[data-chapter]');
    const mm = gsap.matchMedia();

    // 1. Pinned slide rows, desktop only. Vertical scroll drives the row sideways.
    mm.add('(min-width: 64rem) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      gsap.utils.toArray<HTMLElement>('[data-slides]').forEach((wrap) => {
        const track = wrap.querySelector<HTMLElement>('[data-track]');
        if (!track) return;
        const distance = () => Math.max(0, track.scrollWidth - wrap.clientWidth);

        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: wrap,
            start: 'top top',
            // the row moves faster than the page scrolls: a one-to-one pin made the
            // twelve-game rack alone 4,600px of scrolling
            end: () => `+=${distance() * 0.65}`,
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
          },
        });
      });
    });

    const ctx = gsap.context(() => {
      // 2. Scene: each chapter's arrival carries the voxels from the previous formation to its own.
      const arrivals = chapters.map(() => 0);
      const publish = () => {
        experience.progress = arrivals.reduce((sum, value) => sum + value, 0);
      };

      chapters.forEach((section, i) => {
        if (i > 0) {
          ScrollTrigger.create({
            trigger: section,
            start: 'top bottom',
            end: 'top 25%',
            onUpdate: (self) => {
              arrivals[i] = self.progress;
              publish();
            },
            onRefresh: (self) => {
              arrivals[i] = self.progress;
              publish();
            },
          });
        }

        ScrollTrigger.create({
          trigger: section,
          start: 'top 50%',
          end: 'bottom 50%',
          onToggle: (self) => {
            if (self.isActive) activeChapter.set(i);
          },
        });
      });

      // Phones: the copy scrolls straight over the scene, so it steps back while the
      // reader is in a chapter's text and returns for the next title card.
      const titlesInView = new Set<Element>();
      document.documentElement.dataset.stage = 'title';
      chapters.forEach((section) => {
        const title = section.firstElementChild;
        if (!title) return;
        ScrollTrigger.create({
          trigger: title,
          start: 'top 85%',
          end: 'bottom 35%',
          onToggle: (self) => {
            if (self.isActive) titlesInView.add(title);
            else titlesInView.delete(title);
            document.documentElement.dataset.stage = titlesInView.size ? 'title' : 'text';
          },
        });
      });
      cleanups.push(() => {
        delete document.documentElement.dataset.stage;
      });

      const tunnel = chapters[TUNNEL_INDEX];
      if (tunnel) {
        ScrollTrigger.create({
          trigger: tunnel,
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: (self) => {
            experience.flow = self.progress * TUNNEL_FLIGHT;
          },
        });
      }

      if (reduced) return;

      // 3. Type. The first chapter's title waits for the boot screen to lift.
      const intro = document.querySelector('[data-intro]');
      const waiting: gsap.core.Animation[] = [];
      const holdForBoot = (el: Element) => Boolean(intro?.contains(el)) && !bootDone.get();

      gsap.utils.toArray<HTMLElement>('[data-split]').forEach((el) => {
        SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          autoSplit: true,
          onSplit(self) {
            const held = holdForBoot(el);
            const tween = gsap.from(self.lines, {
              yPercent: 110,
              duration: 1.25,
              ease: 'expo.out',
              stagger: 0.09,
              delay: held ? 0.25 : 0,
              paused: held,
              scrollTrigger: intro?.contains(el) ? undefined : { trigger: el, start: 'top 85%', once: true },
            });
            if (held) waiting.push(tween);
            return tween;
          },
        });
      });

      gsap.utils.toArray<HTMLElement>('[data-scramble]').forEach((el) => {
        const held = holdForBoot(el);
        const tween = gsap.to(el, {
          duration: 1.3,
          scrambleText: { text: el.textContent ?? '', chars: 'upperCase', revealDelay: 0.3, speed: 0.5 },
          paused: held,
          scrollTrigger: intro?.contains(el) ? undefined : { trigger: el, start: 'top 90%', once: true },
        });
        if (held) waiting.push(tween);
      });

      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        // opacity, never autoAlpha: autoAlpha sets visibility:hidden, which took every
        // button in the block out of the tab order until it happened to be scrolled to
        gsap.from(el, {
          y: 36,
          opacity: 0,
          duration: 1.05,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        });
      });

      // a keyboard user can land in a block before its reveal has played
      const onFocus = (event: FocusEvent) => {
        const block = (event.target as Element | null)?.closest?.('[data-reveal]');
        if (block) gsap.to(block, { opacity: 1, y: 0, duration: 0.3, overwrite: true });
      };
      document.addEventListener('focusin', onFocus);
      cleanups.push(() => document.removeEventListener('focusin', onFocus));

      if (waiting.length) {
        const release = bootDone.subscribe(() => {
          if (bootDone.get()) waiting.forEach((tween) => tween.play());
        });
        cleanups.push(release);
      }
    });

    // fonts change line lengths, and line lengths change every pin distance
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      ctx.revert();
      mm.revert();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
