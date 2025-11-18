/**
 * Plugin Catalog
 *
 * Provides a unified metadata layer over all plugin systems in PixSim7.
 * This is a thin, read-only abstraction that does NOT replace individual registries.
 *
 * Design principles:
 * - Non-breaking: existing registries remain authoritative
 * - Incremental: easy to add new plugin kinds
 * - Type-safe: TypeScript unions and generics
 * - Composable: small mapping functions per plugin type
 *
 * Usage:
 * ```typescript
 * import { listAllPlugins, listHelperPlugins } from '@/lib/plugins/catalog';
 *
 * // Get all plugins across all systems
 * const allPlugins = listAllPlugins();
 *
 * // Get plugins of a specific kind
 * const helpers = listHelperPlugins();
 * const interactions = listInteractionPlugins();
 * ```
 */

import { sessionHelperRegistry, interactionRegistry, nodeTypeRegistry } from '../registries';
import { galleryToolRegistry } from '../gallery/types';
import { pluginManager } from './PluginManager';
import { generationUIPluginRegistry } from '../providers/generationPlugins';
import { isPluginEnabled } from '../../stores/pluginConfigStore';

/**
 * Plugin kind discriminator
 * Add new values here as new plugin systems are added
 */
export type PluginKind =
  | 'session-helper'
  | 'interaction'
  | 'node-type'
  | 'gallery-tool'
  | 'ui-plugin'
  | 'generation-ui';

/**
 * Registry source identifier
 * Tracks which registry this plugin came from
 */
export type PluginRegistrySource =
  | 'sessionHelperRegistry'
  | 'interactionRegistry'
  | 'nodeTypeRegistry'
  | 'galleryToolRegistry'
  | 'uiPluginManager'
  | 'generationUIPluginRegistry';

/**
 * Plugin capability hints
 * Boolean flags that describe what a plugin can do
 */
export interface PluginCapabilities {
  /** Modifies game session state */
  modifiesSession?: boolean;

  /** Modifies player inventory */
  modifiesInventory?: boolean;

  /** Affects NPC relationships */
  modifiesRelationships?: boolean;

  /** Adds UI overlays to the game */
  addsUIOverlay?: boolean;

  /** Adds new node types to the scene/arc/world builders */
  addsNodeTypes?: boolean;

  /** Adds gallery tools */
  addsGalleryTools?: boolean;

  /** Adds custom generation UI for a specific provider */
  providerId?: string;

  /** Triggers game events */
  triggersEvents?: boolean;

  /** Has risk/success mechanics */
  hasRisk?: boolean;

  /** Requires items to use */
  requiresItems?: boolean;

  /** Consumes items when used */
  consumesItems?: boolean;

  /** Can be detected (stealth mechanics) */
  canBeDetected?: boolean;

  /** Opens dialogue interface */
  opensDialogue?: boolean;
}

/**
 * Unified plugin metadata
 * The canonical shape for "a plugin" at the catalog level
 */
export interface PluginMeta {
  /** Plugin kind (discriminator) */
  kind: PluginKind;

  /** Unique plugin ID */
  id: string;

  /** Display name */
  label: string;

  /** Short description */
  description?: string;

  /** Category for grouping/filtering */
  category?: string;

  /** Tags for search/filtering */
  tags?: string[];

  /** Version string (semver recommended) */
  version?: string;

  /** Icon (emoji or icon name) */
  icon?: string;

  /** Source registry information */
  source: {
    registry: PluginRegistrySource;
    modulePath?: string; // Optional: only if easy to expose
  };

  /** Capability hints */
  capabilities?: PluginCapabilities;

  /** Marked as experimental/beta */
  experimental?: boolean;

  /** Whether this plugin can be configured */
  configurable?: boolean;

  /** Whether this plugin is currently enabled */
  enabled?: boolean;

  /** Author (for UI plugins) */
  author?: string;

  /** Capability references - what features this plugin provides or consumes */
  providesFeatures?: string[];      // Feature IDs this plugin adds (e.g., ["debug-overlay"])
  consumesFeatures?: string[];      // Feature IDs this plugin depends on (e.g., ["assets", "workspace"])
  consumesActions?: string[];       // Action IDs this plugin uses (e.g., ["workspace.open-panel"])
  consumesState?: string[];         // State IDs this plugin reads (e.g., ["workspace.panels"])

