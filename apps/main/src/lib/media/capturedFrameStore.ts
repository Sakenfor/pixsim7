/**
 * Captured Frame Store
 *
 * Keeps the last visually-displayed frame of a video (captured to a blob
 * URL via canvas.toBlob) so the card can keep showing it after the
 * VideoScrubWidget overlay is torn down by OverlayContainer's hover-end
 * visibility rule.
 *
 * Flow:
 *   1. User hovers video → VideoScrubWidget plays.
 *   2. User moves mouse off → widget captures current frame here, then
 *      the overlay container is hidden by the visibility system.
 *   3. MediaCard reads the captured frame and renders it as an <img>
 *      layered over the thumbnail (not inside the overlay) — so it
 *      survives the overlay's display:none.
 *   4. After the hold timer expires (or card unmounts), the entry is
 *      cleared and the underlying blob URL is revoked.
 *
 * Keys are strings — VideoScrubWidget keys by asset id when available,
 * else by the raw video URL.  MediaCard must use the same key.
 */
import { useEffect, useState } from 'react';

import { hmrSingleton } from '@lib/utils';

interface FrameEntry {
  /** Blob URL (object URL). Revoke when removed/overwritten. */
  url: string;
  /** Approx blob byte size (jpeg-compressed, not decoded RGBA). */
  bytes: number;
}

interface State {
  /** key → captured frame entry */
  frames: Map<string, FrameEntry>;
  /** key → listeners to notify when its frame changes */
  listeners: Map<string, Set<() => void>>;
}

const state = hmrSingleton<State>('capturedFrameStore', () => ({
  frames: new Map(),
  listeners: new Map(),
}));

function notify(key: string): void {
  const set = state.listeners.get(key);
  if (!set) return;
  for (const fn of set) fn();
}

function revokeEntry(entry: FrameEntry | undefined): void {
  if (!entry) return;
  try {
    URL.revokeObjectURL(entry.url);
  } catch {
    // Older browsers may throw; ignore.
  }
}

export function setCapturedFrame(key: string, url: string, bytes: number): void {
  const prev = state.frames.get(key);
  if (prev && prev.url === url) return;
  if (prev) revokeEntry(prev);
  state.frames.set(key, { url, bytes });
  notify(key);
}

export function clearCapturedFrame(key: string): void {
  const prev = state.frames.get(key);
  if (!prev) return;
  state.frames.delete(key);
  revokeEntry(prev);
  notify(key);
}

export function getCapturedFrame(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return state.frames.get(key)?.url;
}

/**
 * Capture the current frame of a <video> element to a blob URL (JPEG).
 * Returns null if the element has no decoded frame available.
 *
 * Async because canvas.toBlob is async (avoids the synchronous data-URL
 * encode that previously inflated memory and held large base64 strings).
 */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<{
  url: string;
  bytes: number;
} | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  if (video.readyState < 2) return null; // HAVE_CURRENT_DATA or better required
  const canvas = document.createElement('canvas');
  // Cap to a reasonable size — gallery cards don't need 4K frames.  The
  // captured frame is retained until next hover, so keeping it small
  // limits memory cost too.
  const MAX_DIM = 640;
  const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    // drawImage can throw on cross-origin videos without proper CORS
    // (SecurityError: "Tainted canvases may not be exported").
    return null;
  }
  const blob: Blob | null = await new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7);
    } catch {
      resolve(null);
    }
  });
  if (!blob) return null;
  return { url: URL.createObjectURL(blob), bytes: blob.size };
}

/**
 * React hook — subscribes to the captured frame for `key` and returns the
 * latest blob URL (or undefined).  Triggers re-render when the entry is
 * set or cleared.
 */
export function useCapturedFrame(key: string | undefined): string | undefined {
  const [frame, setFrame] = useState<string | undefined>(() =>
    key ? state.frames.get(key)?.url : undefined,
  );

  useEffect(() => {
    if (!key) {
      setFrame(undefined);
      return;
    }
    const listener = () => setFrame(state.frames.get(key)?.url);
    let set = state.listeners.get(key);
    if (!set) {
      set = new Set();
      state.listeners.set(key, set);
    }
    set.add(listener);
    setFrame(state.frames.get(key)?.url);

    return () => {
      const s = state.listeners.get(key);
      if (s) {
        s.delete(listener);
        if (s.size === 0) state.listeners.delete(key);
      }
    };
  }, [key]);

  return frame;
}

/** Diagnostics — total entries + summed blob bytes. */
export function getCapturedFrameStoreStats(): { entries: number; bytes: number } {
  let bytes = 0;
  for (const v of state.frames.values()) bytes += v.bytes;
  return { entries: state.frames.size, bytes };
}

/** Purge the entire cache (e.g., from PerformancePanel). */
export function clearAllCapturedFrames(): void {
  for (const key of Array.from(state.frames.keys())) clearCapturedFrame(key);
}
