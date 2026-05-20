/**
 * setSlotViewStore
 *
 * Transient per-input view-mode flag for asset-set-linked input slots:
 * `'single'` (default) = MediaCard + set-aware chevrons / pill;
 * `'grid'` = `SetGridOverlay` replaces MediaCard, showing the set's members
 * as a thumbnail grid.
 *
 * Intentionally NOT persisted — view mode is an interaction state, not a
 * saved preference. Map grows as inputs gain set links and is left to GC
 * with the page session (entries are tiny and inputIds are uuid).
 *
 * Plan: `set-slot-walk-and-grid`.
 */

import { create } from 'zustand';

export type SetSlotViewMode = 'single' | 'grid';

interface SetSlotViewState {
  viewByInputId: Record<string, SetSlotViewMode>;
  setView: (inputId: string, mode: SetSlotViewMode) => void;
}

export const useSetSlotViewStore = create<SetSlotViewState>((set) => ({
  viewByInputId: {},
  setView: (inputId, mode) =>
    set((s) => ({ viewByInputId: { ...s.viewByInputId, [inputId]: mode } })),
}));
