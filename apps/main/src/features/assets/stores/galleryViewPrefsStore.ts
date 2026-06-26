/**
 * Gallery view preferences — persisted, query-affecting toggles for the default
 * gallery surface (distinct from per-asset display settings).
 *
 * `hideFlagged` keeps clips you've manually flagged broken out of the default
 * gallery; RemoteGallerySource injects `exclude_override_broken` into the query
 * (default-surface only) when it's on, and the chrome-bar "Show flagged" toggle
 * flips it. Review/Triage surfaces ignore it — they must see flagged clips.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GalleryViewPrefsState {
  /** Hide manually-flagged-broken clips from the default gallery. Default on. */
  hideFlagged: boolean;
  setHideFlagged: (value: boolean) => void;
  toggleHideFlagged: () => void;
}

export const useGalleryViewPrefsStore = create<GalleryViewPrefsState>()(
  persist(
    (set) => ({
      hideFlagged: true,
      setHideFlagged: (value) => set({ hideFlagged: value }),
      toggleHideFlagged: () => set((s) => ({ hideFlagged: !s.hideFlagged })),
    }),
    { name: 'gallery_view_prefs_v1' },
  ),
);
