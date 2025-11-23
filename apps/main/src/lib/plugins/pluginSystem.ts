/**
 * Unified Plugin System
 *
 * This module provides a consistent approach to plugin discovery, registration,
 * and lifecycle management across all plugin families in the application.
 *
 * Design Goals:
 * 1. Consistent registration patterns across all plugin types
 * 2. Clear separation of built-in vs user plugins with origin tracking
 * 3. Unified enable/disable semantics
 * 4. Metadata-driven registration (avoid duplication)
 * 5. Generic discovery utilities (no repeated glob patterns)
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Plugin origin indicates where the plugin was loaded from
 */
export type PluginOrigin =
  | 'builtin'       // Core functionality shipped with the app
  | 'plugin-dir'    // User plugins from plugins/ directory
  | 'ui-bundle'     // Dynamically loaded UI plugins via PluginManager
  | 'dev-project';  // Development-time plugins (e.g., example plugins)

/**
 * Plugin family/category - defines what kind of functionality the plugin provides
 */
export type PluginFamily =
  | 'world-tool'
  | 'helper'
  | 'interaction'
  | 'gallery-tool'
  | 'node-type'
  | 'renderer'
  | 'ui-plugin'
  | 'graph-editor'
  | 'dev-tool'
  | 'workspace-panel'
  | 'gizmo-surface';

/**
 * Activation state - whether the plugin is currently active
 */
export type ActivationState = 'active' | 'inactive';

/**
 * Core metadata that all plugins should have
 */
export interface PluginMetadata {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Plugin family */
  family: PluginFamily;

  /** Where this plugin came from */
  origin: PluginOrigin;

  /** Current activation state */
  activationState: ActivationState;

  /** Whether this plugin can be disabled (some built-ins may be always-on) */
  canDisable: boolean;

  /** Optional version */
  version?: string;

  /** Optional description */
  description?: string;

  /** Optional author */
  author?: string;

  /** Tags for filtering/searching */
  tags?: string[];
}

/**
 * Extended metadata for specific plugin families
 */
export interface PluginMetadataExtensions {
  'world-tool': {
    category?: string;
    icon?: string;
  };
  'helper': {
    category?: string;
  };
  'interaction': {
    category?: string;
    icon?: string;
  };
  'gallery-tool': {
    category?: string;
  };
  'node-type': {
    category?: string;
    scope?: 'scene' | 'global';
    userCreatable?: boolean;
    preloadPriority?: number;
  };
  'renderer': {
    nodeType: string;
    preloadPriority?: number;
  };
  'ui-plugin': {
    hasOverlays?: boolean;
    hasMenuItems?: boolean;
  };
  'graph-editor': {
    storeId?: string;
    category?: string;
    supportsMultiScene?: boolean;
    supportsWorldContext?: boolean;
    supportsPlayback?: boolean;
  };
  'dev-tool': {
    category?: string;
    icon?: string;
  };
  'workspace-panel': {
    panelId: string;
    category?: 'core' | 'development' | 'game' | 'tools' | 'custom';
    supportsCompactMode?: boolean;
    supportsMultipleInstances?: boolean;
  };
  'gizmo-surface': {
    gizmoSurfaceId?: string;
    category?: 'scene' | 'world' | 'npc' | 'debug' | 'custom';
    supportsContexts?: Array<'scene-editor' | 'game-2d' | 'game-3d' | 'playground' | 'workspace' | 'hud'>;
    icon?: string;
  };
}

/**
 * Full plugin metadata with family-specific extensions
 */
export type ExtendedPluginMetadata<F extends PluginFamily = PluginFamily> =
  PluginMetadata & PluginMetadataExtensions[F];

// ============================================================================
// Discovery Configuration
// ============================================================================

/**
 * Configuration for discovering a plugin family
 */
export interface PluginDiscoveryConfig {
  /** Plugin family being discovered */
  family: PluginFamily;

  /** Glob patterns to search for plugins */
  patterns: string[];

  /** Origin for discovered plugins */
  origin: PluginOrigin;