  /** Plugin scope (for node types) */
  scope?: 'scene' | 'arc' | 'world' | 'custom';

  /** UI mode (for interactions) */
  uiMode?: 'dialogue' | 'notification' | 'silent' | 'custom';
}

/**
 * Map session helper to PluginMeta
 */
function mapHelperToMeta(helper: any): PluginMeta {
  // Extract capabilities from category and helper metadata
  const capabilities: PluginCapabilities = {
    modifiesSession: true, // All helpers modify session in some way
  };

  // Infer capabilities from category
  if (helper.category === 'inventory') {
    capabilities.modifiesInventory = true;
  } else if (helper.category === 'relationship') {
    capabilities.modifiesRelationships = true;
  } else if (helper.category === 'event') {
    capabilities.triggersEvents = true;
  }

  return {
    kind: 'session-helper',
    id: helper.id || helper.name,
    label: helper.name,
    description: helper.description,
    category: helper.category,
    tags: helper.tags,
    version: helper.version,
    experimental: helper.experimental,
    source: {
      registry: 'sessionHelperRegistry',
    },
    capabilities,
    configurable: !!helper.configSchema || (helper.schema && Object.keys(helper.schema).length > 0),
    enabled: isPluginEnabled(helper.id || helper.name, true),
  };
}

/**
 * Map interaction plugin to PluginMeta
 */
function mapInteractionToMeta(interaction: any): PluginMeta {
  // Map interaction capabilities to catalog capabilities
  const capabilities: PluginCapabilities = {
    modifiesSession: true, // Interactions modify session by definition
    opensDialogue: interaction.capabilities?.opensDialogue || interaction.uiMode === 'dialogue',
    modifiesInventory: interaction.capabilities?.modifiesInventory,
    modifiesRelationships: interaction.capabilities?.affectsRelationship,
    triggersEvents: interaction.capabilities?.triggersEvents,
    hasRisk: interaction.capabilities?.hasRisk,
    requiresItems: interaction.capabilities?.requiresItems,
    consumesItems: interaction.capabilities?.consumesItems,
    canBeDetected: interaction.capabilities?.canBeDetected,
  };

  return {
    kind: 'interaction',
    id: interaction.id,
    label: interaction.name,
    description: interaction.description,
    category: interaction.category,
    tags: interaction.tags,
    version: interaction.version,
    icon: interaction.icon,
    experimental: interaction.experimental,
    uiMode: interaction.uiMode,
    source: {
      registry: 'interactionRegistry',
    },
    capabilities,
    configurable: !!(interaction.configFields && interaction.configFields.length > 0),
    enabled: isPluginEnabled(interaction.id, true),
  };
}

/**
 * Map node type to PluginMeta
 * Only includes user-creatable or plugin-like node types to avoid flooding catalog
 */
function mapNodeTypeToMeta(nodeType: any): PluginMeta | null {
  // Filter: only include user-creatable or custom scope nodes
  // This avoids flooding the catalog with built-in node types
  if (nodeType.userCreatable === false && nodeType.scope !== 'custom') {
    return null;
  }

  return {
    kind: 'node-type',
    id: nodeType.id,
    label: nodeType.name,
    description: nodeType.description,
    category: nodeType.category,
    icon: nodeType.icon,
    scope: nodeType.scope,
    experimental: false, // Node types don't have experimental flag
    source: {
      registry: 'nodeTypeRegistry',
      modulePath: nodeType.editorComponent || nodeType.rendererComponent,
    },
    capabilities: {
      addsNodeTypes: true,
    },
    configurable: false, // Node types aren't configurable in the same way
    enabled: true, // Node types are always enabled once registered
  };
}

/**
 * Map gallery tool to PluginMeta
 */
