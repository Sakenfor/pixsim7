import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ActivityBarState {
  collapsed: boolean;
  toggle: () => void;
  collapsedCategories: string[];
  toggleCategory: (cat: string) => void;
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
    }),
    { name: 'activityBar' },
  ),
);
