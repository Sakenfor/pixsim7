/* eslint-disable react-refresh/only-export-components */
/**
 * Edge Insets Registry
 *
 * Generic publisher/subscriber primitive for "I occupy N pixels on this
 * edge" — used so retractable widgets can stack against each other and
 * neighbouring UI can push out of their way.
 *
 * Three ways to consume it:
 *
 *   1. **Global** (default) — call `useEdgeInset` / `useEdgeOffset` /
 *      `useInsetOn` / `useContentInset` directly. State lives in a single
 *      app-level registry, used today by ActivityBar, ControlCenterDock,
 *      MinimizedPanelStack and App.tsx for screen-edge insets.
 *
 *   2. **Scoped via React context** — wrap any subtree in
 *      `<EdgeInsetsScope scope="my-feature">`. Children calling the same
 *      generic hooks transparently target a fresh registry confined to that
 *      subtree. Use this when an inset only makes sense locally (e.g. a tool
 *      sidebar inside a panel — pushing the global app left edge would shift
 *      everything else, which is wrong).
 *
 *   3. **Programmatic** — call `createEdgeInsetsRegistry()` to get a fully
 *      isolated registry plus its bound hooks. Useful for tests, modules
 *      that need to subscribe outside React, or when you want to expose a
 *      pre-bound hook surface from a feature module.
 *
 * Consumer queries:
 *   - useEdgeOffset(id)      — priority-based same-edge stacking offset
 *   - useInsetOn(edge, id?)  — total visible inset on an edge
 *   - useContentInset(edge)  — push-content inset for host margins/padding
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useEffect } from 'react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeInset {
  id: string;
  /** Which edge this widget occupies in its registry's coordinate space */
  edge: Edge;
  /** Pixels this widget occupies on its edge */
  size: number;
  /** Whether the widget is currently expanded / visible */
  visible: boolean;
  /** Lower number = closer to the edge. Used for same-edge stacking order. */
  priority: number;
  /** Whether this widget should push the registry's "main content" area when visible */
  pushContent: boolean;
}

interface EdgeInsetsState {
  insets: Map<string, EdgeInset>;
  register: (inset: EdgeInset) => void;
  unregister: (id: string) => void;
}

export interface EdgeInsetsRegistry {
  /** Debug name for this registry (e.g. "global", "asset-viewer"). */
  scope: string;

  /**
   * Underlying zustand store. Exposed so non-React callers (selectors, tests)
   * can read or subscribe imperatively.
   */
  useStore: UseBoundStore<StoreApi<EdgeInsetsState>>;

  /**
   * Register a widget's edge presence. Updates automatically when values
   * change. Unregisters on unmount.
   */
  useEdgeInset: (
    id: string,
    edge: Edge,
    size: number,
    visible: boolean,
    priority: number,
    pushContent?: boolean,
  ) => void;

  /**
   * Same-edge stacking offset for a specific widget — sum of sizes of
   * higher-priority (lower number) visible widgets on the same edge.
   */
  useEdgeOffset: (id: string) => number;

  /**
   * Total visible inset on a given edge, optionally excluding a widget by id.
   * Used for cross-edge awareness (e.g. bottom dock reads left inset).
   */
  useInsetOn: (edge: Edge, excludeId?: string) => number;

  /**
   * Total push-content inset on a given edge — only counts widgets with
   * `pushContent: true`. Used by host containers for margins/padding.
   */
  useContentInset: (edge: Edge) => number;
}

/**
 * Create an isolated edge-insets registry. Fresh state, fresh hooks; nothing
 * leaks to the global registry. Pass a unique scope name (e.g. "asset-viewer")
 * so debug tooling can identify it.
 */
