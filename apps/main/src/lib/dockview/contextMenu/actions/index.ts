/**
 * Context Menu Actions
 *
 * Registers all context menu actions with the global registry.
 * Import this module to register actions.
 *
 * Composite submenus group related actions:
 * - "Panels" submenu: default panels, related panels, add panel, split/move/focus
 * - "Layout Presets" submenu: save, load, delete, reset
 * - "Generate" submenu (in assetActions): send-to-generator, shortcuts, queue
 * - "Copy" submenu (in assetActions): copy URL, copy ID
 */

import { useContextMenuHistoryStore } from '@features/workspace/stores/contextMenuHistoryStore';

import { contextMenuRegistry } from '../ContextMenuRegistry';
import { resolveCurrentDockview } from '../resolveCurrentDockview';
import type { MenuAction } from '../types';

import { addPanelAction, getDefaultScopePanelSubmenu } from './addPanelActions';
import { assetActions } from './assetActions';
import { buildRelatedPanelActions, contextHubActions } from './contextHubActions';
import { cubeActions } from './cubeActions';
import { debugActions } from './debugActions';
import { devContextActions } from './devContextActions';
import {
  splitPanelAction,
  movePanelAction,
} from './layoutActions';
import {
  floatPanelAction,
  focusPanelAction,
  pinTabAction,
  registerPanelActionCapabilities,
  unpinTabAction,
} from './panelActions';
import {
  savePresetAction,
  loadPresetAction,
  deletePresetAction,
  resetLayoutAction,
  getScopeLabel,
} from './presetActions';
import { promptActions } from './promptActions';

// Export individual action modules
export {
  closePanelAction,
  maximizePanelAction,
  restorePanelAction,
  floatPanelAction,
  pinTabAction,
  unpinTabAction,
  focusPanelAction,
  propertiesAction,
  panelPropertiesAction,
  closeOtherPanelsAction,
  closeAllInGroupAction,
  panelActionDefinitions,
  registerPanelActionCapabilities,
  panelActions,
} from './panelActions';
export {
  splitRightAction,
  splitDownAction,
  moveToNewGroupAction,
  joinLeftGroupAction,
  joinRightGroupAction,
  splitPanelAction,
  movePanelAction,
  layoutActions,
} from './layoutActions';
export type { LayoutPreset, PresetScope } from './presetActions';
export {
  getScopeLabel,
  savePresetAction,
  loadPresetAction,
  deletePresetAction,
  resetLayoutAction,
  presetActionDefinitions,
  registerPresetActionCapabilities,
  presetActions,
} from './presetActions';
export {
  addPanelAction,
  addPanelActions,
  getDefaultScopePanelSubmenu,
} from './addPanelActions';
export { assetActions } from './assetActions';
export { contextHubActions } from './contextHubActions';
export { cubeActions } from './cubeActions';
export { debugActions } from './debugActions';
export { devContextActions } from './devContextActions';
export { promptActions } from './promptActions';

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
    const { api } = resolveCurrentDockview(ctx);

    // Add-related entries (no internal dividers — all are "add a panel" actions,
    // ordered most-specific to most-generic).

    // 1. Default Panels — curated list for scoped docks (AssetViewer, QuickGen,
    //    sub-panel hosts). Hidden when scope is too broad or empty.
    const defaultScopeSubmenu = getDefaultScopePanelSubmenu(ctx, api);
    if (defaultScopeSubmenu) {
      items.push({ ...defaultScopeSubmenu, category: undefined });
    }

    // 2. Related Panels — capability-matched panels for the right-clicked
    //    panel. Only meaningful when a specific panel is the click target;
    //    skipped on background context. Moved here from Connect (which is
    //    purely about provider routing now).
    if (ctx.contextType !== 'background') {
      const relatedActions = buildRelatedPanelActions(ctx);
      if (relatedActions && relatedActions.length > 0) {
        items.push({
          id: 'composite:panels:related',
          label: 'Related Panels',
          icon: 'plus-circle',
          availableIn: ['tab', 'panel-content'],
          children: relatedActions,
          execute: () => {},
        });
      }
    }

    // 3. Add Panel — full categorized browser (always present when the dock
    //    has an api).
    // Quick-add pin management lives in MorePanelsFlyout (ActivityBar's
    // layout-grid button) — searchable, draggable, and toggles the same
    // pinnedShortcuts store. A duplicate config submenu here was redundant.
    if (addPanelAction.visible?.(ctx) !== false) {
      items.push({ ...addPanelAction, category: undefined });
    }

    // Layout section — Split, Move, Focus. Divider separates from add-actions.
    const layoutItems = [splitPanelAction, movePanelAction, focusPanelAction]
      .filter(a => a.visible?.(ctx) !== false);
    if (layoutItems.length > 0) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], divider: true, sectionLabel: 'Layout' };
      }
      items.push(...layoutItems.map(a => ({ ...a, category: undefined })));
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
    const scopeLabel = getScopeLabel(ctx);

    // Add scope header so users know which area's presets they're seeing
    if (scopeLabel) {
      items.push({
        id: 'composite:layout-presets:scope-header',
        label: scopeLabel,
        icon: 'layout',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        divider: true,
        execute: () => {},
      });
    }

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
  pinTabAction,
  unpinTabAction,
  // Composite submenus
  panelsSubmenuAction,
  layoutPresetsSubmenuAction,
  // Prompt text actions
  ...promptActions,
  // Context hub
  ...contextHubActions,
  // Cube spawn
  ...cubeActions,
  // Dockview debug
  ...debugActions,
  // Dev context → AI Assistant
  ...devContextActions,
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
    'debug': 90,
  });

  // Wire history provider for recently used actions
  contextMenuRegistry.setHistoryProvider({
    getRecentForContext: (contextType, limit) =>
      useContextMenuHistoryStore.getState().getRecentForContext(contextType, limit),
    recordUsage: (actionId, contextType) =>
      useContextMenuHistoryStore.getState().recordUsage(actionId, contextType),
  });
}
