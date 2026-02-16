import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PinnedFiltersState {
  pinnedKeys: string[];
  togglePin: (key: string) => void;
  isPinned: (key: string) => boolean;
  clearPins: () => void;
}

export const usePinnedFiltersStore = create<PinnedFiltersState>()(
  persist(
    (set, get) => ({
      pinnedKeys: [],

      togglePin: (key) =>
        set((state) => {
          const exists = state.pinnedKeys.includes(key);
          return {
            pinnedKeys: exists
              ? state.pinnedKeys.filter((k) => k !== key)
              : [...state.pinnedKeys, key],
          };
        }),

      isPinned: (key) => get().pinnedKeys.includes(key),

      clearPins: () => set({ pinnedKeys: [] }),
    }),
    { name: 'pixsim7-pinned-filters' },
  ),
);
