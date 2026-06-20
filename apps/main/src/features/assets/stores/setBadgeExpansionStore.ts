import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

/**
 * Per-surface expansion state for the active-target set badges.
 *
 * The set glyphs on a media card collapse to a single count badge by default
 * and expand to the full per-set row on demand. That choice is intentionally
 * NOT per card — it's a property of the *surface* the card lives on (gallery,
 * viewer, …), so toggling once applies to every card on that surface and is
 * remembered there independently. See {@link buildActiveTargetWidgets}.
 */
const STORAGE_KEY = 'pixsim7-set-badge-expansion';

interface SetBadgeExpansionState {
  /** Expanded flag keyed by surface id; absent = collapsed (the default). */
  expandedBySurface: Record<string, boolean>;
  toggle: (surface: string) => void;
  setExpanded: (surface: string, expanded: boolean) => void;
}

export const useSetBadgeExpansionStore = create<SetBadgeExpansionState>()(
  persist(
    (set) => ({
      expandedBySurface: {},
      toggle: (surface) =>
        set((s) => ({
          expandedBySurface: {
            ...s.expandedBySurface,
            [surface]: !(s.expandedBySurface[surface] ?? false),
          },
        })),
      setExpanded: (surface, expanded) =>
        set((s) => ({
          expandedBySurface: { ...s.expandedBySurface, [surface]: expanded },
        })),
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
);

/**
 * Reactive read of one surface's expanded state. Selects the value (not the
 * `expandedBySurface` object) so a card only re-renders when *its* surface
 * flips, and defaults to collapsed.
 */
export const useSurfaceSetBadgesExpanded = (surface: string): boolean =>
  useSetBadgeExpansionStore((s) => s.expandedBySurface[surface] ?? false);

registerStore({ id: 'assets:set-badge-expansion', key: STORAGE_KEY });
