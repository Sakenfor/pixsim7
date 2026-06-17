/**
 * Media instrumentation — lifetime counters for resources that pile up
 * *invisibly to the JS heap*, surfaced in the PerformancePanel memory report so
 * a snapshot taken at a high-memory moment reveals WHAT is accumulating.
 *
 * Three trackers, all armed once at boot (eager import from main.tsx):
 *  - Object URLs: wraps URL.createObjectURL/revokeObjectURL to track live blob
 *    URLs + their byte total (by mime top-level). A climbing live-bytes total =
 *    unrevoked blobs (the prime "small files quietly accumulating" suspect, and
 *    unlike GPU memory this IS renderer-visible).
 *  - AudioContexts: wraps the constructor to count created/closed/live. A live
 *    count that grows with generations = contexts never closed (each is MBs).
 *  - <video> churn: a MutationObserver counts elements added/removed document-
 *    wide + a live high-water-mark. If live/peak keeps climbing, elements aren't
 *    unmounting; if added≈removed but the tab still bloats, the leak is orphaned
 *    native/GPU decoders (see caveat) rather than DOM.
 *
 * CAVEAT: decoded video frames / decoders live in Chrome's GPU process and are
 * invisible even here — only chrome://media-internals (player count) or the
 * Task Manager GPU column show those. These counters are JS-side *proxies*.
 *
 * See plans `frontend-memory` / `viewer-media-memory`.
 */
import { hmrSingleton } from '@lib/utils';

// ── Object URLs ──────────────────────────────────────────────────────────
interface ObjectUrlState {
  live: Map<string, { bytes: number; type: string }>;
  created: number;
  revoked: number;
}
const objectUrls = hmrSingleton<ObjectUrlState>('media:instr:objectUrls', () => ({
  live: new Map(),
  created: 0,
  revoked: 0,
}));

hmrSingleton('media:instr:objectUrlPatch', () => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return true;
  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource): string => {
    const url = origCreate(obj as Blob);
    try {
      const isBlob = typeof Blob !== 'undefined' && obj instanceof Blob;
      objectUrls.live.set(url, {
        bytes: isBlob ? obj.size : 0,
        type: isBlob ? obj.type || 'application/octet-stream' : 'mediasource',
      });
      objectUrls.created += 1;
    } catch {
      /* ignore — never let instrumentation break allocation */
    }
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    try {
      if (objectUrls.live.delete(url)) objectUrls.revoked += 1;
    } catch {
      /* ignore */
    }
    origRevoke(url);
  };
  return true;
});

// ── AudioContexts ────────────────────────────────────────────────────────
interface AudioState {
  created: number;
  closed: number;
  live: number;
}
const audio = hmrSingleton<AudioState>('media:instr:audio', () => ({
  created: 0,
  closed: 0,
  live: 0,
}));

hmrSingleton('media:instr:audioPatch', () => {
  if (typeof window === 'undefined') return true;
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  const Ctor = (w.AudioContext ?? w.webkitAudioContext) as
    | (new (...args: unknown[]) => { close?: () => Promise<void> })
    | undefined;
  if (!Ctor) return true;
  const Patched = function (this: unknown, ...args: unknown[]) {
    const ctx = new Ctor(...args);
    audio.created += 1;
    audio.live += 1;
    const origClose = ctx.close?.bind(ctx);
    if (origClose) {
      ctx.close = (...a: unknown[]) => {
        audio.closed += 1;
        audio.live = Math.max(0, audio.live - 1);
        return (origClose as (...x: unknown[]) => Promise<void>)(...a);
      };
    }
    return ctx;
  } as unknown as new (...args: unknown[]) => unknown;
  Patched.prototype = Ctor.prototype;
  if (w.AudioContext) w.AudioContext = Patched;
  if (w.webkitAudioContext) w.webkitAudioContext = Patched;
  return true;
});

// ── <video> churn ────────────────────────────────────────────────────────
interface VideoChurnState {
  added: number;
  removed: number;
  liveMax: number;
  observer: MutationObserver | null;
}
const videoChurn = hmrSingleton<VideoChurnState>('media:instr:videoChurn', () => ({
  added: 0,
  removed: 0,
  liveMax: 0,
  observer: null,
}));

function countVideosIn(node: Node): number {
  let n = node.nodeName === 'VIDEO' ? 1 : 0;
  if (node instanceof Element) n += node.getElementsByTagName('video').length;
  return n;
}

function startVideoChurnTracking(): void {
  if (typeof document === 'undefined' || videoChurn.observer) return;
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        videoChurn.added += countVideosIn(n);
      });
      r.removedNodes.forEach((n) => {
        videoChurn.removed += countVideosIn(n);
      });
    }
    const live = document.getElementsByTagName('video').length;
    if (live > videoChurn.liveMax) videoChurn.liveMax = live;
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  videoChurn.observer = obs;
  videoChurn.liveMax = document.getElementsByTagName('video').length;
}

hmrSingleton('media:instr:videoChurnStart', () => {
  startVideoChurnTracking();
  return true;
});

// ── Readout ──────────────────────────────────────────────────────────────
export interface MediaInstrumentationStats {
  objectUrls: {
    liveCount: number;
    liveBytes: number;
    created: number;
    revoked: number;
    byType: { type: string; count: number; bytes: number }[];
  };
  audio: { created: number; closed: number; live: number };
  videoChurn: { added: number; removed: number; liveMax: number };
}

export function getMediaInstrumentationStats(): MediaInstrumentationStats {
  let liveBytes = 0;
  const typeAgg = new Map<string, { count: number; bytes: number }>();
  for (const { bytes, type } of objectUrls.live.values()) {
    liveBytes += bytes;
    const top = type.split('/')[0] || type;
    const cur = typeAgg.get(top) ?? { count: 0, bytes: 0 };
    cur.count += 1;
    cur.bytes += bytes;
    typeAgg.set(top, cur);
  }
  const byType = Array.from(typeAgg.entries())
    .map(([type, v]) => ({ type, count: v.count, bytes: v.bytes }))
    .sort((a, b) => b.bytes - a.bytes);
  return {
    objectUrls: {
      liveCount: objectUrls.live.size,
      liveBytes,
      created: objectUrls.created,
      revoked: objectUrls.revoked,
      byType,
    },
    audio: { created: audio.created, closed: audio.closed, live: audio.live },
    videoChurn: {
      added: videoChurn.added,
      removed: videoChurn.removed,
      liveMax: videoChurn.liveMax,
    },
  };
}

/** Zero the cumulative deltas (keeps live maps) — e.g. before a repro session. */
export function resetMediaInstrumentationCounters(): void {
  objectUrls.created = 0;
  objectUrls.revoked = 0;
  audio.created = 0;
  audio.closed = 0;
  videoChurn.added = 0;
  videoChurn.removed = 0;
  videoChurn.liveMax =
    typeof document !== 'undefined' ? document.getElementsByTagName('video').length : 0;
}

// Dev-only console handle so a repro can watch the churn live and zero the
// deltas between controlled runs without a full page reload. In DevTools:
//   __mediaInstr.reset()                                   // zero before a run
//   __mediaInstr.stats().videoChurn                        // {added, removed, liveMax}
//   const t = setInterval(() => console.log(__mediaInstr.stats().videoChurn.added), 1000)
//   clearInterval(t)                                       // stop the live log
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as { __mediaInstr?: unknown }).__mediaInstr = {
    stats: getMediaInstrumentationStats,
    reset: resetMediaInstrumentationCounters,
  };
}
