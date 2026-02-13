import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_MAX_RECENT = 8;

interface QuickTagState {
  defaultTag: string | null;
  recentTags: string[];
  maxRecentTags: number;
  setDefaultTag: (slug: string | null) => void;
  addRecentTag: (slug: string) => void;
  clearRecentTags: () => void;
  setMaxRecentTags: (n: number) => void;
}

export const useQuickTagStore = create<QuickTagState>()(
  persist(
    (set, get) => ({
      defaultTag: null,
      recentTags: [],
      maxRecentTags: DEFAULT_MAX_RECENT,
      setDefaultTag: (slug) => set({ defaultTag: slug }),
      addRecentTag: (slug) =>
        set((state) => ({
          recentTags: [slug, ...state.recentTags.filter((t) => t !== slug)].slice(
            0,
            get().maxRecentTags,
          ),
        })),
      clearRecentTags: () => set({ recentTags: [] }),
      setMaxRecentTags: (n) =>
        set((state) => ({
          maxRecentTags: n,
          recentTags: state.recentTags.slice(0, n),
        })),
    }),
    { name: 'pixsim7-quick-tag' },
  ),
);
