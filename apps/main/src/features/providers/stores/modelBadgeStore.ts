/**
 * Model Badge Appearance Store
 *
 * Persists user overrides for model family badge colors.
 * Falls back to backend defaults when no override is set.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ModelBadgeOverrides {
  /** model_id → hex colour override */
  colors: Record<string, string>;
  /** Whether to show model badges on media cards */
  showOnMediaCards: boolean;
}

interface ModelBadgeState extends ModelBadgeOverrides {
  setColor: (modelId: string, color: string) => void;
  resetColor: (modelId: string) => void;
  resetAllColors: () => void;
  setShowOnMediaCards: (show: boolean) => void;
}

export const useModelBadgeStore = create<ModelBadgeState>()(
  persist(
    (set) => ({
      colors: {},
      showOnMediaCards: true,

      setColor: (modelId, color) =>
        set((s) => ({ colors: { ...s.colors, [modelId]: color } })),

      resetColor: (modelId) =>
        set((s) => {
          const next = { ...s.colors };
          delete next[modelId];
          return { colors: next };
        }),

      resetAllColors: () => set({ colors: {} }),

      setShowOnMediaCards: (show) => set({ showOnMediaCards: show }),
    }),
    { name: 'model-badge-overrides-v1' },
  ),
);