  /**
   * How to extract plugin from module
   * - 'named-export': Look for specific export names (e.g., registerXxxHelper)
   * - 'default-export': Use default export
   * - 'auto-detect': Look for objects with specific properties (e.g., id + execute)
   */
  extractionMode: 'named-export' | 'default-export' | 'auto-detect';

  /**
   * For named-export mode: naming pattern to match
   * Examples: 'register*Helper', 'register*Node', '*InteractionPlugin'
   */
  exportPattern?: string;

  /**
   * For auto-detect mode: properties that must exist
   * Example: ['id', 'execute'] for interaction plugins
   */
  requiredProperties?: string[];

  /** Whether to load eagerly or lazily */
  eager?: boolean;
}

// ============================================================================
// Plugin Discovery
// ============================================================================

/**
 * Result of discovering a plugin
 */
export interface DiscoveredPlugin {
  /** Module path */
  path: string;

  /** Plugin family */
  family: PluginFamily;

  /** Origin */
  origin: PluginOrigin;

  /** The actual plugin object/function */
  plugin: any;

  /** Extracted metadata (if available) */
  metadata?: Partial<PluginMetadata>;
}

/**
 * Generic plugin discovery utility
 *
 * This replaces the duplicated import.meta.glob patterns across loaders
 */
export class PluginDiscovery {
  /**
   * Discover plugins matching the given configuration
   * Note: Vite requires glob patterns to be static string literals, so we use a map of predefined globs
   */
  static async discover(config: PluginDiscoveryConfig): Promise<DiscoveredPlugin[]> {
    const discovered: DiscoveredPlugin[] = [];

    // Get the appropriate glob modules based on the config family
    const globModules = this.getGlobModules(config);

    for (const [path, moduleLoader] of Object.entries(globModules)) {
      try {
        const module = config.eager ? moduleLoader : await moduleLoader();
        const plugins = this.extractPlugins(module, config);

        for (const plugin of plugins) {
          discovered.push({
            path,
            family: config.family,
            origin: config.origin,
            plugin,
            metadata: this.extractMetadata(plugin, config),
          });
        }
      } catch (error) {
        console.warn(`Failed to load plugin from ${path}:`, error);
      }
    }

    return discovered;
  }

  /**
   * Get glob modules for a config using static patterns
   * Vite requires these to be compile-time constants (no variables allowed)
   */
  private static getGlobModules(config: PluginDiscoveryConfig): Record<string, any> {
    // We need separate eager and non-eager branches because Vite requires completely static glob calls
    if (config.eager) {
      switch (config.family) {
        case 'helper':
          return import.meta.glob<any>('/src/plugins/**/*.{ts,tsx,js,jsx}', { eager: true });
        case 'interaction':
          return import.meta.glob<any>('/src/plugins/**/*.{ts,tsx,js,jsx}', { eager: true });
        case 'node-type':
          return import.meta.glob<any>('/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}', { eager: true });
        case 'gallery-tool':
          return import.meta.glob<any>('/src/lib/galleryTools/*.{ts,tsx,js,jsx}', { eager: true });
        case 'world-tool':
          return import.meta.glob<any>('/src/lib/worldTools/*.{ts,tsx,js,jsx}', { eager: true });
        default:
          console.warn(`Unknown plugin family: ${config.family}`);
          return {};
      }
    } else {
      switch (config.family) {
        case 'helper':
          return import.meta.glob<any>('/src/plugins/**/*.{ts,tsx,js,jsx}', { eager: false });
        case 'interaction':
          return import.meta.glob<any>('/src/plugins/**/*.{ts,tsx,js,jsx}', { eager: false });
        case 'node-type':
          return import.meta.glob<any>('/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}', { eager: false });
        case 'gallery-tool':
          return import.meta.glob<any>('/src/lib/galleryTools/*.{ts,tsx,js,jsx}', { eager: false });
        case 'world-tool':
          return import.meta.glob<any>('/src/lib/worldTools/*.{ts,tsx,js,jsx}', { eager: false });
        default:
          console.warn(`Unknown plugin family: ${config.family}`);
          return {};
      }
    }
  }

