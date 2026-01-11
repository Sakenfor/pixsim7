/**
 * Context Menu Actions
 *
 * Registers all context menu actions with the global registry.
 * Import this module to register actions.
 */

import { contextMenuRegistry } from '../ContextMenuRegistry';

import {
  addPanelActions,
  registerQuickAddActionCapabilities,
} from './addPanelActions';
import { assetActions } from './assetActions';
import { contextHubActions } from './contextHubActions';
import { layoutActions } from './layoutActions';
import {
  panelActions,
  registerPanelActionCapabilities,
} from './panelActions';
import {
  presetActions,
  registerPresetActionCapabilities,
} from './presetActions';

// Export individual action modules
export * from './panelActions';
export * from './layoutActions';
export * from './presetActions';
export * from './addPanelActions';
export * from './assetActions';
export * from './contextHubActions';

/**
 * All actions combined
 */
export const allActions = [
  ...assetActions,
  ...panelActions,
  ...layoutActions,
  ...presetActions,
  ...addPanelActions,
  ...contextHubActions,
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
  registerPanelActionCapabilities();
  registerPresetActionCapabilities();
  registerQuickAddActionCapabilities();
  contextMenuRegistry.registerAll(allActions);
}
