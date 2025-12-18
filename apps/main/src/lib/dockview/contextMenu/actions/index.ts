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

/**
 * Register all actions with the global registry
 * Call this once at app initialization
 */
export function registerContextMenuActions() {
  console.log('[ContextMenu] Registering', allActions.length, 'actions');
  contextMenuRegistry.registerAll(allActions);
}

// Auto-register on import
registerContextMenuActions();