  /**
   * Extract plugins from a module based on extraction mode
   */
  private static extractPlugins(module: any, config: PluginDiscoveryConfig): any[] {
    switch (config.extractionMode) {
      case 'named-export':
        return this.extractByNamedExport(module, config.exportPattern!);

      case 'default-export':
        return module.default ? [module.default] : [];

      case 'auto-detect':
        return this.extractByAutoDetect(module, config.requiredProperties!);

      default:
        throw new Error(`Unknown extraction mode: ${config.extractionMode}`);
    }
  }

  /**
   * Extract exports matching a naming pattern
   */
  private static extractByNamedExport(module: any, pattern: string): any[] {
    const regex = this.patternToRegex(pattern);
    return Object.entries(module)
      .filter(([name, value]) => regex.test(name))
      .map(([_, value]) => value);
  }

  /**
   * Extract objects with required properties
   */
  private static extractByAutoDetect(module: any, requiredProps: string[]): any[] {
    return Object.values(module).filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        requiredProps.every(prop => prop in value)
    );
  }

  /**
   * Convert a wildcard pattern to regex
   * Example: 'register*Helper' -> /^register.*Helper$/
   */
  private static patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withWildcard = escaped.replace(/\\\*/g, '.*');
    return new RegExp(`^${withWildcard}$`);
  }

  /**
   * Extract metadata from plugin object
   */
  private static extractMetadata(plugin: any, config: PluginDiscoveryConfig): Partial<PluginMetadata> | undefined {
    if (!plugin || typeof plugin !== 'object') {
      return undefined;
    }

    return {
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      author: plugin.author,
    };
  }
}

// ============================================================================
// Plugin Catalog
// ============================================================================

/**
 * Unified catalog of all plugins across all registries
 *
 * This provides a single source of truth for:
 * - What plugins exist
 * - Where they came from (origin)
 * - Whether they're active
 * - What family they belong to
 */
export class PluginCatalog {
  private plugins = new Map<string, ExtendedPluginMetadata>();
  private listeners = new Set<() => void>();

  /**
   * Register a plugin in the catalog
   */
  register(metadata: ExtendedPluginMetadata): void {
    // Check for duplicate IDs
    const existing = this.plugins.get(metadata.id);
    if (existing) {
      console.warn(
        `Plugin ID "${metadata.id}" is already registered (family: ${existing.family}, origin: ${existing.origin}). ` +
        `Overwriting with new plugin (family: ${metadata.family}, origin: ${metadata.origin}).`
      );
    }

    this.plugins.set(metadata.id, metadata);
    this.notifyListeners();
  }

  /**
   * Get a plugin by ID
   */
  get(id: string): ExtendedPluginMetadata | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get all plugins
   */
  getAll(): ExtendedPluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugins by family
   */
  getByFamily<F extends PluginFamily>(family: F): ExtendedPluginMetadata<F>[] {
    return this.getAll().filter(p => p.family === family) as ExtendedPluginMetadata<F>[];
  }

  /**
   * Get plugins by origin
   */
  getByOrigin(origin: PluginOrigin): ExtendedPluginMetadata[] {
    return this.getAll().filter(p => p.origin === origin);
  }

  /**
   * Get active plugins
   */
  getActive(): ExtendedPluginMetadata[] {
    return this.getAll().filter(p => p.activationState === 'active');
  }

  /**
   * Get built-in plugins
   */
  getBuiltins(): ExtendedPluginMetadata[] {
    return this.getByOrigin('builtin');
  }

  /**
   * Get user plugins (plugin-dir + ui-bundle)
   */
  getUserPlugins(): ExtendedPluginMetadata[] {
    return this.getAll().filter(
      p => p.origin === 'plugin-dir' || p.origin === 'ui-bundle'
    );
  }

