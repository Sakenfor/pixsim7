import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

export type ExtendPromptSource = 'same' | 'active';

interface ExtendPromptSourceStore {
  promptSource: ExtendPromptSource;
  setPromptSource: (source: ExtendPromptSource) => void;
}

const STORAGE_KEY = 'pixsim:media-card:extend-prompt-source';

/**
 * Shared across all media-card extend menus so the user's last choice
 * ("same" vs "active" prompt) persists across cards and reloads.
 */
export const useExtendPromptSourceStore = create<ExtendPromptSourceStore>()(
  persist(
    (set) => ({
      promptSource: 'same',
      setPromptSource: (promptSource) => set({ promptSource }),
    }),
    { name: STORAGE_KEY },
  ),
);

registerStore({ id: 'media-card-extend-prompt-source', key: STORAGE_KEY });
