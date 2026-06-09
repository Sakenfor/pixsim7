/**
 * Media suspend store.
 *
 * Releases video decoders + trims native media caches while the browser tab is
 * hidden. Decoded video frames and decoder buffers live in Chrome's GPU process
 * (a separate OS process, invisible to JS memory APIs), so an autoplay viewer
 * left running in a backgrounded tab keeps its decoder — and during rapid
 * generation a whole pile of them — alive indefinitely. The classic
 * "generate a burst, alt-tab away, come back to a multi-GB tab" symptom.
 *
 * When the tab has been hidden past a short grace window we flip `suspended`,
 * which video components read to drop their `<video>` src (a full unmount frees
 * the native decoder; setting src=undefined alone does not). We also clear the
 * video blob cache + captured frames. Image blobs are deliberately kept (cheap,
 * and clearing them flashes the gallery on return). Everything restores on show.
 *
 * See plans `frontend-memory` / `viewer-media-memory`.
 */
import { useSyncExternalStore } from 'react';

import { clearAllCapturedFrames } from '@lib/media/capturedFrameStore';
import { hmrSingleton } from '@lib/utils';

import { authMediaCaches } from '@/hooks/useAuthenticatedMedia';

/** Grace before suspending so a quick tab flick doesn't tear down + reload. */
const SUSPEND_GRACE_MS = 1500;

interface SuspendState {
  suspended: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
  listeners: Set<() => void>;
}

const state = hmrSingleton<SuspendState>('media:suspendState', () => ({
  suspended: false,
  graceTimer: null,
  listeners: new Set(),
}));

function setSuspended(next: boolean): void {
  if (state.suspended === next) return;
  state.suspended = next;
  for (const listener of state.listeners) listener();
}

function suspendNow(): void {
  setSuspended(true);
  // Reclaim the expensive native buffers held while backgrounded: video
  // decoders are dropped by the components (they read `suspended`), and here we
  // free the cached video blobs + captured frames.
  try {
    authMediaCaches.video.clear();
  } catch {
    /* best effort */
  }
  try {
    clearAllCapturedFrames();
  } catch {
    /* best effort */
  }
}

/**
 * Reconcile suspend state against the *current* visibility, rather than
 * trusting a particular event to carry the transition.
 *
 * `document.hidden` is the single source of truth: while hidden we arm the
 * grace timer (once), and the moment we're visible again we cancel any pending
 * suspend and restore immediately. Because recovery keys off `document.hidden`
 * — not off receiving a specific `visibilitychange` → visible event — a missed
 * or coalesced event can't wedge the viewer in a blank, permanently-suspended
 * state. `focus`/`pageshow` call here too as belt-and-suspenders so regaining
 * window focus or restoring from bfcache also re-syncs us out of `suspended`.
 */
function syncFromVisibility(): void {
  if (typeof document === 'undefined') return;
  if (document.hidden) {
    // Arm a single suspend. Don't re-arm if one is already pending or in effect
    // (repeated hidden nudges while staying hidden shouldn't reset the clock).
    if (state.suspended || state.graceTimer) return;
    state.graceTimer = setTimeout(() => {
      state.graceTimer = null;
      suspendNow();
    }, SUSPEND_GRACE_MS);
  } else {
    // Visible: cancel any pending suspend and restore now. Idempotent —
    // `setSuspended` no-ops when already false, so the frequent `focus` nudge
    // is effectively free.
    if (state.graceTimer) {
      clearTimeout(state.graceTimer);
      state.graceTimer = null;
    }
    setSuspended(false);
  }
}

// Register the visibility listeners once (survives HMR via the singleton guard)
// and seed from the current visibility so we neither start wedged nor miss a
// load-while-hidden.
hmrSingleton('media:suspendListener', () => {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', syncFromVisibility);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', syncFromVisibility);
    window.addEventListener('pageshow', syncFromVisibility);
  }
  syncFromVisibility();
  return true;
});

function subscribe(callback: () => void): () => void {
  state.listeners.add(callback);
  return () => {
    state.listeners.delete(callback);
  };
}

function getSnapshot(): boolean {
  return state.suspended;
}

/** True while the tab has been backgrounded past the grace window. */
export function useMediaSuspended(): boolean {
  // Server snapshot is always false — SSR/first paint should never suspend.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Imperative read for non-React callers. */
export function isMediaSuspendedNow(): boolean {
  return state.suspended;
}

/** Test-only: clear the pending grace timer and reset to the unsuspended state. */
export function __resetMediaSuspendForTests(): void {
  if (state.graceTimer) {
    clearTimeout(state.graceTimer);
    state.graceTimer = null;
  }
  state.suspended = false;
}
