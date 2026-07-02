/**
 * Gallery view preferences — persisted, query-affecting toggles for the default
 * gallery surface (distinct from per-asset display settings).
 *
 * `hideBroken` keeps broken clips out of the default gallery. Baseline "broken"
 * means MANUALLY flagged (`signal_override = 'broken'`) — the same manual-only
 * predicate (`effectively_broken_clause`) that drives the cohort/sibling badge
 * counts, so gallery and badge agree. RemoteGallerySource injects `exclude_broken`
 * (default-surface only) when it's on; the "Show broken" toggle in the chrome
 * "View" menu (GalleryViewMenu) flips it.
 *
 * `brokenScoreCutoff` is the opt-in score knob layered ON TOP of that baseline
 * (the inverse of the Video Health `signal_*` filters): when non-null, the gallery
 * ALSO hides clips whose current-version heuristic score is >= the cutoff. Your
 * Keeps always win — `heuristic_broken_clause` exempts `signal_override = 'clean'`,
 * so a clip you rescued is never re-hidden by the score. `null` = off (score-blind,
 * manual flags only — the historical behavior). Injected as `broken_score_cutoff`
 * alongside `exclude_broken`. Review/Triage surfaces ignore both — they must see
 * flagged clips.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GalleryViewPrefsState {
  /** Hide manually-flagged broken clips from the default gallery. Default on. */
  hideBroken: boolean;
  setHideBroken: (value: boolean) => void;
  toggleHideBroken: () => void;
  /**
   * Opt-in heuristic-score cutoff: when non-null AND hideBroken is on, ALSO hide
   * clips scoring >= this value (minus your Keeps). `null` = off (manual only).
   */
  brokenScoreCutoff: number | null;
  setBrokenScoreCutoff: (value: number | null) => void;
}

export const useGalleryViewPrefsStore = create<GalleryViewPrefsState>()(
  persist(
    (set) => ({
      hideBroken: true,
      setHideBroken: (value) => set({ hideBroken: value }),
      toggleHideBroken: () => set((s) => ({ hideBroken: !s.hideBroken })),
      brokenScoreCutoff: null,
      setBrokenScoreCutoff: (value) => set({ brokenScoreCutoff: value }),
    }),
    { name: 'gallery_view_prefs_v1' },
  ),
);
