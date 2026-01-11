import { registerPluginDefinition } from './pluginRuntime';
import type { PluginOrigin } from './pluginSystem';
import type { ExtendedPluginMetadata } from './pluginSystem';
import { pluginCatalog } from './pluginSystem';
import type { PluginRegistrationSource } from './registration';


/**
 * Backend plugin manifest shape for catalog entry creation
 */
export interface BackendPluginManifestLike {
  pluginId: string;
  pluginName: string;
  version: string;
  description?: string;
  icon?: string;
  tags?: string[];
}

/**
 * Backend plugin entry shape for catalog entry creation
 */
export interface BackendPluginEntryLike {
  pluginId: string;
  enabled: boolean;
  kind?: string;
  required?: boolean;
  origin?: PluginOrigin;
  author?: string;
  description?: string;
  version?: string;
  tags?: string[];
  manifest: BackendPluginManifestLike;
}

/**
 * Resolve origin from various formats to canonical PluginOrigin
 */
export function resolvePluginOrigin(origin?: string): PluginOrigin {
  switch (origin) {
    case 'builtin':
      return 'builtin';
    case 'plugin-dir':
    case 'plugins-dir': // Legacy
      return 'plugin-dir';
    case 'ui-bundle':
      return 'ui-bundle';
    case 'dev':
    case 'dev-project':
      return 'dev-project';
    default:
      return 'plugin-dir';
  }
}

/**
 * Ensure a backend feature plugin has a catalog entry
 *
 * This is used by dynamic loaders (interactions, tools) to register
 * parent plugin entries before registering individual features.
 *
 * @returns true if a new entry was created, false if already existed
 */
export async function ensureBackendPluginCatalogEntry(
  entry: BackendPluginEntryLike,
  source: PluginRegistrationSource = 'bundle'
): Promise<boolean> {
  if (pluginCatalog.get(entry.pluginId)) {
    return false;
  }

  const manifest = entry.manifest;
  const origin = resolvePluginOrigin(entry.origin);
  const activationState = entry.enabled ? 'active' : 'inactive';
  const canDisable = origin !== 'builtin' && !entry.required;

  // Map kind to pluginType/bundleFamily
  let pluginType: 'tool' | undefined;
  let bundleFamily: 'tool' | 'ui' | undefined;
  if (entry.kind === 'tools') {
    pluginType = 'tool';
    bundleFamily = 'tool';
  } else if (entry.kind === 'feature' || entry.kind === 'integration') {
    bundleFamily = 'ui';
  }

  const metadata: ExtendedPluginMetadata<'ui-plugin'> = {
    id: entry.pluginId,
    name: manifest.pluginName || entry.pluginId,
    family: 'ui-plugin',
    origin,
    activationState,
    canDisable,
    version: entry.version ?? manifest.version,
    description: entry.description ?? manifest.description,
    author: entry.author,
    tags: entry.tags ?? manifest.tags,
    category: entry.kind,
    pluginType,
    bundleFamily,
    icon: manifest.icon,
  };

  await registerPluginDefinition({
    id: entry.pluginId,
    family: 'ui-plugin',
    origin,
    source,
    plugin: { metadata },
    activationState,
    canDisable,
  });

  return true;
}