function mapGalleryToolToMeta(tool: any): PluginMeta {
  return {
    kind: 'gallery-tool',
    id: tool.id,
    label: tool.name,
    description: tool.description,
    category: tool.category, // visualization | automation | analysis | utility
    icon: tool.icon,
    experimental: false, // Gallery tools don't have experimental flag
    source: {
      registry: 'galleryToolRegistry',
    },
    capabilities: {
      addsGalleryTools: true,
    },
    configurable: false, // Gallery tools aren't configurable
    enabled: true, // Gallery tools use whenVisible instead of enabled state
  };
}

/**
 * Map UI plugin to PluginMeta
 */
function mapUIPluginToMeta(pluginEntry: any): PluginMeta {
  const manifest = pluginEntry.manifest;

  // Map permissions to capabilities
  const capabilities: PluginCapabilities = {
    addsUIOverlay: manifest.permissions?.includes('ui:overlay'),
    modifiesSession: false, // UI plugins are read-only by design
  };

  // Infer consumed features/actions/state from permissions and plugin type
  const consumesFeatures: string[] = [];
  const consumesActions: string[] = [];
  const consumesState: string[] = [];

  // UI overlay plugins typically consume core features
  if (manifest.permissions?.includes('ui:overlay')) {
    // Most UI plugins need workspace features
    consumesFeatures.push('workspace');
  }

  // Session read access means they might use session-related actions/state
  if (manifest.permissions?.includes('read:session')) {
    consumesState.push('generation.active');
  }

  // Control center plugins specifically
  if (manifest.controlCenter) {
    // Control center plugins consume multiple features
    consumesFeatures.push('assets', 'workspace', 'generation');
    consumesActions.push('workspace.open-panel', 'generation.quick-generate');
    consumesState.push('workspace.panels');
  }

  return {
    kind: 'ui-plugin',
    id: manifest.id,
    label: manifest.name,
    description: manifest.description,
    category: manifest.type, // ui-overlay | theme | tool | enhancement
    version: manifest.version,
    icon: manifest.icon,
    author: manifest.author,
    experimental: false,
    source: {
      registry: 'uiPluginManager',
    },
    capabilities,
    configurable: true, // UI plugins have settings
    enabled: pluginEntry.state === 'enabled',
    // Capability references
    consumesFeatures: consumesFeatures.length > 0 ? consumesFeatures : undefined,
    consumesActions: consumesActions.length > 0 ? consumesActions : undefined,
    consumesState: consumesState.length > 0 ? consumesState : undefined,
  };
}

/**
 * Map generation UI plugin to PluginMeta
 */
function mapGenerationUIToMeta(plugin: any): PluginMeta {
  return {
    kind: 'generation-ui',
    id: plugin.id,
    label: plugin.metadata?.name || plugin.id,
    description: plugin.metadata?.description,
    category: 'generation', // All generation plugins are in 'generation' category
    version: plugin.metadata?.version,
    tags: plugin.operations, // Use operations as tags
    experimental: false,
    source: {
      registry: 'generationUIPluginRegistry',
    },
    capabilities: {
      providerId: plugin.providerId,
    },
    configurable: false, // Generation UI plugins aren't user-configurable
    enabled: true, // Always enabled once registered
  };
}

/**
 * List all session helper plugins
 */
export function listHelperPlugins(): PluginMeta[] {
  const helpers = sessionHelperRegistry.getAll();
  return helpers.map(mapHelperToMeta);
}

/**
 * List all interaction plugins
 */
export function listInteractionPlugins(): PluginMeta[] {
  const interactions = interactionRegistry.getAll();
  return interactions.map(mapInteractionToMeta);
}

/**
 * List all node type plugins
 * (filtered to user-creatable and custom scope only)
 */
export function listNodeTypePlugins(): PluginMeta[] {
  const nodeTypes = nodeTypeRegistry.getAll();
  return nodeTypes
    .map(mapNodeTypeToMeta)
    .filter((meta): meta is PluginMeta => meta !== null);
}

/**
 * List all gallery tool plugins
 */
export function listGalleryToolPlugins(): PluginMeta[] {
  const tools = galleryToolRegistry.getAll();
  return tools.map(mapGalleryToolToMeta);
}

/**
 * List all UI plugins
 */
export function listUIPlugins(): PluginMeta[] {
  const plugins = pluginManager.getPlugins();
  return plugins.map(mapUIPluginToMeta);
}

/**
 * List all generation UI plugins
 */
