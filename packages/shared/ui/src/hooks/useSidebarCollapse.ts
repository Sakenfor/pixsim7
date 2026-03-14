import { useState, useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarCollapseState {
  collapsed: Record<string, boolean>;
  setCollapsed: (key: string, value: boolean) => void;
  toggle: (key: string) => void;
}

const useSidebarCollapseStore = create<SidebarCollapseState>()(
  persist(
    (set) => ({
      collapsed: {},
      setCollapsed: (key, value) =>
        set((state) => ({ collapsed: { ...state.collapsed, [key]: value } })),
      toggle: (key) =>
        set((state) => ({
          collapsed: { ...state.collapsed, [key]: !state.collapsed[key] },
        })),
    }),
    { name: 'sidebar-collapse-v1' },
  ),
);

export interface SidebarCollapseResult {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

export function useSidebarCollapse(
  persistKey?: string,
  defaultCollapsed = false,
): SidebarCollapseResult {
  const store = useSidebarCollapseStore();
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);

  const persisted = persistKey != null;

  const collapsed = persisted
    ? (store.collapsed[persistKey] ?? defaultCollapsed)
    : localCollapsed;

  const setCollapsed = useCallback(
    (v: boolean) => {
      if (persisted) {
        store.setCollapsed(persistKey, v);
      } else {
        setLocalCollapsed(v);
      }
    },
    [persisted, persistKey, store],
  );

  const toggle = useCallback(() => {
    if (persisted) {
      store.toggle(persistKey);
    } else {
      setLocalCollapsed((prev) => !prev);
    }
  }, [persisted, persistKey, store]);

  return { collapsed, setCollapsed, toggle };
}
