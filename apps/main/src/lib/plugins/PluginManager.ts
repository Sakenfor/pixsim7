/**
 * Plugin Manager
 *
 * Handles loading, enabling, disabling, and sandboxing user plugins.
 * Ensures plugins can only access permitted APIs.
 */

import { loadPluginInSandbox, SandboxedPlugin } from './sandbox';
import type {
  PluginManifest,
  PluginEntry,
  Plugin,
  PluginAPI,
  PluginGameState,
  PluginOverlay,
  PluginMenuItem,
  PluginNotification,
  PluginPermission,
  PluginBundle,
} from './types';

/**
 * Plugin manager singleton
 */
export class PluginManager {
  private plugins = new Map<string, PluginEntry>();
  private instances = new Map<string, Plugin>();
  private overlays = new Map<string, PluginOverlay>();
  private menuItems = new Map<string, PluginMenuItem>();
  private stateSubscribers: Array<(state: PluginGameState) => void> = [];
  private currentGameState: PluginGameState | null = null;
  private disableCallbacks = new Map<string, Array<() => void | Promise<void>>>();
  private uninstallCallbacks = new Map<string, Array<() => void | Promise<void>>>();

  // Callbacks for UI updates
  private onOverlaysChange?: () => void;
  private onMenuItemsChange?: () => void;
  private onNotification?: (notification: PluginNotification) => void;

  /**
   * Register UI update callbacks
   */
  setUICallbacks(callbacks: {
    onOverlaysChange?: () => void;
    onMenuItemsChange?: () => void;
    onNotification?: (notification: PluginNotification) => void;
  }) {
    this.onOverlaysChange = callbacks.onOverlaysChange;
    this.onMenuItemsChange = callbacks.onMenuItemsChange;
    this.onNotification = callbacks.onNotification;
  }

  /**
   * Update game state (called by the game)
   */
  updateGameState(state: PluginGameState) {
    this.currentGameState = state;
    this.stateSubscribers.forEach(callback => {
      try {
        callback(state);
      } catch (e) {
        console.error('Plugin state subscriber error:', e);
      }
    });
  }

