/**
 * Gallery view preferences — persisted, query-affecting toggles for the default
 * gallery surface (distinct from per-asset display settings).
 *
 * `hideBroken` keeps broken clips out of the default gallery. "Broken" here means
 * MANUALLY flagged (`signal_override = 'broken'`) — NOT the heuristic score, which
 * over-fires (~27% of videos) and is triage-only. RemoteGallerySource injects
 * `exclude_broken` into the query (default-surface only) when it's on; the "Show
 * broken" toggle in the chrome "View" menu (GalleryViewMenu) flips it. The same
 * manual-only predicate (`effectively_broken_clause`) drives the cohort/sibling
 * badge counts, so gallery and badge agree. Review/Triage surfaces ignore it —
 * they must see flagged clips.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GalleryViewPrefsState {
  /** Hide broken clips (manual flags + heuristic score >= 3) from the default gallery. Default on. */
  hideBroken: boolean;
  setHideBroken: (value: boolean) => void;
  toggleHideBroken: () => void;
}

export const useGalleryViewPrefsStore = create<GalleryViewPrefsState>()(
  persist(
    (set) => ({
      hideBroken: true,
      setHideBroken: (value) => set({ hideBroken: value }),
      toggleHideBroken: () => set((s) => ({ hideBroken: !s.hideBroken })),
    }),
    { name: 'gallery_view_prefs_v1' },
  ),
);
