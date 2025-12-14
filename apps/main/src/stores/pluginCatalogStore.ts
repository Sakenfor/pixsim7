/**
 * Plugin Catalog Store
 *
 * Zustand store for managing UI plugin discovery and state.
 * Fetches available plugins from the backend API and handles
 * enabling/disabling plugins with optimistic updates.
 */
import { create } from 'zustand';
import type { PluginInfo } from '../lib/api/plugins';
import {
  getPlugins,
  getEnabledPlugins,
  enablePlugin as apiEnablePlugin,
  disablePlugin as apiDisablePlugin,
} from '../lib/api/plugins';
import {
  loadRemotePluginBundles,
  unregisterPlugin,
  type BundlePluginFamily,
} from '@lib/plugins/manifestLoader';

// ===== TYPES =====

interface PluginCatalogState {
  // Plugin list
  plugins: PluginInfo[];
  enabledPlugins: PluginInfo[];

  // Loading state
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Pending operations (for optimistic updates)
  pendingOperations: Set<string>;

  // Actions
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  enablePlugin: (pluginId: string) => Promise<boolean>;
  disablePlugin: (pluginId: string) => Promise<boolean>;
  getPluginsByFamily: (family: string) => PluginInfo[];
  getEnabledByFamily: (family: string) => PluginInfo[];
  isPluginEnabled: (pluginId: string) => boolean;
  isPending: (pluginId: string) => boolean;
  loadEnabledBundles: () => Promise<void>;
}

// ===== STORE =====

