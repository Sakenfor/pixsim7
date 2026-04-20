import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ActivityBarState {
  collapsed: boolean;
  toggle: () => void;
  collapsedCategories: string[];
  toggleCategory: (cat: string) => void;
  /** Pages the user has hidden from the sidebar nav. Independent of page.hidden flag. */
  hiddenPageIds: string[];
  toggleHiddenPage: (pageId: string) => void;
  unhideAllPages: () => void;
}

export const useActivityBarStore = create<ActivityBarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      collapsedCategories: [],
      toggleCategory: (cat) =>
        set((s) => ({
          collapsedCategories: s.collapsedCategories.includes(cat)
            ? s.collapsedCategories.filter((c) => c !== cat)
            : [...s.collapsedCategories, cat],
        })),
      hiddenPageIds: [],
      toggleHiddenPage: (pageId) =>
        set((s) => ({
          hiddenPageIds: s.hiddenPageIds.includes(pageId)
            ? s.hiddenPageIds.filter((id) => id !== pageId)
            : [...s.hiddenPageIds, pageId],
        })),
      unhideAllPages: () => set({ hiddenPageIds: [] }),
    }),
    { name: 'activityBar' },
  ),
);
