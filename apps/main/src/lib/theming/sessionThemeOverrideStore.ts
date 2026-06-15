/**
 * Session Theme Override Store
 *
 * Holds the active temporary session theme override (dream sequences,
 * flashbacks, etc.). The override is ephemeral — it is never persisted and
 * resets on reload. `useWorldTheme` reads `currentOverride` and merges it over
 * the world's base theme; the Session Theme Override world tool writes it.
 *
 * This store is the source of truth that the dissolved GameThemingPanel's
 * "Session Override" tab previously lacked — it used to receive dead
 * `onApplyOverride` props that no consumer wired up.
 */

import { create } from 'zustand';

import type { SessionUiOverride } from '@lib/registries';

interface SessionThemeOverrideState {
  currentOverride: SessionUiOverride | null;
  applyOverride: (override: SessionUiOverride) => void;
  clearOverride: () => void;
}

export const useSessionThemeOverrideStore = create<SessionThemeOverrideState>((set) => ({
  currentOverride: null,
  applyOverride: (override) =>
    set((state) => (state.currentOverride === override ? state : { currentOverride: override })),
  clearOverride: () =>
    set((state) => (state.currentOverride === null ? state : { currentOverride: null })),
}));
