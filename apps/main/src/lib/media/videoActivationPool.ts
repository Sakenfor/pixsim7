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
 * requests wait in a queue until a slot frees.
 *
 * PRIORITY + PREEMPTION:  Two kinds of consumers share this pool —
 *   • passive near-viewport previews (MediaCard's thumbnail-less inline
 *     <video>, group/tree/cube previews) that hold a slot just for being
 *     on screen, and
 *   • the interactive hover scrubber, where the user is actively looking
 *     at one card.
 * A flat FIFO let a handful of passive previews occupy every slot, so a
 * hover would queue behind them and never start — felt as dead/laggy
 * hover.  Higher-priority requests now PREEMPT a strictly lower-priority
 * active holder: the victim's grant is revoked (it tears its decoder down
 * and shows its thumbnail) and it returns to the queue, to be promoted
 * again when a slot frees.  Equal-priority requests never preempt each
 * other (two hovers coexist up to the cap, then queue).
 *
 * Slot grant/release/preempt is push-based via listeners — no polling.
 */
import { useEffect, useState } from 'react';

import { hmrSingleton } from '@lib/utils';

/** Slot priorities. Higher preempts strictly-lower. */
export const VIDEO_SLOT_PRIORITY_PASSIVE = 0;
export const VIDEO_SLOT_PRIORITY_HOVER = 10;

type Listener = (active: boolean) => void;

interface PoolEntry {
  id: symbol;
  listener: Listener;
  priority: number;
  /** Monotonic request order — FIFO tiebreak within a priority tier. */
  seq: number;
}

interface PoolState {
  maxActive: number;
  active: Map<symbol, PoolEntry>;
  queue: PoolEntry[];
  seqCounter: number;
  /** Lifetime count of preemptions, for diagnostics. */
  preempted: number;
}

/**
 * Default cap.  Empirically 3 active decoders × ~200-500MB native each
 * stays under 2GB of decoder memory even on 4K content.  Tune via
 * setVideoActivationCap() if needed.
 */
const DEFAULT_MAX_ACTIVE = 3;

const state = hmrSingleton<PoolState>('videoActivationPool', () => ({
  maxActive: DEFAULT_MAX_ACTIVE,
  active: new Map<symbol, PoolEntry>(),
  queue: [],
  seqCounter: 0,
  preempted: 0,
}));

/** Keep the queue ordered: higher priority first, then FIFO (lower seq first). */
function enqueue(entry: PoolEntry): void {
  state.queue.push(entry);
  state.queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
}

/** Lowest-priority active holder; ties broken by most-recently-granted (highest
 *  seq) so a long-standing preview isn't thrashed ahead of a newer one. */
function lowestPriorityActive(): PoolEntry | null {
  let victim: PoolEntry | null = null;
  for (const entry of state.active.values()) {
    if (
      !victim ||
      entry.priority < victim.priority ||
      (entry.priority === victim.priority && entry.seq > victim.seq)
    ) {
      victim = entry;
    }
  }
  return victim;
}

/** Fill open slots from the head of the (priority-ordered) queue. */
function promoteFromQueue(): void {
  while (state.active.size < state.maxActive && state.queue.length > 0) {
    const next = state.queue.shift();
    if (!next) break;
    state.active.set(next.id, next);
    next.listener(true);
  }
}

function grantOrQueue(entry: PoolEntry): void {
  if (state.active.size < state.maxActive) {
    state.active.set(entry.id, entry);
    entry.listener(true);
    return;
  }
  // Pool full — preempt a strictly lower-priority active holder if one exists.
  const victim = lowestPriorityActive();
  if (victim && victim.priority < entry.priority) {
    state.active.delete(victim.id);
    state.preempted += 1;
    victim.listener(false); // revoke: victim tears down its decoder, re-queues
    enqueue(victim);
    state.active.set(entry.id, entry);
    entry.listener(true);
    return;
  }
  // Can't preempt (no lower-priority holder) — wait in the queue.
  enqueue(entry);
  entry.listener(false);
  // Dev signal: a hover/scroll-focus request that can't get a slot is the exact
  // cause of "hover plays on one card then not". Surfaces who's holding the pool.
  if (import.meta.env?.DEV && entry.priority >= VIDEO_SLOT_PRIORITY_HOVER) {
    console.warn(
      '[videoActivationPool] hover slot starved',
      {
        maxActive: state.maxActive,
        queued: state.queue.length,
        activePriorities: Array.from(state.active.values()).map((e) => e.priority),
      },
    );
  }
}

/**
 * Request a slot.  The listener is called with `true` when the slot is
 * granted, `false` when it is denied/queued OR later preempted.  Returns a
 * release function that must be called to free the slot (or remove it from
 * the queue).  Higher `priority` preempts strictly-lower active holders.
 */
function requestSlot(listener: Listener, priority = VIDEO_SLOT_PRIORITY_PASSIVE): () => void {
  const entry: PoolEntry = {
    id: Symbol('videoSlot'),
    listener,
    priority,
    seq: state.seqCounter++,
  };
  grantOrQueue(entry);

  return () => {
    if (state.active.delete(entry.id)) {
      // Promote next in (priority) queue, if any.
      promoteFromQueue();
      return;
    }
    // Was queued (or preempted), not active — remove from queue.
    const idx = state.queue.findIndex((q) => q.id === entry.id);
    if (idx >= 0) state.queue.splice(idx, 1);
  };
}

/**
 * React hook: requests a video activation slot whenever `want` is true.
 * Returns true once the slot is granted; false while waiting, when `want`
 * is false, or after being preempted by a higher-priority request.
 *
 * Pass `priority` to mark interactive (hover) consumers so they preempt
 * passive near-viewport previews instead of starving behind them.
 *
 * Example:
 *   const want = isHovering && !!videoSrc;
 *   const granted = useVideoActivationSlot(want, VIDEO_SLOT_PRIORITY_HOVER);
 *   const effectiveSrc = granted ? videoSrc : undefined;
 */
export function useVideoActivationSlot(
  want: boolean,
  priority: number = VIDEO_SLOT_PRIORITY_PASSIVE,
): boolean {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!want) {
      setGranted(false);
      return;
    }
    const release = requestSlot(setGranted, priority);
    return () => {
      release();
      setGranted(false);
    };
  }, [want, priority]);

  return granted;
}

/** Diagnostics — current pool state. */
export function getVideoActivationPoolStats(): {
  active: number;
  queued: number;
  maxActive: number;
  preempted: number;
} {
  return {
    active: state.active.size,
    queued: state.queue.length,
    maxActive: state.maxActive,
    preempted: state.preempted,
  };
}

/** Adjust the cap at runtime (e.g., from settings). */
export function setVideoActivationCap(max: number): void {
  state.maxActive = Math.max(1, max);
  // Promote queued entries up to the new cap.
  promoteFromQueue();
}
