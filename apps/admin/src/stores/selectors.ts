/**
 * Stable selector helpers to prevent unnecessary re-renders.
 * These selectors avoid inline object creation and maintain referential equality
 * when underlying values haven't changed.
 */

import type { ControlCenterState } from './controlCenterStore';

// ─────────────────────────────────────────────────────────────────────────────
// Control Center Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const ccSelectors = {
  /** Basic operation configuration (operation type, provider, preset) */
  operationBasics: (s: ControlCenterState) => ({
    operationType: s.operationType,
    providerId: s.providerId,
    presetId: s.presetId,
  }),

  /** Selected preset parameters */
  presetParams: (s: ControlCenterState) => s.presetParams,

  /** Whether asset generation is in progress */
  generating: (s: ControlCenterState) => s.generating,

  /** Current operation type */
  operationType: (s: ControlCenterState) => s.operationType,

  /** Selected provider ID */
  providerId: (s: ControlCenterState) => s.providerId,

  /** Selected preset ID */
  presetId: (s: ControlCenterState) => s.presetId,

  /** Recent prompts history */
  recentPrompts: (s: ControlCenterState) => s.recentPrompts,

  /** Dock open/pinned state */
  dockState: (s: ControlCenterState) => ({
    open: s.open,
    pinned: s.pinned,
    height: s.height,
  }),

  /** Active module in control center */
  activeModule: (s: ControlCenterState) => s.activeModule,
};

// ─────────────────────────────────────────────────────────────────────────────
// Generations Store Selectors
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Generation selectors are now in generationsStore.ts
// Import { generationsSelectors } from './generationsStore' to use them.
