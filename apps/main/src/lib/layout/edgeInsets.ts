/**
 * Edge Insets Registry
 *
 * A shared layout system where retractable edge widgets (activity bar,
 * control center, future panels) register their edge presence.
 *
 * Consumers can query:
 *  - useEdgeOffset(id)      — priority-based same-edge stacking offset
 *  - useInsetOn(edge, id?)  — total inset on any edge (cross-edge awareness)
 *  - useContentInset(edge)  — push-content inset for main content margins
 */

import { useEffect } from 'react';
import { create } from 'zustand';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeInset {
  id: string;
  /** Which screen edge this widget occupies */
  edge: Edge;
  /** Pixels this widget occupies on its edge */
  size: number;
  /** Whether the widget is currently expanded / visible */
  visible: boolean;
  /** Lower number = closer to screen edge. Used for same-edge stacking order. */
  priority: number;
  /** Whether this widget should push the main content area when visible */
  pushContent: boolean;
}

interface EdgeInsetsState {
  insets: Map<string, EdgeInset>;
  register: (inset: EdgeInset) => void;
  unregister: (id: string) => void;
}

export const useEdgeInsetsStore = create<EdgeInsetsState>((set) => ({
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

// ---------------------------------------------------------------------------
// Registration hook — call from any edge widget
// ---------------------------------------------------------------------------

/**
 * Register a widget's edge presence. Updates automatically when values change.
 * Unregisters on unmount.
 */
export function useEdgeInset(
  id: string,
  edge: Edge,
  size: number,
  visible: boolean,
  priority: number,
  pushContent = true,
): void {
  useEffect(() => {
    useEdgeInsetsStore.getState().register({ id, edge, size, visible, priority, pushContent });
  }, [id, edge, size, visible, priority, pushContent]);

  useEffect(
    () => () => {
      useEdgeInsetsStore.getState().unregister(id);
    },
    [id],
  );
}

// ---------------------------------------------------------------------------
// Reader hooks
// ---------------------------------------------------------------------------

/**
 * Same-edge stacking offset for a specific widget.
 * Returns the sum of sizes of higher-priority (lower number) visible widgets
 * on the same edge. Used by widgets to position themselves.
 */
export function useEdgeOffset(id: string): number {
  return useEdgeInsetsStore((s) => {
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

/**
 * Total visible inset on a given edge, optionally excluding a specific widget.
 * Used for cross-edge awareness (e.g. bottom dock reads left inset for positioning).
 */
export function useInsetOn(edge: Edge, excludeId?: string): number {
  return useEdgeInsetsStore((s) => {
    let total = 0;
    for (const inset of s.insets.values()) {
      if (inset.edge === edge && inset.visible && inset.id !== excludeId) {
        total += inset.size;
      }
    }
    return total;
  });
}

/**
 * Total push-content inset on a given edge.
 * Only counts widgets with `pushContent: true`.
 * Used by the main content area (App.tsx) for margins.
 */
export function useContentInset(edge: Edge): number {
  return useEdgeInsetsStore((s) => {
    let total = 0;
    for (const inset of s.insets.values()) {
      if (inset.edge === edge && inset.visible && inset.pushContent) {
        total += inset.size;
      }
    }
    return total;
  });
}
