import type { ControlCenterPlugin, ControlCenterPluginManifest } from './controlCenterPlugin';
import {
  DEFAULT_BUNDLE_DIR,
  PLUGIN_FAMILIES,
  discoverBundles,
  discoverBundlesFromPublic,
  type BundleManifest,
  type BundlePluginFamily,
  type BundleLoadResult,
  type DiscoveredBundle,
  type LoadPluginBundlesOptions,
} from './manifestLoader';
import { registerPluginDefinition } from './pluginRuntime';
import type {
  ExtendedPluginMetadata,
  PluginCapabilityHints,
  PluginOrigin,
} from './pluginSystem';
import { pluginCatalog } from './pluginSystem';
import type { PluginRegistration } from './registration';
import type { SceneViewPlugin, SceneViewPluginManifest } from './sceneViewPlugin';
import { bundleFamilyToUnified } from './types';

const sceneViewIdsByPluginId = new Map<string, string>();
const controlCenterIdsByPluginId = new Map<string, string>();

function buildBundleDependencies(manifest: BundleManifest): {
  capabilities?: PluginCapabilityHints;
  providesFeatures?: string[];
  consumesFeatures?: string[];
  consumesActions?: string[];
  consumesState?: string[];
} {
  const capabilities: PluginCapabilityHints = {};
  const providesFeatures: string[] = [];
  const consumesFeatures: string[] = [];
  const consumesActions: string[] = [];
  const consumesState: string[] = [];

  if (manifest.permissions?.includes('ui:overlay')) {
    capabilities.addsUIOverlay = true;
    consumesFeatures.push('workspace');
    providesFeatures.push('ui-overlay');
  }

  if (manifest.permissions?.includes('read:session')) {
    consumesState.push('generation.active');
  }

  if (manifest.controlCenter) {
    consumesFeatures.push('assets', 'workspace', 'generation');
    consumesActions.push('workspace.open-panel', 'generation.quick-generate');
    consumesState.push('workspace.panels');
    providesFeatures.push('control-center');
  }

  if (manifest.type === 'theme') {
    providesFeatures.push('theme');
  } else if (manifest.type === 'tool') {
    providesFeatures.push('ui-tool');
  } else if (manifest.type === 'enhancement') {
    providesFeatures.push('ui-enhancement');
  }

  return {
    capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
    providesFeatures: providesFeatures.length > 0 ? providesFeatures : undefined,
    consumesFeatures: consumesFeatures.length > 0 ? consumesFeatures : undefined,
    consumesActions: consumesActions.length > 0 ? consumesActions : undefined,
    consumesState: consumesState.length > 0 ? consumesState : undefined,
  };
}

function buildUiBundleMetadata(
  manifest: BundleManifest,
  origin: PluginOrigin
): ExtendedPluginMetadata<'ui-plugin'> {
  const dependencies = buildBundleDependencies(manifest);
  const metadata: ExtendedPluginMetadata<'ui-plugin'> = {
    id: manifest.id,
    name: manifest.name,
    family: 'ui-plugin',
    origin,
    activationState: 'active',
    canDisable: origin !== 'builtin',
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    tags: manifest.tags,
    pluginType: manifest.type,
    bundleFamily: manifest.family === 'tool' ? 'tool' : 'ui',
    hasOverlays: manifest.permissions?.includes('ui:overlay'),
    icon: manifest.icon,
    ...dependencies,
  };

  return metadata;
}

async function loadSceneViewBundle(bundle: DiscoveredBundle): Promise<void> {
  const { bundleDir, manifest } = bundle;

  if (!manifest.sceneView) {
    throw new Error('Scene view plugin missing sceneView descriptor');
  }

  const bundlePath = `${bundleDir}/${manifest.main}`;
  const pluginModule = await import(/* @vite-ignore */ bundlePath);
  const plugin: SceneViewPlugin = pluginModule.plugin || pluginModule.default?.plugin;

  if (!plugin || typeof plugin.render !== 'function') {
    throw new Error('Plugin bundle does not export a valid plugin with render function');
  }

  const fullManifest: SceneViewPluginManifest = {
    ...manifest,
    type: 'ui-overlay',
    sceneView: manifest.sceneView,
  };

  const metadata = buildBundleDependencies(manifest);
  sceneViewIdsByPluginId.set(manifest.id, manifest.sceneView.id);

  await registerPluginDefinition({
    id: manifest.id,
    family: 'scene-view',
    origin: 'ui-bundle',
    source: 'bundle',
    plugin: { manifest: fullManifest, plugin },
    metadata,
  });
}

