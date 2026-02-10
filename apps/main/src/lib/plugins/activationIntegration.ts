/**
 * Activation Integration
 *
 * Integrates the unified PluginActivationManager with existing activation
 * mechanisms (pluginConfigStore, PluginManager) to provide consistent
 * enable/disable behavior across all plugin families.
 */

import {
  pluginConfigStore,
  getPluginConfig,
  setPluginConfig,
  isPluginEnabled as legacyIsPluginEnabled,
} from '../../stores/pluginConfigStore';

import type { PluginFamily } from './pluginSystem';
import { pluginActivationManager, pluginCatalog } from './pluginSystem';

// ============================================================================
// Unified Activation API
// ============================================================================

/**
 * Check if a plugin is active (unified interface)
 *
 * This checks:
 * 1. The plugin catalog for activation state
 * 2. Falls back to pluginConfigStore if not in catalog
 */
export function isPluginActive(pluginId: string): boolean {
  // Check catalog first
  const metadata = pluginCatalog.get(pluginId);
  if (metadata) {
    return metadata.activationState === 'active';
  }

  // Fall back to legacy pluginConfigStore
  return legacyIsPluginEnabled(pluginId, true);
}

/**
 * Activate a plugin (unified interface)
 *
 * This will:
 * 1. Update the catalog
 * 2. Update pluginConfigStore for compatibility
 * 3. Trigger any listeners
 */
export async function activatePlugin(pluginId: string): Promise<boolean> {
  const success = await pluginActivationManager.activate(pluginId);

  if (success) {
    // Sync with pluginConfigStore for backwards compatibility
    setPluginConfig(pluginId, { enabled: true });
  }

  return success;
}

/**
 * Deactivate a plugin (unified interface)
 *
 * This will:
 * 1. Update the catalog
 * 2. Update pluginConfigStore for compatibility
 * 3. Trigger any listeners
 */
export async function deactivatePlugin(pluginId: string): Promise<boolean> {
  const success = await pluginActivationManager.deactivate(pluginId);

  if (success) {
    // Sync with pluginConfigStore for backwards compatibility
    setPluginConfig(pluginId, { enabled: false });
  }

  return success;
}

/**
 * Toggle plugin activation state
 */
export async function togglePlugin(pluginId: string): Promise<boolean> {
  return isPluginActive(pluginId)
    ? deactivatePlugin(pluginId)
    : activatePlugin(pluginId);
}

/**
 * Check if a plugin can be disabled
 */
export function canDisablePlugin(pluginId: string): boolean {
  return pluginActivationManager.catalog.canDisable(pluginId);
}

// ============================================================================
// Initialization & Sync
// ============================================================================

/**
 * Initialize activation states from pluginConfigStore
 *
 * This syncs the catalog with existing plugin configs, ensuring
 * that user preferences are preserved.
 */
export function initializeActivationStates(): void {
  // Get all plugins from catalog
  const plugins = pluginCatalog.getAll();

  // Subscribe to pluginConfigStore to keep in sync
  pluginConfigStore.subscribe(($config) => {
    // Update catalog based on config changes
    for (const plugin of plugins) {
      const config = $config[plugin.id];
      if (config && 'enabled' in config) {
        const desiredState = config.enabled ? 'active' : 'inactive';
        if (plugin.activationState !== desiredState && plugin.canDisable) {
          pluginCatalog.setActivationState(plugin.id, desiredState);
        }
      }
    }
  });

  // Initial sync from config store to catalog
  for (const plugin of plugins) {
    if (!plugin.canDisable) {
      // Always-on plugins stay active
      continue;
    }

    const config = getPluginConfig(plugin.id);
    const enabled = config.enabled !== undefined ? config.enabled : true;
    const desiredState = enabled ? 'active' : 'inactive';

    if (plugin.activationState !== desiredState) {
      pluginCatalog.setActivationState(plugin.id, desiredState);
    }
  }
}

/**
 * Export activation state to pluginConfigStore
 *
 * Useful when you want to persist the current activation states
 */
export function exportActivationStates(): void {
  const plugins = pluginCatalog.getAll();

  for (const plugin of plugins) {
    const enabled = plugin.activationState === 'active';
    setPluginConfig(plugin.id, { enabled });
  }
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Activate all plugins of a specific family
 */
export async function activateFamily(family: PluginFamily): Promise<void> {
  const plugins = pluginCatalog.getByFamily(family);

  for (const plugin of plugins) {
    if (plugin.canDisable) {
      await activatePlugin(plugin.id);
    }
  }
}

/**
 * Deactivate all plugins of a specific family
 */
export async function deactivateFamily(family: PluginFamily): Promise<void> {
  const plugins = pluginCatalog.getByFamily(family);

  for (const plugin of plugins) {
    if (plugin.canDisable) {
      await deactivatePlugin(plugin.id);
    }
  }
}

/**
 * Activate all user plugins (non-builtins)
 */
export async function activateUserPlugins(): Promise<void> {
  const plugins = pluginCatalog.getUserPlugins();

  for (const plugin of plugins) {
    if (plugin.canDisable) {
      await activatePlugin(plugin.id);
    }
  }
}

/**
 * Deactivate all user plugins (non-builtins)
 */
export async function deactivateUserPlugins(): Promise<void> {
  const plugins = pluginCatalog.getUserPlugins();

  for (const plugin of plugins) {
    if (plugin.canDisable) {
      await deactivatePlugin(plugin.id);
    }
  }
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get all active plugins
 */
export function getActivePlugins() {
  return pluginCatalog.getActive();
}

/**
 * Get all inactive plugins
 */
export function getInactivePlugins() {
  return pluginCatalog.getAll().filter(p => p.activationState === 'inactive');
}

/**
 * Get activation statistics
 */
export function getActivationStats() {
  const all = pluginCatalog.getAll();
  const active = all.filter(p => p.activationState === 'active');
  const inactive = all.filter(p => p.activationState === 'inactive');
  const canDisable = all.filter(p => p.canDisable);
  const alwaysOn = all.filter(p => !p.canDisable);

  return {
    total: all.length,
    active: active.length,
    inactive: inactive.length,
    canDisable: canDisable.length,
    alwaysOn: alwaysOn.length,
    activeByFamily: {} as Record<string, number>,
    inactiveByFamily: {} as Record<string, number>,
  };
}
