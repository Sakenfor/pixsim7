import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CollapsedGroupsState {
  /** Set of "filterKey:namespace" strings that are collapsed */
  collapsed: string[];
  isCollapsed: (filterKey: string, namespace: string) => boolean;
  toggle: (filterKey: string, namespace: string) => void;
}

function toKey(filterKey: string, namespace: string): string {
  return `${filterKey}:${namespace}`;
}

export const useCollapsedGroupsStore = create<CollapsedGroupsState>()(
  persist(
    (set, get) => ({
      collapsed: [],

      isCollapsed: (filterKey, namespace) =>
        get().collapsed.includes(toKey(filterKey, namespace)),

      toggle: (filterKey, namespace) =>
        set((state) => {
          const k = toKey(filterKey, namespace);
          const exists = state.collapsed.includes(k);
          return {
            collapsed: exists
              ? state.collapsed.filter((c) => c !== k)
              : [...state.collapsed, k],
          };
        }),
    }),
    { name: 'pixsim7-collapsed-filter-groups' },
  ),
);
