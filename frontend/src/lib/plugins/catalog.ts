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
import { worldToolRegistry } from '../worldTools/types';
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
  | 'world-tool'
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
  | 'worldToolRegistry'
  | 'uiPluginManager'
  | 'generationUIPluginRegistry';

/**
 * Plugin origin discriminator
 * Tracks where the plugin was loaded from
 */
export type PluginOrigin =
  | 'builtin'        // Built-in plugins shipped with the application
  | 'plugins-dir'    // Loaded from plugins directory
  | 'ui-bundle'      // User-installed UI plugin bundle
  | 'dev';           // Development/local plugin

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

  /** Plugin origin (where it was loaded from) */
  origin: PluginOrigin;

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

  /** Enhanced metadata fields */

  /** Timestamp when plugin was loaded (milliseconds since epoch) */
  loadedAt?: number;

  /** Mark plugin as deprecated (will be removed in future version) */
  deprecated?: boolean;

  /** Deprecation message explaining what to use instead */
  deprecationMessage?: string;

  /** ID of plugin this replaces (for migration/upgrade paths) */
  replaces?: string;

  /** Homepage/documentation URL */
  homepage?: string;

  /** Source code repository URL */
  repository?: string;

  /** Plugin dependencies (IDs of required plugins) */
  dependencies?: string[];

  /** Optional plugin dependencies (enhance functionality but not required) */
  optionalDependencies?: string[];
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
    origin: 'builtin', // Session helpers are currently all built-in
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
    origin: 'builtin', // Interaction plugins are currently all built-in
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
    origin: nodeType.scope === 'custom' ? 'plugins-dir' : 'builtin', // Custom scope indicates user plugin
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
    origin: 'builtin', // Gallery tools are currently all built-in
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
    origin: 'ui-bundle', // UI plugins are user-installed bundles
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
    origin: 'builtin', // Generation UI plugins are currently all built-in
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
 * Map world tool to PluginMeta
 */
