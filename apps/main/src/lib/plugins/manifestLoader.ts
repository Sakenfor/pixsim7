/**
 * Plugin Manifest Discovery
 *
 * Discovers plugin manifests without registering them. Registration and
 * loading are handled by bundleRegistrar to keep discovery side-effect free.
 *
 * @example
 * ```typescript
 * import { getAvailablePluginManifests } from '@lib/plugins/manifestLoader';
 *
 * const manifests = await getAvailablePluginManifests();
 * ```
 */

import type { ControlCenterPluginManifest } from './controlCenterPlugin';
import type { SceneViewPluginManifest } from './sceneViewPlugin';
import type { PluginManifest } from './types';
import {
  BUNDLE_FAMILIES,
  type BundleFamily,
} from './types';

// ===== Types =====

/**
 * Plugin family identifiers for bundle loading
 * @deprecated Use `BundleFamily` from './types' instead
 */
export type BundlePluginFamily = BundleFamily;

/**
 * Extended manifest with bundle-specific fields
 */
export interface BundleManifest extends PluginManifest {
  /** Relative path to the plugin bundle (e.g., "plugin.js") */
  main: string;
  /** Scene view descriptor (for scene-view plugins) */
  sceneView?: SceneViewPluginManifest['sceneView'];
  /** Control center descriptor (for control-center plugins) */
  controlCenter?: ControlCenterPluginManifest['controlCenter'];
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
export interface DiscoveredBundle {
  manifestPath: string;
  bundleDir: string;
  family: BundlePluginFamily;
  manifest: BundleManifest;
}

// ===== Constants =====

/**
 * Default base directory for plugin bundles (relative to app root)
 */
export const DEFAULT_BUNDLE_DIR = '/dist/plugins';

/**
 * Supported plugin families and their expected manifest extensions
 */
export const PLUGIN_FAMILIES: BundleFamily[] = [...BUNDLE_FAMILIES];

// ===== Discovery =====

/**
 * Discover plugin bundles in a directory using import.meta.glob
 *
 * Note: This uses Vite's glob import which requires string literal patterns.
 * The patterns are hardcoded to match the expected bundle structure.
 */
export async function discoverBundles(): Promise<DiscoveredBundle[]> {
  const discovered: DiscoveredBundle[] = [];

  const manifestModules = import.meta.glob<{ default: BundleManifest }>(
    '/dist/plugins/**/manifest.json',
    { eager: false }
  );

  for (const [manifestPath, loader] of Object.entries(manifestModules)) {
    try {
      const manifestModule = await loader();
      const manifest = manifestModule.default;

      if (!manifest || !manifest.id) {
        console.warn(`[ManifestLoader] Invalid manifest at ${manifestPath}`);
        continue;
      }

      const family = manifest.family as BundlePluginFamily | undefined;

      if (!family) {
        console.warn(`[ManifestLoader] Manifest missing family: ${manifest.id}`);
        continue;
      }

      if (!PLUGIN_FAMILIES.includes(family)) {
        console.warn(`[ManifestLoader] Unknown plugin family '${family}' in manifest ${manifest.id}`);
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
export async function discoverBundlesFromPublic(baseDir: string): Promise<DiscoveredBundle[]> {
  const discovered: DiscoveredBundle[] = [];

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
          const family = manifest.family as BundlePluginFamily | undefined;

          if (!family || !PLUGIN_FAMILIES.includes(family)) continue;

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

/**
 * Check if any plugin bundles are available
 */
export async function hasPluginBundles(): Promise<boolean> {
  const discovered = await discoverBundles();
  return discovered.length > 0;
}

/**
 * Get list of discovered plugin manifests without loading them
 */
export async function getAvailablePluginManifests(): Promise<BundleManifest[]> {
  const discovered = await discoverBundles();
  return discovered.map(b => b.manifest);
}
