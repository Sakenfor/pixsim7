/**
 * Plugin Manifest Loader
 *
 * Discovers and loads plugin bundles from manifest.json files.
 * This enables drop-in plugin installation and runtime discovery.
 *
 * Features:
 * - Scans configurable directories for plugin manifests
 * - Dynamically loads ES module bundles
 * - Registers plugins with appropriate registries
 * - Supports multiple plugin families (scene-view, control-center, etc.)
 *
 * @example
 * ```typescript
 * import { loadPluginBundles } from '@lib/plugins/manifestLoader';
 *
 * // Load all plugin bundles from the default directory
 * await loadPluginBundles();
 *
 * // Load from a custom directory
 * await loadPluginBundles({ baseDir: '/custom/plugins' });
 * ```
 */

import { sceneViewRegistry } from './sceneViewPlugin';
import type { SceneViewPluginManifest, SceneViewPlugin } from './sceneViewPlugin';
import type { PluginManifest } from './types';

// ===== Types =====

/**
 * Plugin family identifiers for bundle loading
 */
export type BundlePluginFamily = 'scene' | 'ui' | 'tool';

/**
 * Extended manifest with bundle-specific fields
 */
export interface BundleManifest extends PluginManifest {
  /** Relative path to the plugin bundle (e.g., "plugin.js") */
  main: string;
  /** Scene view descriptor (for scene-view plugins) */
  sceneView?: SceneViewPluginManifest['sceneView'];
  /** Control center descriptor (for control-center plugins) */
  controlCenter?: {
    id: string;
    displayName: string;
    description?: string;
    default?: boolean;
  };
}

/**
 * Result of loading a single plugin bundle
 */
export interface BundleLoadResult {
  success: boolean;
  manifestPath: string;
  pluginId: string;
  family: BundlePluginFamily;
  error?: string;
}

/**
 * Options for loading plugin bundles
 */
export interface LoadPluginBundlesOptions {
  /** Base directory to scan for plugins (relative to app root) */
  baseDir?: string;
  /** Whether to log loading progress */
  verbose?: boolean;
  /** Whether to throw on individual plugin errors */
  strict?: boolean;
  /** Plugin families to load (default: all) */
  families?: BundlePluginFamily[];
}

/**
 * Discovered plugin bundle information
 */
interface DiscoveredBundle {
  manifestPath: string;
  bundleDir: string;
  family: BundlePluginFamily;
  manifest: BundleManifest;
}

// ===== Constants =====

/**
 * Default base directory for plugin bundles (relative to app root)
 */
const DEFAULT_BUNDLE_DIR = '/dist/plugins';

/**
 * Supported plugin families and their expected manifest extensions
 */
const PLUGIN_FAMILIES: BundlePluginFamily[] = ['scene', 'ui', 'tool'];

// ===== Discovery =====

/**
 * Discover plugin bundles in a directory using import.meta.glob
 *
 * Note: This uses Vite's glob import which requires string literal patterns.
 * The patterns are hardcoded to match the expected bundle structure.
 */
async function discoverBundles(): Promise<DiscoveredBundle[]> {
  const discovered: DiscoveredBundle[] = [];

  // Use Vite's glob import to find all manifest.json files
  // Note: The pattern must be a string literal for Vite to process it
  const manifestModules = import.meta.glob<{ default: BundleManifest }>(
    '/dist/plugins/**/manifest.json',
    { eager: false }
  );

  for (const [manifestPath, loader] of Object.entries(manifestModules)) {
    try {
      // Extract family from path (e.g., "/dist/plugins/scene/comic-panel-view/manifest.json" -> "scene")
      const pathParts = manifestPath.split('/');
      const familyIndex = pathParts.indexOf('plugins') + 1;
      const family = pathParts[familyIndex] as BundlePluginFamily;

      if (!PLUGIN_FAMILIES.includes(family)) {
        console.warn(`[ManifestLoader] Unknown plugin family: ${family} in ${manifestPath}`);
        continue;
      }

      // Load the manifest
      const manifestModule = await loader();
      const manifest = manifestModule.default;

      if (!manifest || !manifest.id) {
        console.warn(`[ManifestLoader] Invalid manifest at ${manifestPath}`);
        continue;
      }

      discovered.push({
        manifestPath,
        bundleDir: manifestPath.replace('/manifest.json', ''),
        family,
        manifest,
      });
    } catch (error) {
      console.warn(`[ManifestLoader] Failed to load manifest at ${manifestPath}:`, error);
    }
  }

  return discovered;
}