  /**
   * Update activation state
   */
  setActivationState(id: string, state: ActivationState): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.activationState = state;
      this.notifyListeners();
    }
  }

  /**
   * Check if plugin can be disabled
   */
  canDisable(id: string): boolean {
    const plugin = this.plugins.get(id);
    return plugin?.canDisable ?? true;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    byFamily: Record<PluginFamily, number>;
    byOrigin: Record<PluginOrigin, number>;
    active: number;
    inactive: number;
  } {
    const all = this.getAll();

    const byFamily = {} as Record<PluginFamily, number>;
    const byOrigin = {} as Record<PluginOrigin, number>;

    for (const plugin of all) {
      byFamily[plugin.family] = (byFamily[plugin.family] || 0) + 1;
      byOrigin[plugin.origin] = (byOrigin[plugin.origin] || 0) + 1;
    }

    return {
      total: all.length,
      byFamily,
      byOrigin,
      active: all.filter(p => p.activationState === 'active').length,
      inactive: all.filter(p => p.activationState === 'inactive').length,
    };
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Print catalog summary to console
   */
  printSummary(): void {
    const summary = this.getSummary();

    console.log('=== Plugin Catalog Summary ===');
    console.log(`Total plugins: ${summary.total}`);
    console.log(`Active: ${summary.active}, Inactive: ${summary.inactive}`);
    console.log('\nBy Family:');
    for (const [family, count] of Object.entries(summary.byFamily)) {
      console.log(`  ${family}: ${count}`);
    }
    console.log('\nBy Origin:');
    for (const [origin, count] of Object.entries(summary.byOrigin)) {
      console.log(`  ${origin}: ${count}`);
    }
  }

  /**
   * Subscribe to catalog changes
   * Returns an unsubscribe function
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Error in plugin catalog listener:', error);
      }
    }
  }
}

// ============================================================================
// Activation Manager
// ============================================================================

/**
 * Manages plugin activation/deactivation across all families
 *
 * This provides a unified interface for enable/disable that works
 * consistently regardless of the underlying storage mechanism
 * (pluginConfigStore, PluginManager, etc.)
 */
export class PluginActivationManager {
  private catalog: PluginCatalog;
  private listeners = new Map<string, Set<(state: ActivationState) => void>>();

  constructor(catalog: PluginCatalog) {
    this.catalog = catalog;
  }

  /**
   * Activate a plugin
   */
  async activate(id: string): Promise<boolean> {
    const plugin = this.catalog.get(id);
    if (!plugin) {
      console.warn(`Plugin not found: ${id}`);
      return false;
    }

    // Some plugins may not support deactivation
    if (plugin.activationState === 'active') {
      return true; // Already active
    }

    try {
      // Update catalog
      this.catalog.setActivationState(id, 'active');

      // Notify listeners
      this.notifyListeners(id, 'active');

      return true;
    } catch (error) {
      console.error(`Failed to activate plugin ${id}:`, error);
      return false;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(id: string): Promise<boolean> {
    const plugin = this.catalog.get(id);
    if (!plugin) {
      console.warn(`Plugin not found: ${id}`);
      return false;
    }

    if (!plugin.canDisable) {
      console.warn(`Plugin ${id} cannot be disabled`);
      return false;
    }

    if (plugin.activationState === 'inactive') {
      return true; // Already inactive
    }

    try {
      // Update catalog
      this.catalog.setActivationState(id, 'inactive');

      // Notify listeners
      this.notifyListeners(id, 'inactive');

      return true;
    } catch (error) {
      console.error(`Failed to deactivate plugin ${id}:`, error);
      return false;
    }
  }

  /**
   * Toggle activation state
   */
  async toggle(id: string): Promise<boolean> {
    const plugin = this.catalog.get(id);
    if (!plugin) {
      return false;
    }

    return plugin.activationState === 'active'
      ? this.deactivate(id)
      : this.activate(id);
  }

  /**
   * Check if plugin is active
   */
  isActive(id: string): boolean {
    return this.catalog.get(id)?.activationState === 'active';
  }

  /**
   * Subscribe to activation state changes
   */
  subscribe(id: string, listener: (state: ActivationState) => void): () => void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }

    this.listeners.get(id)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(id)?.delete(listener);
    };
  }

  /**
   * Notify listeners of state change
   */
  private notifyListeners(id: string, state: ActivationState): void {
    const listeners = this.listeners.get(id);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(state);
        } catch (error) {
          console.error(`Listener error for plugin ${id}:`, error);
        }
      }
    }
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

/** Global plugin catalog */
export const pluginCatalog = new PluginCatalog();

/** Global activation manager */
export const pluginActivationManager = new PluginActivationManager(pluginCatalog);
