/**
 * Stable selector helpers to prevent unnecessary re-renders.
 * These selectors avoid inline object creation and maintain referential equality
 * when underlying values haven't changed.
 */

import type { ControlCenterState } from '@features/controlCenter/stores/controlCenterStore';
import type { DockUiState } from '@features/docks/stores';

// ─────────────────────────────────────────────────────────────────────────────
// Control Center Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const ccSelectors = {
  /** Dock open/pinned state */
  dockState: (s: DockUiState) => ({
    open: s.open,
    pinned: s.pinned,
    size: s.size,
  }),

  /** Active module in control center */
  activeModule: (s: ControlCenterState) => s.activeModule,

  /** Dock position and layout */
  dockLayout: (s: DockUiState) => ({
    dockPosition: s.dockPosition,
    layoutBehavior: s.layoutBehavior,
  }),

  /** CC-specific orchestration flag */
  orchestration: (s: ControlCenterState) => ({
    conformToOtherPanels: s.conformToOtherPanels,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Generations Store Selectors
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Generation selectors are now in generationsStore.ts
// Import { generationsSelectors } from './generationsStore' to use them.
