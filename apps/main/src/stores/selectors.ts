/**
 * Stable selector helpers to prevent unnecessary re-renders.
 * These selectors avoid inline object creation and maintain referential equality
 * when underlying values haven't changed.
 */

import type { ControlCenterState } from '@features/controlCenter/stores/controlCenterStore';

// ─────────────────────────────────────────────────────────────────────────────
// Control Center Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const ccSelectors = {
  /** Dock open/pinned state */
  dockState: (s: ControlCenterState) => ({
    open: s.open,
    pinned: s.pinned,
    height: s.height,
  }),

  /** Active module in control center */
  activeModule: (s: ControlCenterState) => s.activeModule,

  /** Dock position and layout */
  dockLayout: (s: ControlCenterState) => ({
    dockPosition: s.dockPosition,
    layoutBehavior: s.layoutBehavior,
    conformToOtherPanels: s.conformToOtherPanels,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Generations Store Selectors
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Generation selectors are now in generationsStore.ts
// Import { generationsSelectors } from './generationsStore' to use them.