async function loadControlCenterBundle(bundle: DiscoveredBundle): Promise<void> {
  const { bundleDir, manifest } = bundle;

  if (!manifest.controlCenter) {
    throw new Error('Control center plugin missing controlCenter descriptor');
  }

  const bundlePath = `${bundleDir}/${manifest.main}`;
  const pluginModule = await import(/* @vite-ignore */ bundlePath);
  const plugin: ControlCenterPlugin = pluginModule.plugin || pluginModule.default?.plugin;

  if (!plugin || typeof plugin.render !== 'function') {
    throw new Error('Control center bundle does not export a valid plugin with render function');
  }

  const fullManifest: ControlCenterPluginManifest = {
    ...manifest,
    type: 'ui-overlay',
    controlCenter: manifest.controlCenter,
  };

  const metadata = buildBundleDependencies(manifest);
  controlCenterIdsByPluginId.set(manifest.id, manifest.controlCenter.id);

  await registerPluginDefinition({
    id: manifest.id,
    family: 'control-center',
    origin: 'ui-bundle',
    source: 'bundle',
    plugin: { manifest: fullManifest, plugin },
    metadata,
  });
}

async function loadUIBundle(bundle: DiscoveredBundle): Promise<void> {
  const { bundleDir, manifest } = bundle;
  const bundlePath = `${bundleDir}/${manifest.main}`;
  const pluginModule = await import(/* @vite-ignore */ bundlePath);
  const plugin = pluginModule.plugin || pluginModule.default?.plugin;

  if (!plugin) {
    throw new Error('Plugin bundle does not export a valid plugin');
  }

  const metadata = buildUiBundleMetadata(manifest, 'ui-bundle');

  await registerPluginDefinition({
    id: manifest.id,
    family: 'ui-plugin',
    origin: 'ui-bundle',
    source: 'bundle',
    plugin: {
      metadata,
      register: pluginModule.register,
    },
    activationState: metadata.activationState,
    canDisable: metadata.canDisable,
  });
}

async function loadToolBundle(bundle: DiscoveredBundle): Promise<void> {
  const { bundleDir, manifest } = bundle;
  const bundlePath = `${bundleDir}/${manifest.main}`;
  const pluginModule = await import(/* @vite-ignore */ bundlePath);

  const metadata = buildUiBundleMetadata(manifest, 'ui-bundle');

  await registerPluginDefinition({
    id: manifest.id,
    family: 'ui-plugin',
    origin: 'ui-bundle',
    source: 'bundle',
    plugin: {
      metadata,
      register: pluginModule.register,
    },
    activationState: metadata.activationState,
    canDisable: metadata.canDisable,
  });
}

