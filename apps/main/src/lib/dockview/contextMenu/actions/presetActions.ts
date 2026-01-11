/**
 * Preset Actions
 *
 * Context menu actions for layout presets:
 * - Save Current Layout
 * - Load Preset (nested menu)
 * - Reset to Default
 *
 * Presets are scoped to specific dockviews.
 */

import { registerActionsFromDefinitions } from '@lib/capabilities';

import type { LayoutPreset } from '@features/workspace/stores/workspaceStore';

import { resolvePresetScope, type PresetScope } from '../../dockZoneRegistry';
import { menuActionsToCapabilityActions } from '../actionAdapters';
import type { MenuAction, MenuActionContext } from '../types';

import { DOCKVIEW_ACTION_FEATURE_ID, ensureDockviewActionFeature } from './feature';
// Re-export types for convenience
export type { LayoutPreset, PresetScope };

/**
 * Get presets for a specific scope from workspaceStore
 */
function getPresetsForScope(ctx: MenuActionContext): LayoutPreset[] {
  if (!ctx.workspaceStore) return [];

  const state = ctx.workspaceStore.getState();
  const currentScope = resolvePresetScope(ctx.currentDockviewId) as PresetScope;

  return state.getPresetsForScope(currentScope);
}

/**
 * Save current layout as a new preset
 */
export const savePresetAction: MenuAction = {
  id: 'preset:save',
  label: 'Save Layout as Preset...',
  icon: 'save',
  category: 'preset',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => !!ctx.api,
  execute: async (ctx) => {
    if (!ctx.api) return;

    // Prompt for preset name
    const name = window.prompt('Enter preset name:');
    if (!name) return;

    // Get scope from dockview ID
    const scope = resolvePresetScope(ctx.currentDockviewId) as PresetScope;

    // Save to workspaceStore with scope
    if (ctx.workspaceStore) {
      const layout = ctx.api.toJSON();
      ctx.workspaceStore.getState().savePreset(name, scope, layout);
    }
  },
};

/**
 * Load preset submenu - dynamically generates children based on available presets
 */
export const loadPresetAction: MenuAction = {
  id: 'preset:load',
  label: 'Load Preset',
  icon: 'folder-open',
  category: 'preset',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => !!ctx.workspaceStore,
  children: (ctx) => {
    const presets = getPresetsForScope(ctx);

    if (presets.length === 0) {
      return [{
        id: 'preset:load:empty',
        label: 'No presets available',
        availableIn: ['background'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    return presets.map(preset => ({
      id: `preset:load:${preset.id}`,
      label: `${preset.icon || '📋'} ${preset.name}`,
      availableIn: ['background'] as const,
      execute: () => {
        if (!ctx.workspaceStore || !ctx.api) return;
        const state = ctx.workspaceStore.getState();
        const layout = state.getPresetLayout(preset.id);

        if (layout) {
          // Apply layout via dockview API
          ctx.api.fromJSON(layout);
        } else if (ctx.resetDockviewLayout) {
          // Preset has null layout (use default) - reset to default
          ctx.resetDockviewLayout();
        }

        // Update active preset in store
        const scope = resolvePresetScope(ctx.currentDockviewId) as PresetScope;
        state.setActivePreset(scope, preset.id);
      },
    }));
  },
  execute: () => {}, // Parent menu item doesn't execute
};

/**
 * Delete preset submenu - shows deletable presets
 */
export const deletePresetAction: MenuAction = {
  id: 'preset:delete',
  label: 'Delete Preset',
  icon: 'trash',
  category: 'preset',
  variant: 'danger',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => {
    if (!ctx.workspaceStore) return false;
    const presets = getPresetsForScope(ctx);
    // Only show if there are user-created (non-default) presets
    return presets.some(p => !p.isDefault);
  },
  children: (ctx) => {
    const presets = getPresetsForScope(ctx).filter(p => !p.isDefault);

    if (presets.length === 0) {
      return [{
        id: 'preset:delete:empty',
        label: 'No custom presets',
        availableIn: ['background'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    return presets.map(preset => ({
      id: `preset:delete:${preset.id}`,
      label: preset.name,
      variant: 'danger' as const,
      availableIn: ['background'] as const,
      execute: () => {
        if (ctx.workspaceStore && window.confirm(`Delete preset "${preset.name}"?`)) {
          ctx.workspaceStore.getState().deletePreset(preset.id);
        }
      },
    }));
  },
  execute: () => {},
};

/**
 * Reset layout to default for the current scope
 */
export const resetLayoutAction: MenuAction = {
  id: 'preset:reset',
  label: 'Reset to Default',
  icon: 'rotate-ccw',
  category: 'preset',
  divider: true,
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => !!ctx.resetDockviewLayout,
  execute: (ctx) => {
    if (window.confirm('Reset layout to default? This will lose any unsaved changes.')) {
      if (ctx.resetDockviewLayout) {
        ctx.resetDockviewLayout();

        // Reset active preset to default for this scope
        if (ctx.workspaceStore) {
          const scope = resolvePresetScope(ctx.currentDockviewId) as PresetScope;
          const state = ctx.workspaceStore.getState();
          const defaultPreset = state.presets.find(
            (p) => p.isDefault && p.scope === scope
          );
          state.setActivePreset(scope, defaultPreset?.id ?? null);
        }
      }
    }
  },
};

const presetActionDescriptions: Record<string, string> = {
  [savePresetAction.id]: 'Save the current layout as a preset',
  [resetLayoutAction.id]: 'Reset the current layout to the default preset',
};

const presetCapabilityActions: MenuAction[] = [
  savePresetAction,
  resetLayoutAction,
];

const presetCapabilityMapping = menuActionsToCapabilityActions(presetCapabilityActions, {
  featureId: DOCKVIEW_ACTION_FEATURE_ID,
  descriptions: presetActionDescriptions,
});

export const presetActionDefinitions = presetCapabilityMapping.actionDefinitions;

let presetActionCapabilitiesRegistered = false;

export function registerPresetActionCapabilities() {
  if (presetActionCapabilitiesRegistered) return;
  presetActionCapabilitiesRegistered = true;

  ensureDockviewActionFeature();
  registerActionsFromDefinitions(presetActionDefinitions);
}

/**
 * All preset actions
 */
export const presetActions: MenuAction[] = [
  loadPresetAction,
  deletePresetAction,
];