/**
 * Alternative discovery using fetch for runtime-loaded bundles
 *
 * This is used when bundles are placed in the public directory
 * and need to be loaded at runtime (not bundled with the app).
 */
async function discoverBundlesFromPublic(baseDir: string): Promise<DiscoveredBundle[]> {
  const discovered: DiscoveredBundle[] = [];

  // Try to fetch a manifest index file if it exists
  try {
    const indexResponse = await fetch(`${baseDir}/index.json`);
    if (indexResponse.ok) {
      const index = await indexResponse.json() as { plugins: string[] };

      for (const pluginPath of index.plugins) {
        try {
          const manifestPath = `${baseDir}/${pluginPath}/manifest.json`;
          const manifestResponse = await fetch(manifestPath);

          if (!manifestResponse.ok) continue;

          const manifest = await manifestResponse.json() as BundleManifest;
          const family = pluginPath.split('/')[0] as BundlePluginFamily;

          if (!PLUGIN_FAMILIES.includes(family)) continue;

          discovered.push({
            manifestPath,
            bundleDir: `${baseDir}/${pluginPath}`,
            family,
            manifest,
          });
        } catch (error) {
          console.warn(`[ManifestLoader] Failed to load plugin ${pluginPath}:`, error);
        }
      }
    }
  } catch {
    // No index file, skip public directory discovery
  }

  return discovered;
}

// ===== Loading =====

/**
 * Load a scene view plugin bundle
 */
async function loadSceneViewBundle(bundle: DiscoveredBundle): Promise<void> {
  const { bundleDir, manifest } = bundle;

  if (!manifest.sceneView) {
    throw new Error('Scene view plugin missing sceneView descriptor');
  }

  // Construct the bundle URL
  const bundlePath = `${bundleDir}/${manifest.main}`;

  // Dynamic import the plugin bundle
  const pluginModule = await import(/* @vite-ignore */ bundlePath);

  // Extract the plugin export
  const plugin: SceneViewPlugin = pluginModule.plugin || pluginModule.default?.plugin;

  if (!plugin || typeof plugin.render !== 'function') {
    throw new Error('Plugin bundle does not export a valid plugin with render function');
  }

  // Register with the scene view registry
  const fullManifest: SceneViewPluginManifest = {
    ...manifest,
    type: 'ui-overlay',
    sceneView: manifest.sceneView,
  };

  sceneViewRegistry.register(fullManifest, plugin);
}

/**
 * Load a UI plugin bundle (control centers, etc.)
 */
async function loadUIBundle(bundle: DiscoveredBundle): Promise<void> {
  const { bundleDir, manifest } = bundle;

  // Construct the bundle URL
  const bundlePath = `${bundleDir}/${manifest.main}`;

  // Dynamic import the plugin bundle
  const pluginModule = await import(/* @vite-ignore */ bundlePath);

  // Handle different UI plugin types
  if (manifest.controlCenter) {
    // Control center plugin - defer to control center registry
    // Note: This is a placeholder for future control center bundle support
    console.info(`[ManifestLoader] Control center bundle loading not yet implemented: ${manifest.id}`);
    return;
  }

  // Generic UI plugin
  const plugin = pluginModule.plugin || pluginModule.default?.plugin;

  if (!plugin) {
    throw new Error('Plugin bundle does not export a valid plugin');
  }

  // Call register function if available
  if (typeof pluginModule.register === 'function') {
    pluginModule.register();
  }
}

/**
 * Load a tool plugin bundle
 */
async function loadToolBundle(bundle: DiscoveredBundle): Promise<void> {
  const { bundleDir, manifest } = bundle;

  // Construct the bundle URL
  const bundlePath = `${bundleDir}/${manifest.main}`;

  // Dynamic import the plugin bundle
  const pluginModule = await import(/* @vite-ignore */ bundlePath);

  // Call register function if available
  if (typeof pluginModule.register === 'function') {
    pluginModule.register();
  } else {
    console.warn(`[ManifestLoader] Tool plugin ${manifest.id} has no register function`);
  }
}

/**
 * Load a single plugin bundle based on its family
 */
