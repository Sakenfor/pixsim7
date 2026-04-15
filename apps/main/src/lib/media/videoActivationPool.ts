/**
 * Video Activation Pool
 *
 * Caps the number of concurrently active <video> decoders.  Each active
 * video element holds large native/GPU decoder buffers (~50-300MB) that
 * are invisible to JS memory APIs.  Without a cap, a gallery burst can
 * pile 7+ active decoders and consume multiple GB of native memory.
 *
 * Components request a slot when they want to mount/load a <video> with
 * src.  The pool grants up to MAX_ACTIVE slots immediately; further
 * requests wait in a FIFO queue until an existing slot is released
 * (typically when the card scrolls out of viewport / unmounts).
 *
 * Slot grant/release is push-based via listeners — no polling.
 */
import { useEffect, useState } from 'react';

import { hmrSingleton } from '@lib/utils';

type Listener = (active: boolean) => void;

interface PoolEntry {
  id: symbol;
  listener: Listener;
}

interface PoolState {
  maxActive: number;
  active: Set<symbol>;
  queue: PoolEntry[];
}

/**
 * Default cap.  Empirically 3 active decoders × ~200-500MB native each
 * stays under 2GB of decoder memory even on 4K content.  Tune via
 * setVideoActivationCap() if needed.
 */
const DEFAULT_MAX_ACTIVE = 3;

const state = hmrSingleton<PoolState>('videoActivationPool', () => ({
  maxActive: DEFAULT_MAX_ACTIVE,
  active: new Set<symbol>(),
  queue: [],
}));

/**
 * Request a slot.  The listener is called with `true` when the slot is
 * granted, `false` when it is denied/queued.  Returns a release function
 * that must be called to free the slot (or remove from queue).
 */
function requestSlot(listener: Listener): () => void {
  const id = Symbol('videoSlot');
  if (state.active.size < state.maxActive) {
    state.active.add(id);
    listener(true);
  } else {
    state.queue.push({ id, listener });
    listener(false);
  }

  return () => {
    if (state.active.delete(id)) {
      // Promote next in queue, if any.
      const next = state.queue.shift();
      if (next) {
        state.active.add(next.id);
        next.listener(true);
      }
      return;
    }
    // Was queued, not active — remove from queue.
    const idx = state.queue.findIndex((q) => q.id === id);
    if (idx >= 0) state.queue.splice(idx, 1);
  };
}

/**
 * React hook: requests a video activation slot whenever `want` is true.
 * Returns true once the slot is granted; false while waiting or when
 * `want` is false.
 *
 * Example:
 *   const want = isNearViewport && !!videoSrc;
 *   const granted = useVideoActivationSlot(want);
 *   const effectiveSrc = granted ? videoSrc : undefined;
 */
export function useVideoActivationSlot(want: boolean): boolean {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!want) {
      setGranted(false);
      return;
    }
    const release = requestSlot(setGranted);
    return () => {
      release();
      setGranted(false);
    };
  }, [want]);

  return granted;
}

/** Diagnostics — current pool state. */
export function getVideoActivationPoolStats(): {
  active: number;
  queued: number;
  maxActive: number;
} {
  return {
    active: state.active.size,
    queued: state.queue.length,
    maxActive: state.maxActive,
  };
}

/** Adjust the cap at runtime (e.g., from settings). */
export function setVideoActivationCap(max: number): void {
  state.maxActive = Math.max(1, max);
  // Promote queued entries up to the new cap.
  while (state.active.size < state.maxActive && state.queue.length > 0) {
    const next = state.queue.shift();
    if (!next) break;
    state.active.add(next.id);
    next.listener(true);
  }
}
