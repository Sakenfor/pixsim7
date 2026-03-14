import { useState, useCallback, useEffect, useMemo } from 'react';

export interface SidebarNavSection<TChildId extends string = string> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children?: { id: TChildId; label: string; icon?: React.ReactNode }[];
}

export interface UseSidebarNavOptions<
  TSectionId extends string = string,
  TChildId extends string = string,
> {
  /** Section definitions with optional children. */
  sections: SidebarNavSection<TChildId>[];
  /** Initial active item (section or child id). Falls back to first section. */
  initial?: TSectionId | TChildId;
  /** Start all expandable sections open. Default: true. */
  defaultAllExpanded?: boolean;
  /** Section ids to start expanded (ignored when defaultAllExpanded is true). */
  defaultExpandedIds?: TSectionId[];
  /**
   * localStorage key for persisting the active selection.
   * When provided, the active section/child id is saved and restored automatically.
   */
  storageKey?: string;
}

export interface SidebarNavResult<
  TSectionId extends string = string,
  TChildId extends string = string,
> {
  /** The currently active leaf id (child if selected, otherwise section). */
  activeId: TSectionId | TChildId;
  /** The active section id (parent of the active child, or the active section itself). */
  activeSectionId: TSectionId;
  /** The active child id, if a child is selected. */
  activeChildId: TChildId | undefined;
  /** Expanded section id set — pass to SidebarContentLayout. */
  expandedSectionIds: ReadonlySet<string>;
  /** Select a section (resets child). */
  selectSection: (sectionId: string) => void;
  /** Select a child within a section. */
  selectChild: (parentId: string, childId: string) => void;
  /** Toggle a section's expand state. */
  toggleExpand: (sectionId: string) => void;
  /** Navigate directly by any id (section or child). */
  navigate: (id: TSectionId | TChildId) => void;
}

/** Read a persisted active id from localStorage, validating against known section/child ids. */
function readPersistedId<TSectionId extends string, TChildId extends string>(
  storageKey: string | undefined,
  sections: SidebarNavSection<TChildId>[],
): TSectionId | TChildId | undefined {
  if (!storageKey) return undefined;
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return undefined;
    // Validate against known ids
    for (const section of sections) {
      if (section.id === saved) return saved as TSectionId;
      if (section.children) {
        for (const child of section.children) {
          if (child.id === saved) return saved as TChildId;
        }
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

export function useSidebarNav<
  TSectionId extends string = string,
  TChildId extends string = string,
>({
  sections,
  initial,
  defaultAllExpanded = true,
  defaultExpandedIds,
  storageKey,
}: UseSidebarNavOptions<TSectionId, TChildId>): SidebarNavResult<TSectionId, TChildId> {
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

  // Resolve initial state: persisted > explicit initial > first section
  const [initialSectionId, initialChildId] = useMemo(() => {
    const effective = readPersistedId<TSectionId, TChildId>(storageKey, sections) ?? initial;
    if (!effective) {
      const first = sections[0];
      if (!first) return ['' as TSectionId, undefined] as const;
      const firstChild = first.children?.[0];
      return [first.id as TSectionId, firstChild?.id as TChildId | undefined] as const;
    }
    const parent = childToParent.get(effective);
    if (parent) return [parent as TSectionId, effective as TChildId] as const;
    return [effective as TSectionId, undefined] as const;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally init-only

  const [activeSectionId, setActiveSectionId] = useState<TSectionId>(initialSectionId);
  const [activeChildId, setActiveChildId] = useState<TChildId | undefined>(initialChildId);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => {
    if (defaultAllExpanded) {
      return new Set(sections.filter((s) => s.children?.length).map((s) => s.id));
    }
    return new Set(defaultExpandedIds ?? []);
  });

  const activeId = (activeChildId ?? activeSectionId) as TSectionId | TChildId;

  // Persist active id whenever it changes
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, activeId); } catch { /* ignore */ }
  }, [storageKey, activeId]);

  const selectSection = useCallback(
    (sectionId: string) => {
      setActiveSectionId(sectionId as TSectionId);
      setActiveChildId(undefined);
      // Auto-expand if has children
      setExpandedSectionIds((prev) => {
        if (prev.has(sectionId)) return prev;
        return new Set([...prev, sectionId]);
      });
    },
    [],
  );

  const selectChild = useCallback(
    (parentId: string, childId: string) => {
      setActiveSectionId(parentId as TSectionId);
      setActiveChildId(childId as TChildId);
    },
    [],
  );

  const toggleExpand = useCallback((sectionId: string) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const navigate = useCallback(
    (id: TSectionId | TChildId) => {
      const parent = childToParent.get(id);
      if (parent) {
        setActiveSectionId(parent as TSectionId);
        setActiveChildId(id as TChildId);
        setExpandedSectionIds((prev) => {
          if (prev.has(parent)) return prev;
          return new Set([...prev, parent]);
        });
      } else {
        setActiveSectionId(id as TSectionId);
        setActiveChildId(undefined);
      }
    },
    [childToParent],
  );

  return {
    activeId,
    activeSectionId,
    activeChildId,
    expandedSectionIds,
    selectSection,
    selectChild,
    toggleExpand,
    navigate,
  };
}