function mapWorldToolToMeta(tool: any): PluginMeta {
  return {
    kind: 'world-tool',
    origin: 'builtin', // World tools are currently all built-in
    id: tool.id,
    label: tool.name,
    description: tool.description,
    category: tool.category, // character | world | quest | inventory | debug | utility
    icon: tool.icon,
    experimental: false, // World tools don't have experimental flag
    source: {
      registry: 'worldToolRegistry',
    },
    capabilities: {
      addsUIOverlay: true, // World tools add UI to the game
    },
    configurable: false, // World tools aren't configurable
    enabled: true, // World tools use whenVisible instead of enabled state
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
 * List all world tool plugins
 */
export function listWorldToolPlugins(): PluginMeta[] {
  const tools = worldToolRegistry.getAll();
  return tools.map(mapWorldToolToMeta);
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
    ...listWorldToolPlugins(),
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
    'world-tool': listWorldToolPlugins().length,
    'ui-plugin': listUIPlugins().length,
    'generation-ui': listGenerationUIPlugins().length,
  };
}

/**
 * Get plugin count by origin
 */
export function getOriginCounts(plugins: PluginMeta[] = listAllPlugins()): Record<PluginOrigin, number> {
  const counts: Record<PluginOrigin, number> = {
    'builtin': 0,
    'plugins-dir': 0,
    'ui-bundle': 0,
    'dev': 0,
  };

  plugins.forEach((plugin) => {
    counts[plugin.origin]++;
  });

  return counts;
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
 * Filter plugins by origin
 */
export function filterByOrigin(origin: PluginOrigin | PluginOrigin[], plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  const origins = Array.isArray(origin) ? origin : [origin];
  return plugins.filter((plugin) => origins.includes(plugin.origin));
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
 * Filter plugins by capability
 * Returns plugins that have the specified capability set to true
 */
export function filterByCapability(
  capability: keyof PluginCapabilities,
  plugins: PluginMeta[] = listAllPlugins()
): PluginMeta[] {
  return plugins.filter((plugin) => {
    if (!plugin.capabilities) return false;
    return plugin.capabilities[capability] === true;
  });
}

/**
 * Get plugins that modify session state
 */
export function getSessionModifyingPlugins(plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  return filterByCapability('modifiesSession', plugins);
}

/**
 * Get plugins that modify inventory
 */
export function getInventoryModifyingPlugins(plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  return filterByCapability('modifiesInventory', plugins);
}

/**
 * Get plugins that add UI overlays
 */
export function getUIOverlayPlugins(plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  return filterByCapability('addsUIOverlay', plugins);
}

/**
 * Get plugins that have risk mechanics
 */
export function getRiskyPlugins(plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  return filterByCapability('hasRisk', plugins);
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

// =====================================================
// Kind-Specific Type-Safe Getters
// =====================================================

/**
 * Get a session helper plugin by ID
 * Returns typed plugin metadata for session helpers
 */
export function getHelperPlugin(id: string): PluginMeta | undefined {
  const helpers = listHelperPlugins();
  return helpers.find((p) => p.id === id);
}

/**
 * Get an interaction plugin by ID
 */
export function getInteractionPlugin(id: string): PluginMeta | undefined {
  const interactions = listInteractionPlugins();
  return interactions.find((p) => p.id === id);
}

/**
 * Get a node type plugin by ID
 */
export function getNodeTypePlugin(id: string): PluginMeta | undefined {
  const nodeTypes = listNodeTypePlugins();
  return nodeTypes.find((p) => p.id === id);
}

/**
 * Get a gallery tool plugin by ID
 */
export function getGalleryToolPlugin(id: string): PluginMeta | undefined {
  const tools = listGalleryToolPlugins();
  return tools.find((p) => p.id === id);
}

/**
 * Get a world tool plugin by ID
 */
export function getWorldToolPlugin(id: string): PluginMeta | undefined {
  const tools = listWorldToolPlugins();
  return tools.find((p) => p.id === id);
}

/**
 * Get a UI plugin by ID
 */
export function getUIPlugin(id: string): PluginMeta | undefined {
  const plugins = listUIPlugins();
  return plugins.find((p) => p.id === id);
}

/**
 * Get a generation UI plugin by ID
 */
export function getGenerationUIPlugin(id: string): PluginMeta | undefined {
  const plugins = listGenerationUIPlugins();
  return plugins.find((p) => p.id === id);
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
    'world-tool': [],
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

/**
 * Group plugins by origin
 */
export function groupByOrigin(plugins: PluginMeta[] = listAllPlugins()): Record<PluginOrigin, PluginMeta[]> {
  const groups: Record<PluginOrigin, PluginMeta[]> = {
    'builtin': [],
    'plugins-dir': [],
    'ui-bundle': [],
    'dev': [],
  };

  plugins.forEach((plugin) => {
    groups[plugin.origin].push(plugin);
  });

  return groups;
}

// =====================================================
// Badge & Display Utilities
// =====================================================

/**
 * Get color for origin badge
 * Returns a semantic color that can be used in UI components
 */
export function getOriginBadgeColor(origin: PluginOrigin): string {
  switch (origin) {
    case 'builtin':
      return 'blue';
    case 'plugins-dir':
      return 'green';
    case 'ui-bundle':
      return 'purple';
    case 'dev':
      return 'orange';
    default:
      return 'gray';
  }
}

/**
 * Get display label for origin
 */
export function getOriginLabel(origin: PluginOrigin): string {
  switch (origin) {
    case 'builtin':
      return 'Built-in';
    case 'plugins-dir':
      return 'Plugin Directory';
    case 'ui-bundle':
      return 'UI Bundle';
    case 'dev':
      return 'Development';
    default:
      return 'Unknown';
  }
}

/**
 * Get display label for kind
 */
export function getKindLabel(kind: PluginKind): string {
  switch (kind) {
    case 'session-helper':
      return 'Session Helper';
    case 'interaction':
      return 'Interaction';
    case 'node-type':
      return 'Node Type';
    case 'gallery-tool':
      return 'Gallery Tool';
    case 'world-tool':
      return 'World Tool';
    case 'ui-plugin':
      return 'UI Plugin';
    case 'generation-ui':
      return 'Generation UI';
    default:
      return 'Unknown';
  }
}

/**
 * Check if a plugin can be uninstalled based on origin
 */
export function canUninstallPlugin(plugin: PluginMeta): boolean {
  // Only UI bundles can be uninstalled
  return plugin.origin === 'ui-bundle';
}

/**
 * Check if a plugin can be disabled based on origin
 */
export function canDisablePlugin(plugin: PluginMeta): boolean {
  // Plugins-dir and UI bundles can be disabled
  return plugin.origin === 'plugins-dir' || plugin.origin === 'ui-bundle';
}

// =====================================================
// Consistency Check & Health Utilities
// =====================================================

/**
 * Get plugins with missing metadata
 * Helps identify plugins that need better documentation
 */
export function getMissingMetadata(plugins: PluginMeta[] = listAllPlugins()): {
  missingDescription: PluginMeta[];
  missingIcon: PluginMeta[];
  missingCategory: PluginMeta[];
  missingVersion: PluginMeta[];
} {
  return {
    missingDescription: plugins.filter((p) => !p.description),
    missingIcon: plugins.filter((p) => !p.icon),
    missingCategory: plugins.filter((p) => !p.category),
    missingVersion: plugins.filter((p) => !p.version),
  };
}

/**
 * Get deprecated plugins
 */
export function getDeprecatedPlugins(plugins: PluginMeta[] = listAllPlugins()): PluginMeta[] {
  return plugins.filter((p) => p.deprecated);
}

/**
 * Find plugins with missing dependencies
 * Returns plugins that declare dependencies that don't exist in the catalog
 */
export function getMissingDependencies(plugins: PluginMeta[] = listAllPlugins()): Array<{
  plugin: PluginMeta;
  missingDeps: string[];
}> {
  const allPluginIds = new Set(plugins.map((p) => p.id));
  const results: Array<{ plugin: PluginMeta; missingDeps: string[] }> = [];

  plugins.forEach((plugin) => {
    if (!plugin.dependencies || plugin.dependencies.length === 0) {
      return;
    }

    const missingDeps = plugin.dependencies.filter((depId) => !allPluginIds.has(depId));

    if (missingDeps.length > 0) {
      results.push({ plugin, missingDeps });
    }
  });

  return results;
}

/**
 * Get plugin health summary
 * Provides an overview of catalog quality and potential issues
 */
export function getPluginHealth(plugins: PluginMeta[] = listAllPlugins()): {
  totalPlugins: number;
  byKind: Record<PluginKind, number>;
  byOrigin: Record<PluginOrigin, number>;
  enabled: number;
  disabled: number;
  deprecated: number;
  experimental: number;
  missingMetadata: {
    description: number;
    icon: number;
    category: number;
    version: number;
  };
  dependencyIssues: number;
} {
  const missing = getMissingMetadata(plugins);
  const depIssues = getMissingDependencies(plugins);

  return {
    totalPlugins: plugins.length,
    byKind: getPluginCounts(),
    byOrigin: getOriginCounts(plugins),
    enabled: plugins.filter((p) => p.enabled).length,
    disabled: plugins.filter((p) => p.enabled === false).length,
    deprecated: getDeprecatedPlugins(plugins).length,
    experimental: plugins.filter((p) => p.experimental).length,
    missingMetadata: {
      description: missing.missingDescription.length,
      icon: missing.missingIcon.length,
      category: missing.missingCategory.length,
      version: missing.missingVersion.length,
    },
    dependencyIssues: depIssues.length,
  };
}

/**
 * Print plugin health report to console
 * Useful for debugging and development
 */
export function printPluginHealth(): void {
  const health = getPluginHealth();

  console.group('📊 Plugin Catalog Health Report');

  console.log(`Total Plugins: ${health.totalPlugins}`);

  console.group('By Kind:');
  Object.entries(health.byKind).forEach(([kind, count]) => {
    if (count > 0) {
      console.log(`  ${kind}: ${count}`);
    }
  });
  console.groupEnd();

  console.group('By Origin:');
  Object.entries(health.byOrigin).forEach(([origin, count]) => {
    if (count > 0) {
      console.log(`  ${origin}: ${count}`);
    }
  });
  console.groupEnd();

  console.log(`Enabled: ${health.enabled}`);
  console.log(`Disabled: ${health.disabled}`);
  console.log(`Deprecated: ${health.deprecated}`);
  console.log(`Experimental: ${health.experimental}`);

  const totalMissing =
    health.missingMetadata.description +
    health.missingMetadata.icon +
    health.missingMetadata.category +
    health.missingMetadata.version;

  if (totalMissing > 0) {
    console.group('⚠️ Missing Metadata:');
    if (health.missingMetadata.description > 0) {
      console.warn(`  ${health.missingMetadata.description} plugins missing description`);
    }
    if (health.missingMetadata.icon > 0) {
      console.warn(`  ${health.missingMetadata.icon} plugins missing icon`);
    }
    if (health.missingMetadata.category > 0) {
      console.warn(`  ${health.missingMetadata.category} plugins missing category`);
    }
    if (health.missingMetadata.version > 0) {
      console.warn(`  ${health.missingMetadata.version} plugins missing version`);
    }
    console.groupEnd();
  }

  if (health.dependencyIssues > 0) {
    console.warn(`⚠️ ${health.dependencyIssues} plugins have missing dependencies`);
    const issues = getMissingDependencies();
    issues.forEach(({ plugin, missingDeps }) => {
      console.warn(`  ${plugin.id} is missing: ${missingDeps.join(', ')}`);
    });
  }

  console.groupEnd();
}
