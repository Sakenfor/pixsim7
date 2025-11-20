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

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Plugin configuration map (plugin ID -> config object)
 */
export type PluginConfigMap = Record<string, Record<string, any>>;

/**
 * Local storage key for persisting plugin configs
 */
const STORAGE_KEY = 'pixsim7_plugin_configs';

interface PluginConfigStoreState {
  configs: PluginConfigMap;
  setConfig: (pluginId: string, config: Record<string, any>) => void;
  replaceConfig: (pluginId: string, config: Record<string, any>) => void;
  resetConfig: (pluginId: string, defaultConfig?: Record<string, any>) => void;
  clearAll: () => void;
  batchSet: (updates: Record<string, Record<string, any>>) => void;
}

/**
 * Create the plugin config store using Zustand
 */
const usePluginConfigStoreInternal = create<PluginConfigStoreState>()(
  persist(
    (set) => ({
      configs: {},

      setConfig: (pluginId: string, partialConfig: Record<string, any>) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [pluginId]: {
              ...(state.configs[pluginId] || {}),
              ...partialConfig,
            },
          },
        })),

      replaceConfig: (pluginId: string, config: Record<string, any>) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [pluginId]: config,
          },
        })),

      resetConfig: (pluginId: string, defaultConfig?: Record<string, any>) =>
        set((state) => {
          const newConfigs = { ...state.configs };
          if (defaultConfig) {
            newConfigs[pluginId] = { ...defaultConfig };
          } else {
            delete newConfigs[pluginId];
          }
          return { configs: newConfigs };
        }),

      clearAll: () => set({ configs: {} }),

      batchSet: (updates: Record<string, Record<string, any>>) =>
        set((state) => {
          const newConfigs = { ...state.configs };
          for (const [pluginId, config] of Object.entries(updates)) {
            newConfigs[pluginId] = {
              ...(newConfigs[pluginId] || {}),
              ...config,
            };
          }
          return { configs: newConfigs };
        }),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);

/**
 * Create the plugin config store API
 */
function createPluginConfigStore() {
  const { subscribe, set, update } = {
    subscribe: (callback: (state: PluginConfigMap) => void) => {
      return usePluginConfigStoreInternal.subscribe((state) => callback(state.configs));
    },
    set: (configs: PluginConfigMap) => {
      usePluginConfigStoreInternal.setState({ configs });
    },
    update: (updater: (state: PluginConfigMap) => PluginConfigMap) => {
      const currentConfigs = usePluginConfigStoreInternal.getState().configs;
      const newConfigs = updater(currentConfigs);
      usePluginConfigStoreInternal.setState({ configs: newConfigs });
    },
  };

  return {
    subscribe,

    /**
     * Get config for a specific plugin
     */
    get: (pluginId: string): Record<string, any> => {
      const state = usePluginConfigStoreInternal.getState();
      return state.configs[pluginId] || {};
    },

    /**
     * Set/update config for a specific plugin (merges with existing)
     */
    set: (pluginId: string, partialConfig: Record<string, any>): void => {
      usePluginConfigStoreInternal.getState().setConfig(pluginId, partialConfig);
    },

    /**
     * Replace entire config for a plugin (no merge)
     */
    replace: (pluginId: string, config: Record<string, any>): void => {
      usePluginConfigStoreInternal.getState().replaceConfig(pluginId, config);
    },

    /**
     * Reset plugin config to empty (or provide default)
     */
    reset: (pluginId: string, defaultConfig?: Record<string, any>): void => {
      usePluginConfigStoreInternal.getState().resetConfig(pluginId, defaultConfig);
    },

    /**
     * Check if plugin has any config
     */
    has: (pluginId: string): boolean => {
      const state = usePluginConfigStoreInternal.getState();
      return pluginId in state.configs;
    },

    /**
     * Get all plugin IDs that have config
     */
    getPluginIds: (): string[] => {
      const state = usePluginConfigStoreInternal.getState();
      return Object.keys(state.configs);
    },

    /**
     * Clear all plugin configs
     */
    clear: (): void => {
      usePluginConfigStoreInternal.getState().clearAll();
    },

    /**
     * Batch update multiple plugins at once
     */
    batchSet: (updates: Record<string, Record<string, any>>): void => {
      usePluginConfigStoreInternal.getState().batchSet(updates);
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
