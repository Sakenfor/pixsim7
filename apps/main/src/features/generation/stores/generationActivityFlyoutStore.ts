/**
 * Generation activity flyout control store.
 *
 * Lifts the open state + count mode (active vs paused) of the activity-bar
 * generations flyout out of the widget's local React state so other surfaces
 * can open it programmatically — e.g. the bottom-right pause toast's
 * "View paused" action opens the very same popup pre-switched to paused.
 *
 * Session-scoped only (not persisted): it's transient UI state.
 */
import { create } from 'zustand';

export type GenerationActivityCountMode = 'active' | 'paused';

interface GenerationActivityFlyoutState {
  open: boolean;
  countMode: GenerationActivityCountMode;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setCountMode: (mode: GenerationActivityCountMode) => void;
  /** Open the flyout, switching to the given count mode. */
  openWith: (mode: GenerationActivityCountMode) => void;
}

export const useGenerationActivityFlyoutStore = create<GenerationActivityFlyoutState>((set) => ({
  open: false,
  countMode: 'active',
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setCountMode: (mode) => set({ countMode: mode }),
  openWith: (mode) => set({ open: true, countMode: mode }),
}));
