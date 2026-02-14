/**
 * Plugin Catalog Store
 *
 * Zustand store for managing UI plugin discovery and state.
 * Fetches available plugins from the backend API and handles
 * enabling/disabling plugins with optimistic updates.
 */
import { create } from 'zustand';

import {
  loadRemotePluginBundles,
  unregisterPlugin,
} from '@lib/plugins/bundleRegistrar';
import { isBundleFamily, type BundleFamily } from '@lib/plugins/types';

import type { PluginInfo } from '../lib/api/plugins';
import {
  getPlugins,
  getEnabledPlugins,
  enablePlugin as apiEnablePlugin,
  disablePlugin as apiDisablePlugin,
  syncPlugins as apiSyncPlugins,
} from '../lib/api/plugins';

// ===== TYPES =====

interface PluginCatalogState {
  // Plugin list
  plugins: PluginInfo[];
  enabledPlugins: PluginInfo[];

  // Loading state
  isLoading: boolean;
  isInitialized: boolean;
  isApiAvailable: boolean;
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
  isPluginRequired: (pluginId: string) => boolean;
  isPending: (pluginId: string) => boolean;
  loadEnabledBundles: () => Promise<void>;
  syncRuntimeCatalog: () => Promise<void>;
}

// ===== STORE =====

export const usePluginCatalogStore = create<PluginCatalogState>((set, get) => ({
  // Initial state
  plugins: [],
  enabledPlugins: [],
  isLoading: false,
  isInitialized: false,
  isApiAvailable: true,
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
      let apiAvailable = true;
      // Fetch all plugins and enabled plugins in parallel
      const [allPlugins, enabled] = await Promise.all([
        getPlugins().catch((error: any) => {
          if (error?.response?.status === 404) {
            console.warn('[PluginCatalog] Plugin API not available (getPlugins).');
            apiAvailable = false;
            return [];
          }
          throw error;
        }),
        getEnabledPlugins().catch((error: any) => {
          if (error?.response?.status === 404) {
            console.warn('[PluginCatalog] Plugin API not available (getEnabledPlugins).');
            apiAvailable = false;
            return [];
          }
          throw error;
        }),
      ]);

      set({
        plugins: allPlugins,
        enabledPlugins: enabled,
        isInitialized: true,
        isLoading: false,
        isApiAvailable: apiAvailable,
      });

      await loadBundlesForPlugins(enabled);

      console.log('[PluginCatalog] Initialized with', allPlugins.length, 'plugins,', enabled.length, 'enabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load plugins';
      console.error('[PluginCatalog] Initialization failed:', error);
      set({
        error: message,
        isLoading: false,
        isApiAvailable: false,
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
      let apiAvailable = true;
      const [allPlugins, enabled] = await Promise.all([
        getPlugins().catch((error: any) => {
          if (error?.response?.status === 404) {
            console.warn('[PluginCatalog] Plugin API not available (getPlugins).');
            apiAvailable = false;
            return [];
          }
          throw error;
        }),
        getEnabledPlugins().catch((error: any) => {
          if (error?.response?.status === 404) {
            console.warn('[PluginCatalog] Plugin API not available (getEnabledPlugins).');
            apiAvailable = false;
            return [];
          }
          throw error;
        }),
      ]);

      set({
        plugins: allPlugins,
        enabledPlugins: enabled,
        isLoading: false,
        isApiAvailable: apiAvailable,
      });

      await loadBundlesForPlugins(enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh plugins';
      console.error('[PluginCatalog] Refresh failed:', error);
      set({ error: message, isLoading: false, isApiAvailable: false });
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
    const plugin = state.plugins.find(p => p.plugin_id === pluginId);
    if (plugin?.is_required) {
      console.warn(`[PluginCatalog] Cannot disable required plugin: ${pluginId}`);
      return false;
    }

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
      if (targetPlugin && isBundleFamily(targetPlugin.family)) {
        await unregisterPlugin(pluginId, targetPlugin.family);
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
   * Check if a plugin is required (always-on)
   */
  isPluginRequired: (pluginId: string) => {
    return get().plugins.some(p => p.plugin_id === pluginId && p.is_required);
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

  /**
   * Sync locally registered runtime plugins into backend catalog.
   * Creates only missing entries and never overwrites existing catalog rows.
   */
  syncRuntimeCatalog: async () => {
    const state = get();
    if (!state.isInitialized || !state.isApiAvailable) {
      return;
    }

    try {
      const [{ pluginCatalog }, { fromPluginSystemMetadata }] = await Promise.all([
        import('@lib/plugins/pluginSystem'),
        import('@lib/plugins/converters'),
      ]);

      const backendPluginIds = new Set(get().plugins.map((plugin) => plugin.plugin_id));
      const runtimeDescriptors = pluginCatalog.getAll().map(fromPluginSystemMetadata);
      const missing = runtimeDescriptors
        .filter((descriptor) => !backendPluginIds.has(descriptor.id))
        .map(mapDescriptorToSyncItem);

      if (!missing.length) {
        return;
      }

      const response = await apiSyncPlugins({ plugins: missing });
      if (response.created > 0) {
        await get().refresh();
      }
    } catch (error) {
      console.warn('[PluginCatalog] Failed to sync runtime catalog:', error);
    }
  },
}));

async function loadBundlesForPlugins(plugins: PluginInfo[]) {
  if (!plugins.length) return;

  const descriptors = plugins
    .filter(plugin =>
      !!plugin.bundle_url
      && isBundleFamily(plugin.family)
      && (plugin.source === 'bundle' || plugin.source === 'remote')
    )
    .map(plugin => {
      // Safe cast after filter validates family
      const family = plugin.family as BundleFamily;
      return {
        pluginId: plugin.plugin_id,
        bundleUrl: plugin.bundle_url as string,
        family,
        manifest: {
          id: plugin.plugin_id,
          name: plugin.name,
          version: plugin.version,
          author: plugin.author ?? 'Unknown',
          description: plugin.description ?? '',
          icon: plugin.icon ?? undefined,
          type: plugin.plugin_type as 'ui-overlay' | 'theme' | 'tool' | 'enhancement',
          main: 'plugin.js',
          family,
          tags: plugin.tags,
          permissions: plugin.metadata.permissions as import('@lib/plugins/types').PluginPermission[],
          // Include scene view metadata if present
          sceneView: plugin.metadata.scene_view ? {
            id: plugin.metadata.scene_view.scene_view_id,
            displayName: plugin.name,
            surfaces: plugin.metadata.scene_view.surfaces as Array<'overlay' | 'hud' | 'panel' | 'workspace'>,
            default: plugin.metadata.scene_view.default,
          } : undefined,
          // Include control center metadata if present
          controlCenter: plugin.metadata.control_center ? {
            id: plugin.metadata.control_center.control_center_id,
            displayName: plugin.metadata.control_center.display_name ?? plugin.name,
            description: plugin.description ?? '',
            features: plugin.metadata.control_center.features,
            preview: plugin.metadata.control_center.preview ?? undefined,
            default: plugin.metadata.control_center.default,
          } : undefined,
        },
      };
    });

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

function mapDescriptorToSyncItem(
  descriptor: import('@lib/plugins/descriptor').UnifiedPluginDescriptor
): import('../lib/api/plugins').PluginSyncItem {
  const sceneExt = descriptor.extensions?.sceneView;
  const controlCenterExt = descriptor.extensions?.controlCenter;
  const metadata: Record<string, unknown> = {
    permissions: descriptor.permissions ?? [],
    surfaces: sceneExt?.surfaces ?? [],
    default: sceneExt?.default ?? controlCenterExt?.default ?? false,
    frontend_family: descriptor.family,
  };

  if (sceneExt) {
    metadata.scene_view = {
      scene_view_id: sceneExt.sceneViewId,
      surfaces: sceneExt.surfaces ?? [],
      default: sceneExt.default ?? false,
    };
  }
  if (controlCenterExt) {
    metadata.control_center = {
      control_center_id: controlCenterExt.controlCenterId,
      display_name: controlCenterExt.displayName ?? null,
      features: controlCenterExt.features ?? [],
      preview: controlCenterExt.preview ?? null,
      default: controlCenterExt.default ?? false,
    };
  }

  return {
    plugin_id: descriptor.id,
    name: descriptor.name,
    description: descriptor.description,
    version: descriptor.version ?? '1.0.0',
    author: descriptor.author,
    icon: descriptor.icon,
    family: mapFrontendFamilyToBackendFamily(descriptor.family),
    plugin_type: descriptor.pluginType ?? 'ui-overlay',
    tags: descriptor.tags ?? [],
    is_required: !descriptor.canDisable,
    metadata,
  };
}

function mapFrontendFamilyToBackendFamily(
  family: import('@lib/plugins/descriptor').UnifiedPluginFamily
): string {
  switch (family) {
    case 'scene-view':
      return 'scene';
    case 'ui-plugin':
    case 'control-center':
      return 'ui';
    case 'world-tool':
    case 'gallery-tool':
    case 'brain-tool':
    case 'dev-tool':
      return 'tool';
    case 'workspace-panel':
    case 'dock-widget':
    case 'panel-group':
      return 'panel';
    case 'node-type':
    case 'renderer':
    case 'graph-editor':
      return 'graph';
    case 'helper':
    case 'interaction':
      return 'game';
    case 'gallery-surface':
    case 'gizmo-surface':
      return 'surface';
    case 'generation-ui':
      return 'generation';
    default:
      return 'ui';
  }
}
