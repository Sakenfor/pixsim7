/**
 * Cube Highlight Store
 *
 * Transient (non-persisted) store for ephemeral hover highlight state.
 * Used by CubeHeaderChips (hover) to signal MinimizedPanelStack (nudge animation).
 */

import { create } from 'zustand';

interface CubeHighlightState {
  highlightedInstanceId: string | null;
  setHighlighted: (instanceId: string) => void;
  clearHighlighted: () => void;
}

export const useCubeHighlightStore = create<CubeHighlightState>((set) => ({
  highlightedInstanceId: null,
  setHighlighted: (instanceId) => set({ highlightedInstanceId: instanceId }),
  clearHighlighted: () => set({ highlightedInstanceId: null }),
}));
