import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

export type GenerationSeedModePreference = 'default' | 'reuse-source-seed';
export type GenerationSeedModeAction = 'quick-generate' | 'regenerate';

interface GenerationSeedModeStore {
  byAction: Record<GenerationSeedModeAction, GenerationSeedModePreference>;
  setMode: (action: GenerationSeedModeAction, mode: GenerationSeedModePreference) => void;
}

const STORAGE_KEY = 'pixsim:media-card:quick-generate-mode';
const DEFAULT_BY_ACTION: Record<GenerationSeedModeAction, GenerationSeedModePreference> = {
  'quick-generate': 'default',
  regenerate: 'default',
};

/**
 * Shared across media-card generation actions so the last used seed mode
 * ("default" vs "reuse source seed") becomes the next default per action.
 */
export const useGenerationSeedModeStore = create<GenerationSeedModeStore>()(
  persist(
    (set) => ({
      byAction: DEFAULT_BY_ACTION,
      setMode: (action, mode) =>
        set((state) => ({
          byAction: {
            ...state.byAction,
            [action]: mode,
          },
        })),
    }),
    { name: STORAGE_KEY },
  ),
);

registerStore({ id: 'media-card-generation-seed-modes', key: STORAGE_KEY });