async function loadBundle(bundle: DiscoveredBundle): Promise<BundleLoadResult> {
  const { manifestPath, manifest, family } = bundle;

  try {
    switch (family) {
      case 'scene':
        await loadSceneViewBundle(bundle);
        break;
      case 'control-center':
        await loadControlCenterBundle(bundle);
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

export async function discoverBundleRegistrations(
  options: LoadPluginBundlesOptions = {}
): Promise<PluginRegistration[]> {
  const {
    baseDir = DEFAULT_BUNDLE_DIR,
    verbose = false,
    families = PLUGIN_FAMILIES,
  } = options;

  let discovered = await discoverBundles();
  const publicBundles = await discoverBundlesFromPublic(baseDir);
  discovered = [...discovered, ...publicBundles];

  discovered = discovered.filter((bundle) => families.includes(bundle.family));

  if (verbose) {
    console.log(`[BundleRegistrar] Discovered ${discovered.length} plugin bundle(s)`);
  }

  return discovered.map((bundle) => ({
    id: bundle.manifest.id,
    family: bundleFamilyToUnified(bundle.family),
    origin: 'ui-bundle',
    source: 'bundle',
    label: bundle.manifest.name,
    register: async () => {
      const result = await loadBundle(bundle);
      if (!result.success) {
        throw new Error(result.error || `Failed to load bundle ${result.pluginId}`);
      }
    },
  }));
}

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
    console.log('[BundleRegistrar] Discovering plugin bundles...');
  }

  let discovered = await discoverBundles();
  const publicBundles = await discoverBundlesFromPublic(baseDir);
  discovered = [...discovered, ...publicBundles];

  discovered = discovered.filter(b => families.includes(b.family));

  if (discovered.length === 0) {
    if (verbose) {
      console.log('[BundleRegistrar] No plugin bundles found');
    }
    return results;
  }

  if (verbose) {
    console.log(`[BundleRegistrar] Found ${discovered.length} plugin bundle(s)`);
  }

  for (const bundle of discovered) {
    if (verbose) {
      console.log(`[BundleRegistrar] Loading ${bundle.manifest.id}...`);
    }

    const result = await loadBundle(bundle);
    results.push(result);

    if (result.success) {
      if (verbose) {
        console.log(`[BundleRegistrar]   + ${result.pluginId} loaded`);
      }
    } else {
      const message = `[BundleRegistrar]   - ${result.pluginId}: ${result.error}`;

      if (strict) {
        throw new Error(message);
      } else {
        console.warn(message);
      }
    }
  }

  if (verbose) {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`[BundleRegistrar] Loaded ${successful} plugin(s), ${failed} failed`);
  }

  return results;
}

export async function loadSceneViewBundles(
  options: Omit<LoadPluginBundlesOptions, 'families'> = {}
): Promise<BundleLoadResult[]> {
  return loadPluginBundles({
    ...options,
    families: ['scene'],
  });
}

export interface RemotePluginDescriptor {
  pluginId: string;
  bundleUrl: string;
  family: BundlePluginFamily;
  manifest?: Partial<BundleManifest>;
}

