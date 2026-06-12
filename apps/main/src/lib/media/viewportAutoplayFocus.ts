/**
 * Viewport Autoplay Focus
 *
 * On touch/coarse-pointer surfaces there is no hover, so gallery video cards
 * normally only play after an explicit tap.  This coordinator picks the single
 * card that is "most on screen" as you scroll and grants it a play signal, so
 * the focused clip auto-loops the way a desktop hover preview would.
 *
 * Election is GEOMETRIC, computed live against the viewport rather than from
 * IntersectionObserver ratios. A single-column mobile card is often TALLER than
 * the viewport, so its intersection ratio (visible fraction *of the card*) caps
 * well below 1 even when perfectly centered — a ratio threshold would never fire
 * for tall portraits. Instead we pick the eligible card whose center is nearest
 * the viewport center, preferring one that straddles the center line. Only that
 * card plays, so decoders never pile up (the global videoActivationPool cap is a
 * further backstop).
 *
 * Module-level singleton for the same reason as activeVideoRegistry: the
 * consumers are component effects with no shared React context, and the
 * observer/listener lifetimes are driven by mount/unmount.
 */

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { hmrSingleton } from '@lib/utils';

/**
 * A card is eligible to play only when at least this fraction of it is on
 * screen — measured against `min(cardHeight, viewportHeight)` so a card taller
 * than the viewport qualifies once it fills half the screen, while a short card
 * must be half-visible. Below this it is "scrolling past", so we play nothing.
 */
const MIN_VISIBLE_FRACTION = 0.5;

type Entry = {
  el: HTMLElement;
  onScreen: boolean;
  notify: (active: boolean) => void;
  active: boolean;
};

interface FocusState {
  entries: Map<symbol, Entry>;
  recomputeScheduled: boolean;
  listenersWired: boolean;
}

const state = hmrSingleton<FocusState>('viewportAutoplayFocus', () => ({
  entries: new Map<symbol, Entry>(),
  recomputeScheduled: false,
  listenersWired: false,
}));

function viewportHeight(): number {
  if (typeof window !== 'undefined' && window.innerHeight) return window.innerHeight;
  if (typeof document !== 'undefined') return document.documentElement.clientHeight;
  return 0;
}

/** Elect the winner and notify any subscriber whose active-ness changed. */
function recompute(): void {
  state.recomputeScheduled = false;

  const vh = viewportHeight();
  const center = vh / 2;

  let winner: symbol | null = null;
  // Sort key: prefer a card straddling the center line, then nearest center.
  let bestCovers = false;
  let bestDist = Infinity;

  for (const [id, e] of state.entries) {
    if (!e.onScreen) continue;
    const rect = e.el.getBoundingClientRect();
    if (rect.height <= 0) continue;

    const visibleH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const eligibleFloor = Math.min(rect.height, vh) * MIN_VISIBLE_FRACTION;
    if (visibleH < eligibleFloor) continue;

    const cardCenter = rect.top + rect.height / 2;
    const dist = Math.abs(cardCenter - center);
    const covers = rect.top <= center && rect.bottom >= center;

    // Covering cards win over non-covering; within a group, nearest center wins.
    const better =
      winner === null ||
      (covers && !bestCovers) ||
      (covers === bestCovers && dist < bestDist);
    if (better) {
      winner = id;
      bestCovers = covers;
      bestDist = dist;
    }
  }

  for (const [id, e] of state.entries) {
    const shouldBeActive = id === winner;
    if (e.active !== shouldBeActive) {
      e.active = shouldBeActive;
      e.notify(shouldBeActive);
    }
  }
}

function scheduleRecompute(): void {
  if (state.recomputeScheduled) return;
  state.recomputeScheduled = true;
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(recompute);
  } else {
    recompute();
  }
}

// Track scroll/resize globally so the winner follows the card under the screen
// center even while scrolling WITHIN a viewport region (no IO threshold cross).
// Capture-phase scroll catches inner overflow containers (scroll doesn't bubble).
function onGlobalScrollOrResize(): void {
  scheduleRecompute();
}

function ensureListeners(): void {
  if (state.listenersWired || typeof window === 'undefined') return;
  state.listenersWired = true;
  window.addEventListener('scroll', onGlobalScrollOrResize, { capture: true, passive: true });
  window.addEventListener('resize', onGlobalScrollOrResize, { passive: true });
}

function teardownListenersIfIdle(): void {
  if (state.entries.size > 0 || !state.listenersWired || typeof window === 'undefined') return;
  state.listenersWired = false;
  window.removeEventListener('scroll', onGlobalScrollOrResize, { capture: true } as EventListenerOptions);
  window.removeEventListener('resize', onGlobalScrollOrResize);
}

function register(el: HTMLElement, notify: (active: boolean) => void) {
  const id = Symbol('autoplayFocus');
  state.entries.set(id, { el, onScreen: false, notify, active: false });
  ensureListeners();
  return {
    setOnScreen(onScreen: boolean) {
      const e = state.entries.get(id);
      if (!e || e.onScreen === onScreen) return;
      e.onScreen = onScreen;
      scheduleRecompute();
    },
    release() {
      const e = state.entries.get(id);
      state.entries.delete(id);
      // Re-elect only if we were the active holder, so the next card lights up.
      if (e?.active) scheduleRecompute();
      teardownListenersIfIdle();
    },
  };
}

/**
 * Returns true when `ref`'s element is the single most-on-screen card among all
 * registrants — the cue to auto-play its video. Pass `want=false` (e.g. desktop
 * / non-video) to opt out entirely; the hook then always returns false.
 */
export function useViewportAutoplayFocus(
  ref: RefObject<HTMLElement | null>,
  want: boolean,
): boolean {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!want) {
      setFocused(false);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const handle = register(el, setFocused);

    // IO only gates on/off-screen (cheap cull) + nudges a recompute on cross;
    // precise center tracking comes from the global scroll listener.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== el) continue;
          handle.setOnScreen(entry.isIntersecting);
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      handle.release();
      setFocused(false);
    };
  }, [ref, want]);

  return focused;
}

/** Diagnostics — current registrant + winner count. */
export function getViewportAutoplayFocusStats(): { registered: number; onScreen: number; active: number } {
  let onScreen = 0;
  let active = 0;
  for (const e of state.entries.values()) {
    if (e.onScreen) onScreen += 1;
    if (e.active) active += 1;
  }
  return { registered: state.entries.size, onScreen, active };
}
