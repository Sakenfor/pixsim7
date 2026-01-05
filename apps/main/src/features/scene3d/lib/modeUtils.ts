/**
 * Mode Utilities
 *
 * Helpers to map between InspectorMode and the generic runtime mode system.
 */

import type { BaseMode } from '@pixsim7/game.react';

/**
 * Mode detail options for 3D model inspector
 */
export type Model3DModeDetail = 'view' | 'zones' | 'animation';

/**
 * Helper to map InspectorMode to baseMode + modeDetail
 */
export function inspectorModeToRuntime(mode: 'view' | 'zones' | 'animation'): {
  baseMode: BaseMode;
  modeDetail: Model3DModeDetail;
} {
  switch (mode) {
    case 'zones':
      return { baseMode: 'edit', modeDetail: 'zones' };
    case 'animation':
      return { baseMode: 'view', modeDetail: 'animation' };
    case 'view':
    default:
      return { baseMode: 'view', modeDetail: 'view' };
  }
}

/**
 * Helper to map runtime mode back to InspectorMode
 */
export function runtimeToInspectorMode(
  baseMode: BaseMode,
  modeDetail?: string
): 'view' | 'zones' | 'animation' {
  if (modeDetail === 'zones') return 'zones';
  if (modeDetail === 'animation') return 'animation';
  return 'view';
}
