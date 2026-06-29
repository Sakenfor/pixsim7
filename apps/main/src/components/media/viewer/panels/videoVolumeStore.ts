import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

/**
 * Persisted viewer video volume / mute preference.
 *
 * The viewer `<video>` is a fresh element at default volume (1, unmuted) on
 * every page load, so the transport bar's mute/volume would otherwise reset each
 * refresh. This store remembers the user's last choice and {@link
 * VideoTransportControls} applies it to the element on load and writes back on
 * change. It's a global media preference (not per-asset), so a single value.
 */
const STORAGE_KEY = 'pixsim7-viewer-video-volume';

interface VideoVolumeState {
  /** 0..1 */
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

export const useVideoVolumeStore = create<VideoVolumeState>()(
  persist(
    (set) => ({
      volume: 1,
      muted: false,
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setMuted: (muted) => set({ muted }),
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
);

registerStore({ id: 'media:viewer-video-volume', key: STORAGE_KEY });
