/**
 * Plugin Configuration Store
 *
 * Centralized storage for plugin configurations (both helpers and interactions).
 * Provides:
 * - Get/Set/Reset config for any plugin by ID
 * - Automatic persistence to localStorage
 * - Type-safe config access
 * - Change notifications via store subscriptions
 *
 * Usage:
 * ```typescript
 * import { pluginConfigStore, getPluginConfig, setPluginConfig } from '@/stores/pluginConfigStore';
 *
 * // Get config
 * const config = getPluginConfig('my-plugin-id');
 *
 * // Set config (merges with existing)
 * setPluginConfig('my-plugin-id', { someOption: 42 });
 *
 * // Reset to defaults
 * resetPluginConfig('my-plugin-id');
 *
 * // Subscribe to changes
 * const unsubscribe = pluginConfigStore.subscribe($config => {
 *   console.log('Config changed:', $config);
 * });
 * ```
 */

import { writable } from 'svelte/store';

/**
 * Plugin configuration map (plugin ID -> config object)
 */
export type PluginConfigMap = Record<string, Record<string, any>>;

/**
 * Local storage key for persisting plugin configs
 */
const STORAGE_KEY = 'pixsim7_plugin_configs';

/**
 * Load initial config from localStorage
 */
function loadFromStorage(): PluginConfigMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Failed to load plugin configs from localStorage:', error);
  }
  return {};
}

/**
 * Save config to localStorage
 */
function saveToStorage(config: PluginConfigMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save plugin configs to localStorage:', error);
  }
}

/**
 * Create the plugin config store
 */
function createPluginConfigStore() {
  const { subscribe, set, update } = writable<PluginConfigMap>(loadFromStorage());

  return {
    subscribe,

    /**
     * Get config for a specific plugin
     */
    get: (pluginId: string): Record<string, any> => {
      let config: Record<string, any> = {};
      const unsubscribe = subscribe(($store) => {
        config = $store[pluginId] || {};
      });
      unsubscribe();
      return config;
    },

    /**
     * Set/update config for a specific plugin (merges with existing)
     */
    set: (pluginId: string, partialConfig: Record<string, any>): void => {
      update(($store) => {
        const newStore = {
          ...$store,
          [pluginId]: {
            ...($store[pluginId] || {}),
            ...partialConfig,
          },
        };
        saveToStorage(newStore);
        return newStore;
      });
    },

    /**
     * Replace entire config for a plugin (no merge)
     */
    replace: (pluginId: string, config: Record<string, any>): void => {
      update(($store) => {
        const newStore = {
          ...$store,
          [pluginId]: config,
        };
        saveToStorage(newStore);
        return newStore;
      });
    },

    /**
     * Reset plugin config to empty (or provide default)
     */
    reset: (pluginId: string, defaultConfig?: Record<string, any>): void => {
      update(($store) => {
        const newStore = { ...$store };
        if (defaultConfig) {
          newStore[pluginId] = { ...defaultConfig };
        } else {
          delete newStore[pluginId];
        }
        saveToStorage(newStore);
        return newStore;
      });
    },

    /**
     * Check if plugin has any config
     */
    has: (pluginId: string): boolean => {
      let has = false;
      const unsubscribe = subscribe(($store) => {
        has = pluginId in $store;
      });
      unsubscribe();
      return has;
    },

    /**
     * Get all plugin IDs that have config
     */
    getPluginIds: (): string[] => {
      let ids: string[] = [];
      const unsubscribe = subscribe(($store) => {
        ids = Object.keys($store);
      });
      unsubscribe();
      return ids;
    },

    /**
     * Clear all plugin configs
     */
    clear: (): void => {
      set({});
      saveToStorage({});
    },

    /**
     * Batch update multiple plugins at once
     */
    batchSet: (updates: Record<string, Record<string, any>>): void => {
      update(($store) => {
        const newStore = { ...$store };
        for (const [pluginId, config] of Object.entries(updates)) {
          newStore[pluginId] = {
            ...(newStore[pluginId] || {}),
            ...config,
          };
        }
        saveToStorage(newStore);
        return newStore;
      });
    },
  };
}

/**
 * Global plugin config store instance
 */
export const pluginConfigStore = createPluginConfigStore();

/**
 * Convenience function to get plugin config
 */
export function getPluginConfig(pluginId: string): Record<string, any> {
  return pluginConfigStore.get(pluginId);
}

/**
 * Convenience function to set plugin config
 */
export function setPluginConfig(pluginId: string, partialConfig: Record<string, any>): void {
  pluginConfigStore.set(pluginId, partialConfig);
}

/**
 * Convenience function to reset plugin config
 */
export function resetPluginConfig(pluginId: string, defaultConfig?: Record<string, any>): void {
  pluginConfigStore.reset(pluginId, defaultConfig);
}

/**
 * Convenience function to get config with defaults applied
 * Merges stored config with default config, preferring stored values
 */
export function getPluginConfigWithDefaults(
  pluginId: string,
  defaultConfig: Record<string, any>
): Record<string, any> {
  const stored = getPluginConfig(pluginId);
  return {
    ...defaultConfig,
    ...stored,
  };
}

/**
 * Convenience function to check if a plugin is enabled
 * (assumes 'enabled' field in config)
 */
export function isPluginEnabled(pluginId: string, defaultValue = true): boolean {
  const config = getPluginConfig(pluginId);
  return config.enabled !== undefined ? config.enabled : defaultValue;
}

/**
 * Convenience function to toggle plugin enabled state
 */
export function togglePluginEnabled(pluginId: string): void {
  const config = getPluginConfig(pluginId);
  const currentEnabled = config.enabled !== undefined ? config.enabled : true;
  setPluginConfig(pluginId, { enabled: !currentEnabled });
}
