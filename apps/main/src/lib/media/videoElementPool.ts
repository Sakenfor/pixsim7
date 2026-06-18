/**
 * Video Element Pool
 *
 * Reuse a small, fixed set of <video> elements for hover-preview scrubbing
 * instead of minting a fresh one per hover.
 *
 * WHY: every newly-created <video> that loads a `src` allocates a native/GPU
 * decoder context (~30MB, Chrome) that Chrome reclaims too lazily under rapid
 * hovering — so it's the CUMULATIVE element count, not the concurrent count,
 * that leaks (the multi-GB tab). `videoActivationPool` (MAX_ACTIVE=3) already
 * caps CONCURRENT decoders; this caps the cumulative count by recycling a
 * handful of elements: borrow on activate, release (decoder torn down) back to
 * an idle pool on deactivate.
 *
 * Pairs with `releaseVideoDecoder` (videoDecoder.ts) for the actual teardown.
 *
 * See plan `viewer-media-memory` → checkpoint `video-element-pooling`.
 */
import { hmrSingleton } from '@lib/utils';

import { releaseVideoDecoder } from './videoDecoder';

/**
 * Max idle elements retained. The activation pool caps concurrent borrows at 3,
 * so 4 leaves headroom for a transient overlap (e.g. StrictMode double-mount or
 * a hover handoff) without ever growing the lifetime element count past this.
 */
const POOL_MAX = 4;

interface PoolState {
  /** Released elements available for reuse. */
  idle: HTMLVideoElement[];
  /** Elements currently borrowed (out of the pool). */
  liveCount: number;
  /** Lifetime: elements ever created via document.createElement. */
  created: number;
  /** Lifetime: acquisitions served from the idle pool (i.e. reuse hits). */
  reused: number;
}

const state = hmrSingleton<PoolState>('videoElementPool', () => ({
  idle: [],
  liveCount: 0,
  created: 0,
  reused: 0,
}));

/**
 * Reset an element to a known-good baseline before handing it out. `src` and
 * `crossOrigin` are intentionally left to the borrower (they're per-asset).
 */
function applyBaselineAttrs(el: HTMLVideoElement): void {
  el.preload = 'metadata';
  el.playsInline = true;
  el.muted = true;
  el.loop = false;
  el.className =
    'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-150';
  el.style.opacity = '0';
}

/**
 * Borrow a pooled <video>, creating one only if the idle pool is empty. The
 * caller owns it until `releasePooledVideo` — set src, append to a slot, attach
 * listeners. Always reset to baseline attrs so a reused element carries nothing
 * over from its previous borrower.
 */
export function acquirePooledVideo(): HTMLVideoElement {
  const reused = state.idle.pop();
  state.liveCount += 1;
  if (reused) {
    state.reused += 1;
    applyBaselineAttrs(reused);
    return reused;
  }
  const el = document.createElement('video');
  state.created += 1;
  applyBaselineAttrs(el);
  return el;
}

/**
 * Return an element to the pool: detach from the DOM and fully tear down its
 * decoder (pause + removeAttribute('src') + load), then retain it for reuse up
 * to POOL_MAX. Extras beyond POOL_MAX are dropped (decoder already freed), so
 * the retained set can never grow unbounded. Safe to call with null.
 */
export function releasePooledVideo(el: HTMLVideoElement | null): void {
  if (!el) return;
  state.liveCount = Math.max(0, state.liveCount - 1);
  if (el.parentNode) el.parentNode.removeChild(el);
  releaseVideoDecoder(el);
  if (state.idle.length < POOL_MAX) {
    state.idle.push(el);
  }
}

/** Diagnostics — surfaced via mediaInstrumentation / __mediaInstr. */
export function getVideoElementPoolStats(): {
  idle: number;
  live: number;
  created: number;
  reused: number;
  max: number;
} {
  return {
    idle: state.idle.length,
    live: state.liveCount,
    created: state.created,
    reused: state.reused,
    max: POOL_MAX,
  };
}