export function createEdgeInsetsRegistry(scope: string = 'unnamed'): EdgeInsetsRegistry {
  const useStore = create<EdgeInsetsState>((set) => ({
    insets: new Map(),
    register: (inset) =>
      set((s) => {
        const next = new Map(s.insets);
        next.set(inset.id, inset);
        return { insets: next };
      }),
    unregister: (id) =>
      set((s) => {
        const next = new Map(s.insets);
        next.delete(id);
        return { insets: next };
      }),
  }));

  function useEdgeInset(
    id: string,
    edge: Edge,
    size: number,
    visible: boolean,
    priority: number,
    pushContent = true,
  ): void {
    useEffect(() => {
      useStore.getState().register({ id, edge, size, visible, priority, pushContent });
    }, [id, edge, size, visible, priority, pushContent]);

    useEffect(
      () => () => {
        useStore.getState().unregister(id);
      },
      [id],
    );
  }

  function useEdgeOffset(id: string): number {
    return useStore((s) => {
      const self = s.insets.get(id);
      if (!self) return 0;

      let offset = 0;
      for (const inset of s.insets.values()) {
        if (
          inset.id !== id &&
          inset.edge === self.edge &&
          inset.visible &&
          inset.priority < self.priority
        ) {
          offset += inset.size;
        }
      }
      return offset;
    });
  }

  function useInsetOn(edge: Edge, excludeId?: string): number {
    return useStore((s) => {
      let total = 0;
      for (const inset of s.insets.values()) {
        if (inset.edge === edge && inset.visible && inset.id !== excludeId) {
          total += inset.size;
        }
      }
      return total;
    });
  }

  function useContentInset(edge: Edge): number {
    return useStore((s) => {
      let total = 0;
      for (const inset of s.insets.values()) {
        if (inset.edge === edge && inset.visible && inset.pushContent) {
          total += inset.size;
        }
      }
      return total;
    });
  }

  return { scope, useStore, useEdgeInset, useEdgeOffset, useInsetOn, useContentInset };
}

// ---------------------------------------------------------------------------
// Default global registry — App-level edges (activity bar, control center, …)
// ---------------------------------------------------------------------------

const globalEdgeInsets = createEdgeInsetsRegistry('global');

/** Global registry's underlying store — kept as a named export for legacy callers. */
export const useEdgeInsetsStore = globalEdgeInsets.useStore;

// ---------------------------------------------------------------------------
// React context layer — generic hooks resolve to the nearest <EdgeInsetsScope>
// ---------------------------------------------------------------------------

const EdgeInsetsContext = createContext<EdgeInsetsRegistry>(globalEdgeInsets);

interface EdgeInsetsScopeProps {
  /** Optional debug name for the scope (e.g. "asset-viewer", "prompt-composer"). */
  scope?: string;
  children: ReactNode;
}

/**
 * Provide an isolated edge-insets registry for everything beneath this point
 * in the tree. Use when an edge inset is only meaningful inside a feature
 * (a tool sidebar inside a panel, say) and pushing the global app edge would
 * be the wrong thing.
 *
 * Children that call the generic `useEdgeInset` / `useInsetOn` /
 * `useContentInset` / `useEdgeOffset` hooks will target this scoped registry
 * instead of the global one. Existing callers outside any scope keep using
 * the global registry exactly as before.
 */
export function EdgeInsetsScope({ scope, children }: EdgeInsetsScopeProps) {
  // useState lazy-init so the registry is created exactly once per provider
  // mount. Recreating it on every render would orphan all registrations.
  const [registry] = useState(() => createEdgeInsetsRegistry(scope));
  return <EdgeInsetsContext.Provider value={registry}>{children}</EdgeInsetsContext.Provider>;
}

/** Read the currently active registry — useful for tests / non-hook contexts. */
export function useEdgeInsetsRegistry(): EdgeInsetsRegistry {
  return useContext(EdgeInsetsContext);
}

// ── Generic hooks (resolve to the nearest scope, or global) ──────────────

export function useEdgeInset(
  id: string,
  edge: Edge,
  size: number,
  visible: boolean,
  priority: number,
  pushContent = true,
): void {
  const registry = useContext(EdgeInsetsContext);
  registry.useEdgeInset(id, edge, size, visible, priority, pushContent);
}

export function useEdgeOffset(id: string): number {
  const registry = useContext(EdgeInsetsContext);
  return registry.useEdgeOffset(id);
}

export function useInsetOn(edge: Edge, excludeId?: string): number {
  const registry = useContext(EdgeInsetsContext);
  return registry.useInsetOn(edge, excludeId);
}

export function useContentInset(edge: Edge): number {
  const registry = useContext(EdgeInsetsContext);
  return registry.useContentInset(edge);
}
