import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SidebarEntry {
  detached: boolean;
  activeSectionId: string;
  activeChildId: string | undefined;
  expandedSectionIds: string[];
}

interface DetachableSidebarStore {
  sidebars: Record<string, SidebarEntry>;

  initSidebar: (
    id: string,
    initial: Omit<SidebarEntry, 'detached'>,
  ) => void;
  removeSidebar: (id: string) => void;

  detach: (id: string) => void;
  dockBack: (id: string) => void;

  setActiveSection: (id: string, sectionId: string) => void;
  setActiveChild: (id: string, parentId: string, childId: string) => void;
  setExpanded: (id: string, expandedIds: string[]) => void;
  toggleExpand: (id: string, sectionId: string) => void;
}

export const useDetachableSidebarStore = create<DetachableSidebarStore>()(
  persist(
    (set) => ({
      sidebars: {},

      initSidebar: (id, initial) =>
        set((state) => {
          if (state.sidebars[id]) return state;
          return {
            sidebars: {
              ...state.sidebars,
              [id]: { detached: false, ...initial },
            },
          };
        }),

      removeSidebar: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.sidebars;
          return { sidebars: rest };
        }),

      detach: (id) =>
        set((state) => {
          const entry = state.sidebars[id];
          if (!entry) return state;
          return {
            sidebars: { ...state.sidebars, [id]: { ...entry, detached: true } },
          };
        }),

      dockBack: (id) =>
        set((state) => {
          const entry = state.sidebars[id];
          if (!entry) return state;
          return {
            sidebars: { ...state.sidebars, [id]: { ...entry, detached: false } },
          };
        }),

      setActiveSection: (id, sectionId) =>
        set((state) => {
          const entry = state.sidebars[id];
          if (!entry) return state;
          return {
            sidebars: {
              ...state.sidebars,
              [id]: { ...entry, activeSectionId: sectionId, activeChildId: undefined },
            },
          };
        }),

      setActiveChild: (id, parentId, childId) =>
        set((state) => {
          const entry = state.sidebars[id];
          if (!entry) return state;
          return {
            sidebars: {
              ...state.sidebars,
              [id]: { ...entry, activeSectionId: parentId, activeChildId: childId },
            },
          };
        }),

      setExpanded: (id, expandedIds) =>
        set((state) => {
          const entry = state.sidebars[id];
          if (!entry) return state;
          return {
            sidebars: {
              ...state.sidebars,
              [id]: { ...entry, expandedSectionIds: expandedIds },
            },
          };
        }),

      toggleExpand: (id, sectionId) =>
        set((state) => {
          const entry = state.sidebars[id];
          if (!entry) return state;
          const set_ = new Set(entry.expandedSectionIds);
          if (set_.has(sectionId)) set_.delete(sectionId);
          else set_.add(sectionId);
          return {
            sidebars: {
              ...state.sidebars,
              [id]: { ...entry, expandedSectionIds: [...set_] },
            },
          };
        }),
    }),
    { name: 'detachable-sidebar-v1' },
  ),
);

// ---------------------------------------------------------------------------
// Hook: useDetachableSidebarNav
// ---------------------------------------------------------------------------

import type { SidebarNavSection, SidebarNavResult } from './useSidebarNav';

export interface UseDetachableSidebarNavOptions<
  TChildId extends string = string,
> {
  sidebarId: string;
  sections: SidebarNavSection<TChildId>[];
  initial?: string;
  defaultAllExpanded?: boolean;
}

export interface DetachableSidebarNavResult<
  TSectionId extends string = string,
  TChildId extends string = string,
> extends SidebarNavResult<TSectionId, TChildId> {
  detached: boolean;
}

export function useDetachableSidebarNav<
  TSectionId extends string = string,
  TChildId extends string = string,
>({
  sidebarId,
  sections,
  initial,
  defaultAllExpanded = true,
}: UseDetachableSidebarNavOptions<TChildId>): DetachableSidebarNavResult<TSectionId, TChildId> {
  const store = useDetachableSidebarStore();

  // Build child→parent lookup
  const childToParent = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) {
      if (section.children) {
        for (const child of section.children) {
          map.set(child.id, section.id);
        }
      }
    }
    return map;
  }, [sections]);

  // Resolve initial values
  const resolvedInitial = useMemo(() => {
    let sectionId: string;
    let childId: string | undefined;

    if (!initial) {
      const first = sections[0];
      sectionId = first?.id ?? '';
      childId = first?.children?.[0]?.id;
    } else {
      const parent = childToParent.get(initial);
      if (parent) {
        sectionId = parent;
        childId = initial;
      } else {
        sectionId = initial;
        childId = undefined;
      }
    }

    const expandedIds = defaultAllExpanded
      ? sections.filter((s) => s.children?.length).map((s) => s.id)
      : [];

    return { activeSectionId: sectionId, activeChildId: childId, expandedSectionIds: expandedIds };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- init-only

  // Initialize store entry on mount
  useEffect(() => {
    store.initSidebar(sidebarId, resolvedInitial);
  }, [sidebarId]); // eslint-disable-line react-hooks/exhaustive-deps

  const entry = store.sidebars[sidebarId];
  const activeSectionId = (entry?.activeSectionId ?? resolvedInitial.activeSectionId) as TSectionId;
  const activeChildId = (entry?.activeChildId ?? resolvedInitial.activeChildId) as TChildId | undefined;
  const expandedSectionIds = useMemo(
    () => new Set(entry?.expandedSectionIds ?? resolvedInitial.expandedSectionIds),
    [entry?.expandedSectionIds, resolvedInitial.expandedSectionIds],
  );
  const detached = entry?.detached ?? false;

  const selectSection = useCallback(
    (sectionId: string) => {
      store.setActiveSection(sidebarId, sectionId);
      // Auto-expand
      const current = store.sidebars[sidebarId];
      if (current && !current.expandedSectionIds.includes(sectionId)) {
        store.setExpanded(sidebarId, [...current.expandedSectionIds, sectionId]);
      }
    },
    [sidebarId, store],
  );

  const selectChild = useCallback(
    (parentId: string, childId: string) => {
      store.setActiveChild(sidebarId, parentId, childId);
    },
    [sidebarId, store],
  );

  const toggleExpand = useCallback(
    (sectionId: string) => {
      store.toggleExpand(sidebarId, sectionId);
    },
    [sidebarId, store],
  );

  const navigate = useCallback(
    (id: TSectionId | TChildId) => {
      const parent = childToParent.get(id);
      if (parent) {
        store.setActiveChild(sidebarId, parent, id);
        const current = store.sidebars[sidebarId];
        if (current && !current.expandedSectionIds.includes(parent)) {
          store.setExpanded(sidebarId, [...current.expandedSectionIds, parent]);
        }
      } else {
        store.setActiveSection(sidebarId, id);
      }
    },
    [sidebarId, childToParent, store],
  );

  const activeId = (activeChildId ?? activeSectionId) as TSectionId | TChildId;

  return {
    activeId,
    activeSectionId,
    activeChildId,
    expandedSectionIds,
    selectSection,
    selectChild,
    toggleExpand,
    navigate,
    detached,
  };
}
