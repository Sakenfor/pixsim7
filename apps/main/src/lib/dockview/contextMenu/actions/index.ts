/**
 * Context Menu Actions
 *
 * Registers all context menu actions with the global registry.
 * Import this module to register actions.
 *
 * Composite submenus group related actions:
 * - "Panels" submenu: quick-add, add panel, split/move/focus
 * - "Layout Presets" submenu: save, load, delete, reset
 * - "Generate" submenu (in assetActions): send-to-generator, shortcuts, queue
 * - "Copy" submenu (in assetActions): copy URL, copy ID
 */

import { useContextMenuHistoryStore } from '@features/workspace/stores/contextMenuHistoryStore';

import { contextMenuRegistry } from '../ContextMenuRegistry';
import type { MenuAction } from '../types';

import {
  addPanelAction,
  getQuickAddActions,
  getEditQuickAddActions,
} from './addPanelActions';
import { assetActions } from './assetActions';
import { contextHubActions } from './contextHubActions';
import {
  splitPanelAction,
  movePanelAction,
} from './layoutActions';
import {
  floatPanelAction,
  focusPanelAction,
  registerPanelActionCapabilities,
} from './panelActions';
import {
  savePresetAction,
  loadPresetAction,
  deletePresetAction,
  resetLayoutAction,
} from './presetActions';

// Export individual action modules
export * from './panelActions';
export * from './layoutActions';
export * from './presetActions';
export * from './addPanelActions';
export * from './assetActions';
export * from './contextHubActions';

// ─────────────────────────────────────────────────────────────────────────────
// Composite Submenus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Panels submenu - groups panel add/split/move/focus actions.
 */
const panelsSubmenuAction: MenuAction = {
  id: 'composite:panels',
  label: 'Panels',
  icon: 'app-window',
  category: 'panels',
  hideWhenEmpty: true,
  availableIn: ['background', 'tab', 'panel-content'],
  children: (ctx) => {
    const items: MenuAction[] = [];

    // Section 1: Quick add shortcuts (dynamic from pinned panels)
    const dynamicQuickAdd = getQuickAddActions(ctx)
      .filter(a => a.visible?.(ctx) !== false)
      .map(a => ({ ...a, category: undefined }));
    items.push(...dynamicQuickAdd);

    // Section 2: Add Panel submenu
    if (addPanelAction.visible?.(ctx) !== false) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], divider: true, sectionLabel: 'Add' };
      }
      items.push({ ...addPanelAction, category: undefined });
    }

    // Section 3: Layout actions (Split, Move, Focus)
    const layoutItems = [splitPanelAction, movePanelAction, focusPanelAction]
      .filter(a => a.visible?.(ctx) !== false);
    if (layoutItems.length > 0) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], divider: true, sectionLabel: 'Layout' };
      }
      items.push(...layoutItems.map(a => ({ ...a, category: undefined })));
    }

    // Section 4: Edit Quick Add
    if (ctx.panelRegistry) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], divider: true };
      }
      items.push({ ...getEditQuickAddActions(ctx), category: undefined });
    }

    if (items.length === 0) {
      return [{
        id: 'composite:panels:empty',
        label: 'No panel actions available',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    return items;
  },
  execute: () => {},
};

/**
 * Layout Presets submenu - groups all preset management actions.
 */
const layoutPresetsSubmenuAction: MenuAction = {
  id: 'composite:layout-presets',
  label: 'Layout Presets',
  icon: 'bookmark',
  category: 'preset',
  hideWhenEmpty: true,
  availableIn: ['background', 'tab', 'panel-content'],
  children: (ctx) => {
    const items: MenuAction[] = [];

    if (savePresetAction.visible?.(ctx) !== false) {
      items.push({ ...savePresetAction, category: undefined });
    }
    if (loadPresetAction.visible?.(ctx) !== false) {
      items.push({ ...loadPresetAction, category: undefined });
    }
    if (deletePresetAction.visible?.(ctx) !== false) {
      items.push({ ...deletePresetAction, category: undefined });
    }
    if (resetLayoutAction.visible?.(ctx) !== false) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], divider: true };
      }
      items.push({ ...resetLayoutAction, category: undefined });
    }

    if (items.length === 0) {
      return [{
        id: 'composite:layout-presets:empty',
        label: 'No preset actions available',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    return items;
  },
  execute: () => {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All actions combined.
 *
 * Individual actions (close, maximize, restore, properties) come through
 * the capability system via registerPanelActionCapabilities().
 */
export const allActions = [
  ...assetActions,
  // Panel top-level: Float Panel (close/maximize/restore/properties via capabilities)
  floatPanelAction,
  // Composite submenus
  panelsSubmenuAction,
  layoutPresetsSubmenuAction,
  // Context hub
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
  // Panel capability actions (close, maximize, restore, float, properties)
  registerPanelActionCapabilities();
  // Quick-add and preset actions are now inside composite submenus,
  // so we no longer register them as standalone capability actions.
  contextMenuRegistry.registerAll(allActions);

  // Per-context category ordering: background context shows panels first
  contextMenuRegistry.setContextCategoryPriority('background', {
    'panels': 5,
    'preset': 10,
    'panel': 15,
  });

  // Wire history provider for recently used actions
  contextMenuRegistry.setHistoryProvider({
    getRecentForContext: (contextType, limit) =>
      useContextMenuHistoryStore.getState().getRecentForContext(contextType, limit),
    recordUsage: (actionId, contextType) =>
      useContextMenuHistoryStore.getState().recordUsage(actionId, contextType),
  });
}
