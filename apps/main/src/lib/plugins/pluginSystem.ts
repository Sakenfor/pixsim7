/**
 * Unified Plugin System
 *
 * This module provides a consistent approach to plugin discovery, registration,
 * and lifecycle management across all plugin families in the application.
 *
 * Core types and registries are imported from @pixsim7/shared.plugins.
 * This module adds Vite-specific plugin discovery using import.meta.glob.
 */

// ============================================================================
// Re-export core types and classes from shared package
// ============================================================================

export type {
  PluginOrigin,
  PluginFamily,
  ActivationState,
  PluginCapabilityHints,
  PluginMetadata,
  PluginMetadataExtensions,
  ExtendedPluginMetadata,
} from '@pixsim7/shared.plugins';

export {
  PluginCatalog,
  createPluginCatalog,
  PluginActivationManager,
  createPluginActivationManager,
} from '@pixsim7/shared.plugins';

import type {
  PluginFamily,
  PluginOrigin,
  PluginMetadata,
} from '@pixsim7/shared.plugins';
import {
  PluginCatalog,
  PluginActivationManager,
} from '@pixsim7/shared.plugins';

// ============================================================================
// Discovery Configuration (Vite-specific)
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
// Plugin Discovery (Vite-specific)
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
  plugin: unknown;

  /** Extracted metadata (if available) */
  metadata?: Partial<PluginMetadata>;
}

// Vite import.meta.glob maps - these must be static string literals
const EAGER_GLOB_MAP: Record<string, Record<string, unknown>> = {
  '/src/plugins/helpers/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/helpers/**/*.{ts,tsx,js,jsx}', { eager: true }),
  '/src/plugins/interactions/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/interactions/**/*.{ts,tsx,js,jsx}', { eager: true }),
  '/src/plugins/galleryTools/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/galleryTools/**/*.{ts,tsx,js,jsx}', { eager: true }),
  '/src/plugins/worldTools/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/worldTools/**/*.{ts,tsx,js,jsx}', { eager: true }),
  '/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}', { eager: true }),
};

const LAZY_GLOB_MAP: Record<string, Record<string, () => Promise<unknown>>> = {
  '/src/plugins/helpers/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/helpers/**/*.{ts,tsx,js,jsx}', { eager: false }),
  '/src/plugins/interactions/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/interactions/**/*.{ts,tsx,js,jsx}', { eager: false }),
  '/src/plugins/galleryTools/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/galleryTools/**/*.{ts,tsx,js,jsx}', { eager: false }),
  '/src/plugins/worldTools/**/*.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/plugins/worldTools/**/*.{ts,tsx,js,jsx}', { eager: false }),
  '/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}': import.meta.glob<unknown>('/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}', { eager: false }),
};

/**
 * Generic plugin discovery utility (Vite-specific)
 *
 * This replaces the duplicated import.meta.glob patterns across loaders.
 * Uses Vite's import.meta.glob for module discovery.
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
        const module = config.eager ? moduleLoader : await (moduleLoader as () => Promise<unknown>)();
        const plugins = this.extractPlugins(module, config);

        for (const plugin of plugins) {
          discovered.push({
            path,
            family: config.family,
            origin: config.origin,
            plugin,
            metadata: this.extractMetadata(plugin),
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
  private static getGlobModules(config: PluginDiscoveryConfig): Record<string, unknown> {
    const globMap = config.eager ? EAGER_GLOB_MAP : LAZY_GLOB_MAP;
    const modules: Record<string, unknown> = {};

    for (const pattern of config.patterns) {
      const glob = globMap[pattern];
      if (!glob) {
        console.warn(`[PluginDiscovery] Unsupported glob pattern: ${pattern}`);
        continue;
      }
      Object.assign(modules, glob);
    }

    return modules;
  }

  /**
   * Extract plugins from a module based on extraction mode
   */
  private static extractPlugins(module: unknown, config: PluginDiscoveryConfig): unknown[] {
    const mod = module as Record<string, unknown>;

    switch (config.extractionMode) {
      case 'named-export':
        return this.extractByNamedExport(mod, config.exportPattern!);

      case 'default-export':
        return mod.default ? [mod.default] : [];

      case 'auto-detect':
        return this.extractByAutoDetect(mod, config.requiredProperties!);

      default:
        throw new Error(`Unknown extraction mode: ${config.extractionMode}`);
    }
  }

  /**
   * Extract exports matching a naming pattern
   */
  private static extractByNamedExport(module: Record<string, unknown>, pattern: string): unknown[] {
    const regex = this.patternToRegex(pattern);
    return Object.entries(module)
      .filter(([name]) => regex.test(name))
      .map(([, exportValue]) => exportValue);
  }

  /**
   * Extract objects with required properties
   */
  private static extractByAutoDetect(module: Record<string, unknown>, requiredProps: string[]): unknown[] {
    return Object.values(module).filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        requiredProps.every(prop => prop in (value as Record<string, unknown>))
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
  private static extractMetadata(plugin: unknown): Partial<PluginMetadata> | undefined {
    if (!plugin || typeof plugin !== 'object') {
      return undefined;
    }

    const p = plugin as Record<string, unknown>;
    return {
      id: p.id as string | undefined,
      name: p.name as string | undefined,
      description: p.description as string | undefined,
      version: p.version as string | undefined,
      author: p.author as string | undefined,
    };
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

/** Global plugin catalog */
export const pluginCatalog = new PluginCatalog();

/** Global activation manager */
export const pluginActivationManager = new PluginActivationManager(pluginCatalog);