export async function loadRemotePluginBundle(
  descriptor: RemotePluginDescriptor
): Promise<BundleLoadResult> {
  const { pluginId, bundleUrl, family, manifest: partialManifest } = descriptor;
  let resolvedFamily: BundlePluginFamily | undefined = family;

  try {
    const resolvedUrl = resolveBundleUrl(bundleUrl);

    console.log(`[BundleRegistrar] Loading remote plugin ${pluginId} from ${resolvedUrl}`);

    const pluginModule = await import(/* @vite-ignore */ resolvedUrl);

    let manifest: BundleManifest | undefined = pluginModule.manifest;

    if (!manifest && partialManifest) {
      manifest = partialManifest as BundleManifest;
    }

    if (!manifest) {
      manifest = {
        id: pluginId,
        name: pluginId,
        version: '1.0.0',
        author: 'Unknown',
        description: '',
        type: 'ui-overlay',
        permissions: [],
        main: 'plugin.js',
        family,
      };
    } else if (!manifest.family && family) {
      manifest.family = family;
    }

    const manifestFamily = manifest.family as BundlePluginFamily | undefined;
    resolvedFamily = manifestFamily ?? family;

    if (!resolvedFamily) {
      throw new Error(`Plugin ${pluginId} missing family metadata`);
    }

    if (manifestFamily && family && manifestFamily !== family) {
      console.warn(
        `[BundleRegistrar] Family mismatch for ${pluginId}: manifest=${manifestFamily}, descriptor=${family}. Using manifest value.`
      );
    }

    manifest.family = resolvedFamily;

    const plugin = pluginModule.plugin || pluginModule.default?.plugin;

    switch (resolvedFamily) {
      case 'scene':
        if (manifest.sceneView && plugin && typeof plugin.render === 'function') {
          const fullManifest: SceneViewPluginManifest = {
            ...manifest,
            type: 'ui-overlay',
            sceneView: manifest.sceneView,
          };
          const metadata = buildBundleDependencies(manifest);
          sceneViewIdsByPluginId.set(manifest.id, manifest.sceneView.id);
          await registerPluginDefinition({
            id: manifest.id,
            family: 'scene-view',
            origin: 'ui-bundle',
            source: 'bundle',
            plugin: { manifest: fullManifest, plugin },
            metadata,
          });
        } else {
          throw new Error('Scene plugin missing sceneView descriptor or render function');
        }
        break;

      case 'control-center':
        if (manifest.controlCenter && plugin && typeof plugin.render === 'function') {
          const fullManifest: ControlCenterPluginManifest = {
            ...manifest,
            type: 'ui-overlay',
            controlCenter: manifest.controlCenter,
          };
          const metadata = buildBundleDependencies(manifest);
          controlCenterIdsByPluginId.set(manifest.id, manifest.controlCenter.id);
          await registerPluginDefinition({
            id: manifest.id,
            family: 'control-center',
            origin: 'ui-bundle',
            source: 'bundle',
            plugin: { manifest: fullManifest, plugin },
            metadata,
          });
        } else {
          throw new Error('Control center plugin missing controlCenter descriptor or render function');
        }
        break;

      case 'ui':
      case 'tool': {
        const metadata = buildUiBundleMetadata(manifest, 'ui-bundle');
        await registerPluginDefinition({
          id: manifest.id,
          family: 'ui-plugin',
          origin: 'ui-bundle',
          source: 'bundle',
          plugin: {
            metadata,
            register: pluginModule.register,
          },
          activationState: metadata.activationState,
          canDisable: metadata.canDisable,
        });
        break;
      }

      default:
        throw new Error(`Unknown plugin family: ${resolvedFamily}`);
    }

    console.log(`[BundleRegistrar] Remote plugin ${pluginId} loaded successfully`);

    return {
      success: true,
      manifestPath: resolvedUrl,
      pluginId,
      family: resolvedFamily,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[BundleRegistrar] Failed to load remote plugin ${pluginId}:`, message);

    return {
      success: false,
      manifestPath: bundleUrl,
      pluginId,
      family: resolvedFamily ?? family,
      error: message,
    };
  }
}

export async function loadRemotePluginBundles(
  descriptors: RemotePluginDescriptor[]
): Promise<BundleLoadResult[]> {
  const results: BundleLoadResult[] = [];

  console.log(`[BundleRegistrar] Loading ${descriptors.length} remote plugin(s)...`);

  for (const descriptor of descriptors) {
    if (await isPluginRegistered(descriptor.pluginId, descriptor.family)) {
      console.log(`[BundleRegistrar] Plugin ${descriptor.pluginId} already registered, skipping`);
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
  console.log(`[BundleRegistrar] Remote loading complete: ${successful} succeeded, ${failed} failed`);

  return results;
}

async function isPluginRegistered(
  pluginId: string,
  family: BundlePluginFamily
): Promise<boolean> {
  switch (family) {
    case 'scene': {
      const { sceneViewRegistry } = await import('./sceneViewPlugin');
      return sceneViewRegistry.getEntry(pluginId) !== null;
    }
    case 'control-center':
    case 'ui':
    case 'tool': {
      return pluginCatalog.get(pluginId) !== undefined;
    }
    default:
      return false;
  }
}

function resolveBundleUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('/plugins/') || url.startsWith('/api/')) {
    const backendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
    if (backendUrl) {
      return `${backendUrl.replace(/\/$/, '')}${url}`;
    }

    if (typeof window !== 'undefined') {
      const { protocol, hostname } = window.location;
      return `${protocol}//${hostname}:8000${url}`;
    }
  }

  return url;
}

export async function unregisterPlugin(
  pluginId: string,
  family: BundlePluginFamily
): Promise<boolean> {
  switch (family) {
    case 'scene': {
      const { sceneViewRegistry } = await import('./sceneViewPlugin');
      sceneViewRegistry.unregister(sceneViewIdsByPluginId.get(pluginId) ?? pluginId);
      sceneViewIdsByPluginId.delete(pluginId);
      pluginCatalog.unregister(pluginId);
      return true;
    }
    case 'control-center': {
      const { controlCenterRegistry } = await import('./controlCenterPlugin');
      controlCenterRegistry.unregister(controlCenterIdsByPluginId.get(pluginId) ?? pluginId);
      controlCenterIdsByPluginId.delete(pluginId);
      pluginCatalog.unregister(pluginId);
      return true;
    }
    case 'ui':
    case 'tool':
      pluginCatalog.unregister(pluginId);
      return true;
    default:
      console.warn(`[BundleRegistrar] Cannot unregister plugin family: ${family}`);
      return false;
  }
}