async function loadBundle(bundle: DiscoveredBundle): Promise<BundleLoadResult> {
  const { manifestPath, manifest, family } = bundle;

  try {
    switch (family) {
      case 'scene':
        await loadSceneViewBundle(bundle);
        break;
      case 'ui':
        await loadUIBundle(bundle);
        break;
      case 'tool':
        await loadToolBundle(bundle);
        break;
      default:
        throw new Error(`Unknown plugin family: ${family}`);
    }

    return {
      success: true,
      manifestPath,
      pluginId: manifest.id,
      family,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      manifestPath,
      pluginId: manifest.id,
      family,
      error: message,
    };
  }
}

// ===== Public API =====

/**
 * Load all plugin bundles from the configured directory
 *
 * This function discovers and loads plugin bundles, registering them
 * with the appropriate registries. It's designed to be called during
 * application bootstrap, after hardcoded plugins are loaded.
 *
 * @param options Configuration options
 * @returns Array of load results for each discovered plugin
 */
export async function loadPluginBundles(
  options: LoadPluginBundlesOptions = {}
): Promise<BundleLoadResult[]> {
  const {
    baseDir = DEFAULT_BUNDLE_DIR,
    verbose = true,
    strict = false,
    families = PLUGIN_FAMILIES,
  } = options;

  const results: BundleLoadResult[] = [];

  if (verbose) {
    console.log('[ManifestLoader] Discovering plugin bundles...');
  }

  // Discover bundles using Vite's glob import
  let discovered = await discoverBundles();

  // Also check public directory for runtime-loaded bundles
  const publicBundles = await discoverBundlesFromPublic(baseDir);
  discovered = [...discovered, ...publicBundles];

  // Filter by requested families
  discovered = discovered.filter(b => families.includes(b.family));

  if (discovered.length === 0) {
    if (verbose) {
      console.log('[ManifestLoader] No plugin bundles found');
    }
    return results;
  }

  if (verbose) {
    console.log(`[ManifestLoader] Found ${discovered.length} plugin bundle(s)`);
  }

  // Load each bundle
  for (const bundle of discovered) {
    if (verbose) {
      console.log(`[ManifestLoader] Loading ${bundle.manifest.id}...`);
    }

    const result = await loadBundle(bundle);
    results.push(result);

    if (result.success) {
      if (verbose) {
        console.log(`[ManifestLoader]   ✓ ${result.pluginId} loaded`);
      }
    } else {
      const message = `[ManifestLoader]   ✗ ${result.pluginId}: ${result.error}`;

      if (strict) {
        throw new Error(message);
      } else {
        console.warn(message);
      }
    }
  }

  // Summary
  if (verbose) {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`[ManifestLoader] Loaded ${successful} plugin(s), ${failed} failed`);
  }

  return results;
}

/**
 * Load scene view plugin bundles only
 *
 * Convenience function for loading only scene view plugins.
 *
 * @param options Configuration options
 */
export async function loadSceneViewBundles(
  options: Omit<LoadPluginBundlesOptions, 'families'> = {}
): Promise<BundleLoadResult[]> {
  return loadPluginBundles({
    ...options,
    families: ['scene'],
  });
}

/**
 * Check if any plugin bundles are available
 *
 * Quick check to see if there are any bundles to load,
 * without actually loading them.
 */
export async function hasPluginBundles(): Promise<boolean> {
  const discovered = await discoverBundles();
  return discovered.length > 0;
}

/**
 * Get list of discovered plugin manifests without loading them
 *
 * Useful for UI that shows available plugins before loading.
 */
export async function getAvailablePluginManifests(): Promise<BundleManifest[]> {
  const discovered = await discoverBundles();
  return discovered.map(b => b.manifest);
}

// ===== Remote Bundle Loading =====

/**
 * Remote plugin descriptor from the backend catalog API
 */
export interface RemotePluginDescriptor {
  pluginId: string;
  bundleUrl: string;
  family: BundlePluginFamily;
  manifest?: Partial<BundleManifest>;
}

/**
 * Load a single plugin bundle from a remote URL
 *
 * This is used to load plugins from the backend catalog when enabled.
 * The bundle URL can be absolute or relative to the backend.
 *
 * @param descriptor Plugin information from the backend
 * @returns Load result
 */
