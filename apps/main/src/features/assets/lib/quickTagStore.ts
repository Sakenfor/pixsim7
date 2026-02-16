import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { normalizeTagInput } from './quickTag';

const DEFAULT_MAX_RECENT = 8;

interface QuickTagState {
  /** Active tags applied on quick-tag click */
  defaultTags: string[];
  /** Recently used tags (history) */
  recentTags: string[];
  maxRecentTags: number;
  /** Toggle a tag in/out of the active defaults */
  toggleDefaultTag: (slug: string) => void;
  /** Replace the full set of active defaults */
  setDefaultTags: (slugs: string[]) => void;
  addRecentTag: (slug: string) => void;
  clearDefaultTags: () => void;
  clearRecentTags: () => void;
  setMaxRecentTags: (n: number) => void;
}

export const useQuickTagStore = create<QuickTagState>()(
  persist(
    (set, get) => ({
      defaultTags: [],
      recentTags: [],
      maxRecentTags: DEFAULT_MAX_RECENT,

      toggleDefaultTag: (slug) =>
        set((state) => {
          const exists = state.defaultTags.includes(slug);
          return {
            defaultTags: exists
              ? state.defaultTags.filter((t) => t !== slug)
              : [...state.defaultTags, slug],
          };
        }),

      setDefaultTags: (slugs) => set({ defaultTags: slugs }),

      addRecentTag: (slug) =>
        set((state) => ({
          recentTags: [slug, ...state.recentTags.filter((t) => t !== slug)].slice(
            0,
            get().maxRecentTags,
          ),
        })),

      clearDefaultTags: () => set({ defaultTags: [] }),
      clearRecentTags: () => set({ recentTags: [] }),
      setMaxRecentTags: (n) =>
        set((state) => ({
          maxRecentTags: n,
          recentTags: state.recentTags.slice(0, n),
        })),
    }),
    {
      name: 'pixsim7-quick-tag',
      migrate: (persisted: any, version: number) => {
        const state = persisted as Record<string, any>;
        if (version === 0 && state && 'defaultTag' in state) {
          state.defaultTags = state.defaultTag ? [state.defaultTag] : [];
          delete state.defaultTag;
        }
        // v2: normalize all stored slugs to namespace:name format
        if (version < 2 && state) {
          if (Array.isArray(state.defaultTags)) {
            state.defaultTags = state.defaultTags
              .map((t: string) => normalizeTagInput(t))
              .filter(Boolean);
          }
          if (Array.isArray(state.recentTags)) {
            state.recentTags = state.recentTags
              .map((t: string) => normalizeTagInput(t))
              .filter(Boolean);
          }
        }
        return state as QuickTagState;
      },
      version: 2,
    },
  ),
);