export const usePluginCatalogStore = create<PluginCatalogState>((set, get) => ({
  // Initial state
  plugins: [],
  enabledPlugins: [],
  isLoading: false,
  isInitialized: false,
  error: null,
  pendingOperations: new Set(),

  /**
   * Initialize the plugin catalog from the backend
   */
  initialize: async () => {
    const state = get();
    if (state.isInitialized || state.isLoading) return;

    set({ isLoading: true, error: null });

    try {
      // Fetch all plugins and enabled plugins in parallel
      const [allPlugins, enabled] = await Promise.all([
        getPlugins(),
        getEnabledPlugins(),
      ]);

      set({
        plugins: allPlugins,
        enabledPlugins: enabled,
        isInitialized: true,
        isLoading: false,
      });

      await loadBundlesForPlugins(enabled);

      console.log('[PluginCatalog] Initialized with', allPlugins.length, 'plugins,', enabled.length, 'enabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load plugins';
      console.error('[PluginCatalog] Initialization failed:', error);
      set({
        error: message,
        isLoading: false,
        isInitialized: true, // Mark as initialized even on error to prevent loops
      });
    }
  },

  /**
   * Refresh the plugin catalog
   */
  refresh: async () => {
    set({ isLoading: true, error: null });

    try {
      const [allPlugins, enabled] = await Promise.all([
        getPlugins(),
        getEnabledPlugins(),
      ]);

      set({
        plugins: allPlugins,
        enabledPlugins: enabled,
        isLoading: false,
      });

      await loadBundlesForPlugins(enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh plugins';
      console.error('[PluginCatalog] Refresh failed:', error);
      set({ error: message, isLoading: false });
    }
  },

  /**
   * Enable a plugin (with optimistic update)
   */
  enablePlugin: async (pluginId: string) => {
    const state = get();

    // Mark as pending
    const newPending = new Set(state.pendingOperations);
    newPending.add(pluginId);
    set({ pendingOperations: newPending });

    // Optimistic update
    const plugin = state.plugins.find(p => p.plugin_id === pluginId);
    if (plugin) {
      const updatedPlugins = state.plugins.map(p =>
        p.plugin_id === pluginId ? { ...p, is_enabled: true } : p
      );
      const updatedEnabled = [...state.enabledPlugins, { ...plugin, is_enabled: true }];
      set({ plugins: updatedPlugins, enabledPlugins: updatedEnabled });
    }

    try {
      await apiEnablePlugin(pluginId);
      console.log('[PluginCatalog] Enabled plugin:', pluginId);

      const refreshedPlugin = get().plugins.find(p => p.plugin_id === pluginId);
      if (refreshedPlugin) {
        await loadBundlesForPlugins([refreshedPlugin]);
      }

      // Remove from pending
      const pending = new Set(get().pendingOperations);
      pending.delete(pluginId);
      set({ pendingOperations: pending });

      return true;
    } catch (error) {
      console.error('[PluginCatalog] Failed to enable plugin:', pluginId, error);

      // Revert optimistic update
      await get().refresh();

      const pending = new Set(get().pendingOperations);
      pending.delete(pluginId);
      set({ pendingOperations: pending });

      return false;
    }
  },

  /**
   * Disable a plugin (with optimistic update)
   */
  disablePlugin: async (pluginId: string) => {
    const state = get();

    // Mark as pending
    const newPending = new Set(state.pendingOperations);
    newPending.add(pluginId);
    set({ pendingOperations: newPending });

    // Optimistic update
    const updatedPlugins = state.plugins.map(p =>
      p.plugin_id === pluginId ? { ...p, is_enabled: false } : p
    );
    const updatedEnabled = state.enabledPlugins.filter(p => p.plugin_id !== pluginId);
    set({ plugins: updatedPlugins, enabledPlugins: updatedEnabled });

    try {
      await apiDisablePlugin(pluginId);
      console.log('[PluginCatalog] Disabled plugin:', pluginId);

      const targetPlugin = get().plugins.find(p => p.plugin_id === pluginId);
      if (targetPlugin) {
        unregisterPlugin(pluginId, targetPlugin.family as BundlePluginFamily);
      }

      // Remove from pending
      const pending = new Set(get().pendingOperations);
      pending.delete(pluginId);
      set({ pendingOperations: pending });

      return true;
    } catch (error) {
      console.error('[PluginCatalog] Failed to disable plugin:', pluginId, error);

      // Revert optimistic update
      await get().refresh();

      const pending = new Set(get().pendingOperations);
      pending.delete(pluginId);
      set({ pendingOperations: pending });

      return false;
    }
  },

  /**
   * Get plugins by family
   */
  getPluginsByFamily: (family: string) => {
    return get().plugins.filter(p => p.family === family);
  },

  /**
   * Get enabled plugins by family
   */
  getEnabledByFamily: (family: string) => {
    return get().enabledPlugins.filter(p => p.family === family);
  },

  /**
   * Check if a plugin is enabled
   */
  isPluginEnabled: (pluginId: string) => {
    return get().enabledPlugins.some(p => p.plugin_id === pluginId);
  },

  /**
   * Check if a plugin has a pending operation
   */
  isPending: (pluginId: string) => {
    return get().pendingOperations.has(pluginId);
  },

  /**
   * Load bundles for currently enabled plugins
   */
  loadEnabledBundles: async () => {
    await loadBundlesForPlugins(get().enabledPlugins);
  },
}));

async function loadBundlesForPlugins(plugins: PluginInfo[]) {
  if (!plugins.length) return;

  const descriptors = plugins
    .filter(plugin => !!plugin.bundle_url)
    .map(plugin => ({
      pluginId: plugin.plugin_id,
      bundleUrl: plugin.bundle_url,
      family: plugin.family as BundlePluginFamily,
      manifest: {
        id: plugin.plugin_id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description ?? '',
        type: plugin.plugin_type,
        main: 'plugin.js',
        family: plugin.family as BundlePluginFamily,
      },
    }));

  if (!descriptors.length) return;

  await loadRemotePluginBundles(descriptors);
}

// ===== SELECTORS =====

/**
 * Select scene view plugins
 */
export const selectSceneViewPlugins = (state: PluginCatalogState) =>
  state.plugins.filter(p => p.family === 'scene');

/**
 * Select enabled scene view plugins
 */
export const selectEnabledSceneViewPlugins = (state: PluginCatalogState) =>
  state.enabledPlugins.filter(p => p.family === 'scene');

/**
 * Select UI plugins
 */
export const selectUIPlugins = (state: PluginCatalogState) =>
  state.plugins.filter(p => p.family === 'ui');

/**
 * Select tool plugins
 */
export const selectToolPlugins = (state: PluginCatalogState) =>
  state.plugins.filter(p => p.family === 'tool');
