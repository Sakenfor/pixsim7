import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

/**
 * Persisted viewer video playback preferences.
 *
 * The viewer `<video>` is a fresh element on every page load, so the transport
 * bar's volume/mute, play state, and scrub position would otherwise reset each
 * refresh. {@link VideoTransportControls} applies these on load and writes back
 * on change.
 *
 * - `volume` / `muted` — global media preference (one value).
 * - `wasPlaying` — global play/pause intent, restored once per page load.
 *   `null` means the user hasn't expressed a choice yet, so we leave the
 *   element's own autoplay behavior alone rather than force-pausing it.
 * - `positions` — per-asset last scrub position (seconds), keyed by asset id and
 *   LRU-capped so it can't grow without bound.
 */
const STORAGE_KEY = 'pixsim7-viewer-video-playback';

/** LRU cap on remembered per-asset positions. */
const MAX_POSITIONS = 200;

interface VideoPlaybackState {
  /** 0..1 */
  volume: number;
  muted: boolean;
  /** Last explicit play/pause intent; `null` = unset (defer to autoplay). */
  wasPlaying: boolean | null;
  /** Per-asset last position in seconds, keyed by asset id (LRU-capped). */
  positions: Record<string, number>;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setWasPlaying: (wasPlaying: boolean) => void;
  setPosition: (assetId: string, seconds: number) => void;
  clearPosition: (assetId: string) => void;
}

export const useVideoPlaybackStore = create<VideoPlaybackState>()(
  persist(
    (set) => ({
      volume: 1,
      muted: false,
      wasPlaying: null,
      positions: {},
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setMuted: (muted) => set({ muted }),
      setWasPlaying: (wasPlaying) => set({ wasPlaying }),
      setPosition: (assetId, seconds) =>
        set((s) => {
          if (!assetId) return s;
          // Re-insert at the end so object key order tracks recency for LRU.
          const next = { ...s.positions };
          delete next[assetId];
          next[assetId] = seconds;
          const keys = Object.keys(next);
          if (keys.length > MAX_POSITIONS) delete next[keys[0]];
          return { positions: next };
        }),
      clearPosition: (assetId) =>
        set((s) => {
          if (!(assetId in s.positions)) return s;
          const next = { ...s.positions };
          delete next[assetId];
          return { positions: next };
        }),
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
);

registerStore({ id: 'media:viewer-video-playback', key: STORAGE_KEY });