export async function loadRemotePluginBundle(
  descriptor: RemotePluginDescriptor
): Promise<BundleLoadResult> {
  const { pluginId, bundleUrl, family, manifest: partialManifest } = descriptor;

  try {
    // Resolve the bundle URL (handle relative URLs)
    const resolvedUrl = resolveBundleUrl(bundleUrl);

    console.log(`[ManifestLoader] Loading remote plugin ${pluginId} from ${resolvedUrl}`);

    // Dynamic import the plugin bundle
    const pluginModule = await import(/* @vite-ignore */ resolvedUrl);

    // Extract manifest and plugin from the module
    const manifest: BundleManifest = pluginModule.manifest || partialManifest || {
      id: pluginId,
      name: pluginId,
      version: '1.0.0',
      author: 'Unknown',
      description: '',
      type: 'ui-overlay',
      permissions: [],
      main: 'plugin.js',
    };

    const plugin = pluginModule.plugin || pluginModule.default?.plugin;

    // Register based on family
    switch (family) {
      case 'scene':
        if (manifest.sceneView && plugin && typeof plugin.render === 'function') {
          const fullManifest: SceneViewPluginManifest = {
            ...manifest,
            type: 'ui-overlay',
            sceneView: manifest.sceneView,
          };
          sceneViewRegistry.register(fullManifest, plugin);
        } else {
          throw new Error('Scene plugin missing sceneView descriptor or render function');
        }
        break;

      case 'ui':
        if (typeof pluginModule.register === 'function') {
          pluginModule.register();
        }
        break;

      case 'tool':
        if (typeof pluginModule.register === 'function') {
          pluginModule.register();
        }
        break;

      default:
        throw new Error(`Unknown plugin family: ${family}`);
    }

    console.log(`[ManifestLoader] ✓ Remote plugin ${pluginId} loaded successfully`);

    return {
      success: true,
      manifestPath: resolvedUrl,
      pluginId,
      family,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ManifestLoader] ✗ Failed to load remote plugin ${pluginId}:`, message);

    return {
      success: false,
      manifestPath: bundleUrl,
      pluginId,
      family,
      error: message,
    };
  }
}

/**
 * Load multiple plugin bundles from remote URLs
 *
 * Used by the plugin catalog store to load enabled plugins.
 *
 * @param descriptors Array of plugin descriptors
 * @returns Array of load results
 */
export async function loadRemotePluginBundles(
  descriptors: RemotePluginDescriptor[]
): Promise<BundleLoadResult[]> {
  const results: BundleLoadResult[] = [];

  console.log(`[ManifestLoader] Loading ${descriptors.length} remote plugin(s)...`);

  for (const descriptor of descriptors) {
    // Skip plugins that are already registered
    if (isPluginRegistered(descriptor.pluginId, descriptor.family)) {
      console.log(`[ManifestLoader] Plugin ${descriptor.pluginId} already registered, skipping`);
      results.push({
        success: true,
        manifestPath: descriptor.bundleUrl,
        pluginId: descriptor.pluginId,
        family: descriptor.family,
      });
      continue;
    }

    const result = await loadRemotePluginBundle(descriptor);
    results.push(result);
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`[ManifestLoader] Remote loading complete: ${successful} succeeded, ${failed} failed`);

  return results;
}

/**
 * Check if a plugin is already registered
 */
function isPluginRegistered(pluginId: string, family: BundlePluginFamily): boolean {
  switch (family) {
    case 'scene':
      return sceneViewRegistry.getEntry(pluginId) !== null;
    // Add other registries as needed
    default:
      return false;
  }
}

/**
 * Resolve a bundle URL (handle relative paths)
 */
function resolveBundleUrl(url: string): string {
  // Absolute URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Relative to backend - prepend backend URL
  if (url.startsWith('/plugins/') || url.startsWith('/api/')) {
    // Get backend URL from environment or infer from current location
    const backendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
    if (backendUrl) {
      return `${backendUrl.replace(/\/$/, '')}${url}`;
    }

    // Fallback: assume same origin with backend port
    if (typeof window !== 'undefined') {
      const { protocol, hostname } = window.location;
      return `${protocol}//${hostname}:8000${url}`;
    }
  }

  // Relative path - use as-is (Vite will resolve)
  return url;
}

/**
 * Unregister a plugin by ID
 *
 * Used when disabling a plugin at runtime.
 */
export function unregisterPlugin(pluginId: string, family: BundlePluginFamily): boolean {
  switch (family) {
    case 'scene':
      sceneViewRegistry.unregister(pluginId);
      return true;
    // Add other registries as needed
    default:
      console.warn(`[ManifestLoader] Cannot unregister plugin family: ${family}`);
      return false;
  }
}