  /**
   * Install a plugin from a bundle
   */
  async installPlugin(bundle: PluginBundle): Promise<void> {
    const { manifest } = bundle;

    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already installed`);
    }

    // Validate manifest
    this.validateManifest(manifest);

    // Validate code (basic check)
    if (!bundle.code || bundle.code.trim().length === 0) {
      throw new Error('Plugin bundle must contain code');
    }

    // Create entry
    const entry: PluginEntry = {
      manifest,
      state: 'disabled',
      installedAt: Date.now(),
    };

    // Store bundle
    this.savePluginBundle(manifest.id, bundle);

    // Store in registry
    this.plugins.set(manifest.id, entry);

    // Persist to storage
    this.savePluginRegistry();

    console.info(`Plugin ${manifest.id} installed`);
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (entry.state === 'enabled') {
      return; // Already enabled
    }

    try {
      // Load plugin code in sandbox
      const plugin = await this.loadPluginCode(pluginId, entry.manifest);

      // Store instance (onEnable already called in sandbox)
      this.instances.set(pluginId, plugin);

      // Update state
      entry.state = 'enabled';
      entry.enabledAt = Date.now();
      entry.error = undefined;

      this.savePluginRegistry();
      console.info(`Plugin ${pluginId} enabled`);
    } catch (e: unknown) {
      entry.state = 'error';
      entry.error = e instanceof Error ? e.message : String(e);
      this.savePluginRegistry();
      throw new Error(`Failed to enable plugin ${pluginId}: ${entry.error}`);
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (entry.state !== 'enabled') {
      return; // Already disabled
    }

    const plugin = this.instances.get(pluginId);

    // Call onDisable instance method
    if (plugin?.onDisable) {
      try {
        await plugin.onDisable();
      } catch (e) {
        console.error(`Error disabling plugin ${pluginId}:`, e);
      }
    }

    // Invoke registered onDisable callbacks
    const disableCbs = this.disableCallbacks.get(pluginId) ?? [];
    for (const cb of disableCbs) {
      try {
        await cb();
      } catch (e) {
        console.error(`Error in onDisable callback for ${pluginId}:`, e);
      }
    }

    // Remove all overlays/menu items from this plugin
    this.cleanupPluginUI(pluginId);

    // Remove instance
    this.instances.delete(pluginId);

    // Update state
    entry.state = 'disabled';
    entry.enabledAt = undefined;

    this.savePluginRegistry();
    console.info(`Plugin ${pluginId} disabled`);
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Disable first if enabled
    if (entry.state === 'enabled') {
      await this.disablePlugin(pluginId);
    }

    const plugin = this.instances.get(pluginId);

    // Call onUninstall instance method
    if (plugin?.onUninstall) {
      try {
        await plugin.onUninstall();
      } catch (e) {
        console.error(`Error uninstalling plugin ${pluginId}:`, e);
      }
    }

    // Invoke registered onUninstall callbacks
    const uninstallCbs = this.uninstallCallbacks.get(pluginId) ?? [];
    for (const cb of uninstallCbs) {
      try {
        await cb();
      } catch (e) {
        console.error(`Error in onUninstall callback for ${pluginId}:`, e);
      }
    }

    // Cleanup sandbox if it's a sandboxed plugin
    if (plugin instanceof SandboxedPlugin) {
      plugin.destroy();
    }

    // Remove from registry
    this.plugins.delete(pluginId);

    // Clear storage
    this.clearPluginStorage(pluginId);

    // Delete bundle
    this.deletePluginBundle(pluginId);

    this.savePluginRegistry();
    console.info(`Plugin ${pluginId} uninstalled`);
  }

  /**
   * Get all plugins
   */
  getPlugins(): PluginEntry[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): PluginEntry | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all overlays (for rendering)
   */
  getOverlays(): PluginOverlay[] {
    return Array.from(this.overlays.values());
  }

  /**
   * Get all menu items (for rendering)
   */
  getMenuItems(): PluginMenuItem[] {
    return Array.from(this.menuItems.values());
  }

  /**
   * Create safe API for a plugin
   */
  private createPluginAPI(pluginId: string): PluginAPI {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const hasPermission = (permission: PluginPermission) => {
      return entry.manifest.permissions.includes(permission);
    };

    return {
      getPluginId: () => pluginId,
      getManifest: () => entry.manifest,

      state: {
        getGameState: () => {
          if (!hasPermission('read:session')) {
            throw new Error('Plugin does not have permission to read session');
          }
          if (!this.currentGameState) {
            throw new Error('Game state not available');
          }
          return this.currentGameState;
        },

        subscribe: (callback) => {
          if (!hasPermission('read:session')) {
            throw new Error('Plugin does not have permission to subscribe to state');
          }
          this.stateSubscribers.push(callback);
          return () => {
            const index = this.stateSubscribers.indexOf(callback);
            if (index > -1) {
              this.stateSubscribers.splice(index, 1);
            }
          };
        },
      },

      ui: {
        addOverlay: (overlay) => {
          if (!hasPermission('ui:overlay')) {
            throw new Error('Plugin does not have permission to add overlays');
          }
          const fullId = `${pluginId}:${overlay.id}`;
          this.overlays.set(fullId, { ...overlay, id: fullId });
          this.onOverlaysChange?.();
        },

        removeOverlay: (id) => {
          const fullId = `${pluginId}:${id}`;
          this.overlays.delete(fullId);
          this.onOverlaysChange?.();
        },

        addMenuItem: (item) => {
          if (!hasPermission('ui:overlay')) {
            throw new Error('Plugin does not have permission to add menu items');
          }
          const fullId = `${pluginId}:${item.id}`;
          this.menuItems.set(fullId, { ...item, id: fullId });
          this.onMenuItemsChange?.();
        },

        removeMenuItem: (id) => {
          const fullId = `${pluginId}:${id}`;
          this.menuItems.delete(fullId);
          this.onMenuItemsChange?.();
        },

        showNotification: (notification) => {
          if (!hasPermission('notifications')) {
            throw new Error('Plugin does not have permission to show notifications');
          }
          this.onNotification?.(notification);
        },

        updateTheme: (css) => {
          if (!hasPermission('ui:theme')) {
            throw new Error('Plugin does not have permission to modify theme');
          }
          // Inject CSS with scoped ID
          const styleId = `plugin-theme-${pluginId}`;
          let styleEl = document.getElementById(styleId);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = css;
        },
      },

      storage: {
        get: (key, defaultValue) => {
          if (!hasPermission('storage')) {
            throw new Error('Plugin does not have permission to use storage');
          }
          const storageKey = `plugin:${pluginId}:${key}`;
          const value = localStorage.getItem(storageKey);
          return value ? JSON.parse(value) : defaultValue;
        },

        set: (key, value) => {
          if (!hasPermission('storage')) {
            throw new Error('Plugin does not have permission to use storage');
          }
          const storageKey = `plugin:${pluginId}:${key}`;
          localStorage.setItem(storageKey, JSON.stringify(value));
        },

        remove: (key) => {
          if (!hasPermission('storage')) {
            throw new Error('Plugin does not have permission to use storage');
          }
          const storageKey = `plugin:${pluginId}:${key}`;
          localStorage.removeItem(storageKey);
        },

        clear: () => {
          if (!hasPermission('storage')) {
            throw new Error('Plugin does not have permission to use storage');
          }
          this.clearPluginStorage(pluginId);
        },
      },

      onDisable: (callback) => {
        const cbs = this.disableCallbacks.get(pluginId) ?? [];
        cbs.push(callback);
        this.disableCallbacks.set(pluginId, cbs);
      },

      onUninstall: (callback) => {
        const cbs = this.uninstallCallbacks.get(pluginId) ?? [];
        cbs.push(callback);
        this.uninstallCallbacks.set(pluginId, cbs);
      },
    };
  }

  /**
   * Load plugin code safely in iframe sandbox
   */
  private async loadPluginCode(pluginId: string, manifest: PluginManifest): Promise<Plugin> {
    // Load bundle from storage
    const bundle = this.loadPluginBundle(pluginId);
    if (!bundle) {
      throw new Error(`Plugin bundle not found: ${pluginId}`);
    }

    // Create plugin API
    const api = this.createPluginAPI(pluginId);

    // Load in sandbox
    const plugin = await loadPluginInSandbox(pluginId, manifest, bundle.code, api);

    return plugin;
  }

  /**
   * Load plugin bundle from storage
   */
  private loadPluginBundle(pluginId: string): PluginBundle | null {
    const key = `plugin-bundle:${pluginId}`;
    const data = localStorage.getItem(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as PluginBundle;
    } catch (e) {
      console.error(`Failed to parse plugin bundle: ${pluginId}`, e);
      return null;
    }
  }

  /**
   * Save plugin bundle to storage
   */
  private savePluginBundle(pluginId: string, bundle: PluginBundle): void {
    const key = `plugin-bundle:${pluginId}`;
    localStorage.setItem(key, JSON.stringify(bundle));
  }

  /**
   * Delete plugin bundle from storage
   */
  private deletePluginBundle(pluginId: string): void {
    const key = `plugin-bundle:${pluginId}`;
    localStorage.removeItem(key);
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error('Invalid plugin ID (must be lowercase alphanumeric with hyphens)');
    }

    if (!manifest.name || manifest.name.length < 3) {
      throw new Error('Plugin name must be at least 3 characters');
    }

    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error('Invalid version (must be semver)');
    }

    if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
      throw new Error('Plugin must declare permissions');
    }

    // Validate permissions
    const validPermissions: PluginPermission[] = [
      'read:session', 'read:world', 'read:npcs', 'read:locations',
      'ui:overlay', 'ui:theme', 'storage', 'notifications',
    ];

    for (const perm of manifest.permissions) {
      if (!validPermissions.includes(perm)) {
        throw new Error(`Invalid permission: ${perm}`);
      }
    }
  }

  /**
   * Cleanup plugin UI elements
   */
  private cleanupPluginUI(pluginId: string): void {
    // Remove overlays
    for (const [id] of this.overlays) {
      if (id.startsWith(`${pluginId}:`)) {
        this.overlays.delete(id);
      }
    }

    // Remove menu items
    for (const [id] of this.menuItems) {
      if (id.startsWith(`${pluginId}:`)) {
        this.menuItems.delete(id);
      }
    }

    // Remove theme
    const styleEl = document.getElementById(`plugin-theme-${pluginId}`);
    if (styleEl) {
      styleEl.remove();
    }

    // Clear lifecycle callbacks
    this.disableCallbacks.delete(pluginId);
    this.uninstallCallbacks.delete(pluginId);

    this.onOverlaysChange?.();
    this.onMenuItemsChange?.();
  }

  /**
   * Clear plugin storage
   */
  private clearPluginStorage(pluginId: string): void {
    const prefix = `plugin:${pluginId}:`;
    const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
    keys.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Save plugin registry to localStorage
   */
  private savePluginRegistry(): void {
    const data = Array.from(this.plugins.entries()).map(([id, entry]) => ({
      id,
      manifest: entry.manifest,
      state: entry.state,
      error: entry.error,
      installedAt: entry.installedAt,
      enabledAt: entry.enabledAt,
      settings: entry.settings,
    }));

    localStorage.setItem('plugin-registry', JSON.stringify(data));
  }

  /**
   * Load plugin registry from localStorage
   */
  loadPluginRegistry(): void {
    const data = localStorage.getItem('plugin-registry');
    if (!data) return;

    try {
      const entries = JSON.parse(data) as Array<PluginEntry & { id: string }>;
      for (const entry of entries) {
        this.plugins.set(entry.id, entry);
      }
      console.info(`Loaded ${entries.length} plugins from registry`);
    } catch (e) {
      console.error('Failed to load plugin registry:', e);
    }
  }
}

// Singleton instance
export const pluginManager = new PluginManager();
