/**
 * Context Menu Actions
 *
 * Registers all context menu actions with the global registry.
 * Import this module to register actions.
 */

import { contextMenuRegistry } from '../ContextMenuRegistry';
import { panelActions } from './panelActions';
import { layoutActions } from './layoutActions';
import { presetActions } from './presetActions';
import { addPanelActions } from './addPanelActions';

// Export individual action modules
export * from './panelActions';
export * from './layoutActions';
export * from './presetActions';
export * from './addPanelActions';

/**
 * All actions combined
 */
export const allActions = [
  ...panelActions,
  ...layoutActions,
  ...presetActions,
  ...addPanelActions,
];

let actionsRegistered = false;

/**
 * Register all actions with the global registry.
 * Call this once at app initialization.
 * Safe to call multiple times - will only register once.
 */
export function registerContextMenuActions() {
  if (actionsRegistered) return;
  actionsRegistered = true;
  contextMenuRegistry.registerAll(allActions);
}