export function listGenerationUIPlugins(): PluginMeta[] {
  const pluginIds = generationUIPluginRegistry.getPluginIds();
  return pluginIds
    .map((id) => generationUIPluginRegistry.getPlugin(id))
    .filter((plugin): plugin is any => plugin !== null)
    .map(mapGenerationUIToMeta);
}

/**
 * List all plugins across all registries
 * Returns a unified array of PluginMeta
 */
export function listAllPlugins(): PluginMeta[] {
  return [
    ...listHelperPlugins(),
    ...listInteractionPlugins(),
    ...listNodeTypePlugins(),
    ...listGalleryToolPlugins(),
    ...listUIPlugins(),
    ...listGenerationUIPlugins(),
  ];
}

/**
 * Get plugin count by kind
 */
export function getPluginCounts(): Record<PluginKind, number> {
  return {
    'session-helper': listHelperPlugins().length,
    'interaction': listInteractionPlugins().length,
    'node-type': listNodeTypePlugins().length,
    'gallery-tool': listGalleryToolPlugins().length,
    'ui-plugin': listUIPlugins().length,
    'generation-ui': listGenerationUIPlugins().length,
  };
}

/**
 * Filter plugins by search query
 * Searches in: label, description, tags, category, id
 */
export function searchPlugins(query: string, plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  if (!query || query.trim().length === 0) {
    return plugins;
  }

  const lowerQuery = query.toLowerCase().trim();

  return plugins.filter((plugin) => {
    // Search in label
    if (plugin.label.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in description
    if (plugin.description?.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in ID
    if (plugin.id.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in category
    if (plugin.category?.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in tags
    if (plugin.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
      return true;
    }

    // Search in author
    if (plugin.author?.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    return false;
  });
}

/**
 * Filter plugins by kind
 */
export function filterByKind(kind: PluginKind | PluginKind[], plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  const kinds = Array.isArray(kind) ? kind : [kind];
  return plugins.filter((plugin) => kinds.includes(plugin.kind));
}

/**
 * Filter plugins by category
 */
export function filterByCategory(category: string | string[], plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  const categories = Array.isArray(category) ? category : [category];
  return plugins.filter((plugin) => plugin.category && categories.includes(plugin.category));
}

/**
 * Filter plugins by enabled state
 */
export function filterByEnabled(enabled: boolean, plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  return plugins.filter((plugin) => plugin.enabled === enabled);
}

/**
 * Get unique categories across all plugins
 */
export function getUniqueCategories(plugins: PluginMeta[] = listAllPlugins()): string[] {
  const categories = new Set<string>();
  plugins.forEach((plugin) => {
    if (plugin.category) {
      categories.add(plugin.category);
    }
  });
  return Array.from(categories).sort();
}

/**
 * Get unique tags across all plugins
 */
export function getUniqueTags(plugins: PluginMeta[] = listAllPlugins()): string[] {
  const tags = new Set<string>();
  plugins.forEach((plugin) => {
    plugin.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

/**
 * Get plugin by ID and kind
 * Useful when you know both the ID and which registry to check
 */
export function getPluginById(id: string, kind?: PluginKind): PluginMeta | undefined {
  const plugins = kind ? filterByKind(kind) : listAllPlugins();
  return plugins.find((plugin) => plugin.id === id);
}

/**
 * Group plugins by kind
 */
export function groupByKind(plugins: PluginMeta[] = listAllPlugins()): Record<PluginKind, PluginMeta[]> {
  const groups: Record<PluginKind, PluginMeta[]> = {
    'session-helper': [],
    'interaction': [],
    'node-type': [],
    'gallery-tool': [],
    'ui-plugin': [],
    'generation-ui': [],
  };

  plugins.forEach((plugin) => {
    groups[plugin.kind].push(plugin);
  });

  return groups;
}

/**
 * Group plugins by category
 */
export function groupByCategory(plugins: PluginMeta[] = listAllPlugins()): Record<string, PluginMeta[]> {
  const groups: Record<string, PluginMeta[]> = {};

  plugins.forEach((plugin) => {
    const category = plugin.category || 'uncategorized';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(plugin);
  });

  return groups;
}
