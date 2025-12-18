/**
 * Preset Actions
 *
 * Context menu actions for layout presets:
 * - Save Current Layout
 * - Load Preset (nested menu)
 * - Reset to Default
 *
 * Presets are scoped to specific dockviews or can be global.
 */

import type { MenuAction, MenuActionContext } from '../types';

/**
 * Preset scope determines which dockviews a preset applies to
 */
export type PresetScope = 'workspace' | 'control-center' | 'asset-viewer' | 'all';

/**
 * Layout preset stored in the system
 */
export interface LayoutPreset {
  id: string;
  name: string;
  scope: PresetScope;
  /** Dockview serialized layout (from api.toJSON()) */
  layout: any;
  description?: string;
  icon?: string;
  isDefault?: boolean;
  createdAt?: number;
}

/**
 * Get presets for a specific scope from workspaceStore
 */
function getPresetsForScope(ctx: MenuActionContext): LayoutPreset[] {
  if (!ctx.workspaceStore) return [];

  const state = ctx.workspaceStore.getState();
  const currentScope = ctx.currentDockviewId || 'workspace';

  // Convert old WorkspacePreset to LayoutPreset format
  // TODO: Migrate workspaceStore to use new LayoutPreset format
  return state.presets.map(p => ({
    id: p.id,
    name: p.name,
    scope: 'workspace' as PresetScope, // Old presets are workspace-scoped
    layout: p.layout, // This is still old format, needs migration
    description: p.description,
    icon: p.icon,
    isDefault: p.isDefault,
    createdAt: p.createdAt,
  })).filter(p => p.scope === currentScope || p.scope === 'all');
}

/**
 * Save current layout as a new preset
 */
export const savePresetAction: MenuAction = {
  id: 'preset:save',
  label: 'Save Layout as Preset...',
  icon: 'save',
  category: 'preset',
  availableIn: ['background'],
  visible: (ctx) => !!ctx.api,
  execute: async (ctx) => {
    if (!ctx.api) return;

    // Prompt for preset name
    const name = window.prompt('Enter preset name:');
    if (!name) return;

    // Serialize the current dockview layout
    const layout = ctx.api.toJSON();
    const scope = ctx.currentDockviewId || 'workspace';

    // Save to workspaceStore
    // TODO: Update workspaceStore to handle dockview serialized layouts
    if (ctx.workspaceStore) {
      const state = ctx.workspaceStore.getState();
      // For now, save using existing method (will need migration)
      state.savePreset(name);
      console.log('[PresetActions] Saved preset:', name, 'scope:', scope, 'layout:', layout);
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
  availableIn: ['background'],
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
        if (ctx.workspaceStore) {
          ctx.workspaceStore.getState().loadPreset(preset.id);
          console.log('[PresetActions] Loaded preset:', preset.name);
        }
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
  availableIn: ['background'],
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
          console.log('[PresetActions] Deleted preset:', preset.name);
        }
      },
    }));
  },
  execute: () => {},
};

/**
 * Reset layout to default
 */
export const resetLayoutAction: MenuAction = {
  id: 'preset:reset',
  label: 'Reset to Default',
  icon: 'rotate-ccw',
  category: 'preset',
  divider: true,
  availableIn: ['background'],
  visible: (ctx) => !!ctx.workspaceStore,
  execute: (ctx) => {
    if (!ctx.workspaceStore) return;

    if (window.confirm('Reset layout to default? This will lose any unsaved changes.')) {
      ctx.workspaceStore.getState().reset();
      console.log('[PresetActions] Reset to default layout');
    }
  },
};

/**
 * All preset actions
 */
export const presetActions: MenuAction[] = [
  savePresetAction,
  loadPresetAction,
  deletePresetAction,
  resetLayoutAction,
];
