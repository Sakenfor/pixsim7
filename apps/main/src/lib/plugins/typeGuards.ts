/**
 * Type Guards for Plugin Validation
 *
 * Provides runtime validation to ensure plugins match expected shapes
 * before accessing properties. This prevents runtime crashes from malformed plugins.
 */

import type {
  HelperDefinition,
  InteractionPlugin,
  BaseInteractionConfig,
  NodeTypeDefinition,
} from '../registries';
import type { GalleryToolPlugin } from '../gallery/types';
import type { WorldToolPlugin } from '@features/worldTools';
import type { GenerationUIPlugin } from '../providers/generationPlugins';
import type { PluginEntry, PluginManifest } from './types';

/**
 * Type guard for HelperDefinition
 */
export function isValidHelperDefinition(obj: unknown): obj is HelperDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const helper = obj as Partial<HelperDefinition>;

  // Must have either id or name
  if (!helper.id && !helper.name) return false;

  // Must have a function
  if (typeof helper.fn !== 'function') return false;

  // Validate category if present
  if (helper.category) {
    const validCategories = ['relationships', 'inventory', 'quests', 'arcs', 'events', 'custom'];
    if (!validCategories.includes(helper.category)) return false;
  }

  return true;
}

/**
 * Type guard for InteractionPlugin
 */
export function isValidInteractionPlugin(obj: unknown): obj is InteractionPlugin<BaseInteractionConfig> {
  if (!obj || typeof obj !== 'object') return false;
  const interaction = obj as Partial<InteractionPlugin<BaseInteractionConfig>>;

  // Required fields
  if (typeof interaction.id !== 'string') return false;
  if (typeof interaction.name !== 'string') return false;
  if (typeof interaction.description !== 'string') return false;

  // Must have execute function
  if (typeof interaction.execute !== 'function') return false;

  // Must have defaultConfig
  if (!interaction.defaultConfig || typeof interaction.defaultConfig !== 'object') return false;

  // Must have configFields array
  if (!Array.isArray(interaction.configFields)) return false;

  return true;
}

/**
 * Type guard for NodeTypeDefinition
 */
export function isValidNodeTypeDefinition(obj: unknown): obj is NodeTypeDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const nodeType = obj as Partial<NodeTypeDefinition>;

  // Required fields
  if (typeof nodeType.id !== 'string') return false;
  if (typeof nodeType.name !== 'string') return false;

  // Validate scope if present
  if (nodeType.scope) {
    const validScopes = ['scene', 'arc', 'world', 'custom'];
    if (!validScopes.includes(nodeType.scope)) return false;
  }

  return true;
}

/**
 * Type guard for GalleryToolPlugin
 */
export function isValidGalleryToolPlugin(obj: unknown): obj is GalleryToolPlugin {
  if (!obj || typeof obj !== 'object') return false;
  const tool = obj as Partial<GalleryToolPlugin>;

  // Required fields
  if (typeof tool.id !== 'string') return false;
  if (typeof tool.name !== 'string') return false;

  // Must have execute function
  if (typeof tool.execute !== 'function') return false;

  return true;
}

/**
 * Type guard for WorldToolPlugin
 */
export function isValidWorldToolPlugin(obj: unknown): obj is WorldToolPlugin {
  if (!obj || typeof obj !== 'object') return false;
  const tool = obj as Partial<WorldToolPlugin>;

  // Required fields
  if (typeof tool.id !== 'string') return false;
  if (typeof tool.name !== 'string') return false;

  // Must have execute function
  if (typeof tool.execute !== 'function') return false;

  return true;
}

/**
 * Type guard for GenerationUIPlugin
 */
export function isValidGenerationUIPlugin(obj: unknown): obj is GenerationUIPlugin {
  if (!obj || typeof obj !== 'object') return false;
  const plugin = obj as Partial<GenerationUIPlugin>;

  // Required fields
  if (typeof plugin.id !== 'string') return false;
  if (typeof plugin.providerId !== 'string') return false;

  // Must have operations array
  if (!Array.isArray(plugin.operations)) return false;

  // Must have component
  if (!plugin.component) return false;

  return true;
}

/**
 * Type guard for PluginManifest
 */
export function isValidPluginManifest(obj: unknown): obj is PluginManifest {
  if (!obj || typeof obj !== 'object') return false;
  const manifest = obj as Partial<PluginManifest>;

  // Required fields
  if (typeof manifest.id !== 'string') return false;
  if (typeof manifest.name !== 'string') return false;
  if (typeof manifest.version !== 'string') return false;
  if (typeof manifest.author !== 'string') return false;
  if (typeof manifest.description !== 'string') return false;

  // Validate ID format (lowercase alphanumeric with hyphens)
  if (!/^[a-z0-9-]+$/.test(manifest.id)) return false;

  // Validate type
  const validTypes = ['ui-overlay', 'theme', 'tool', 'enhancement'];
  if (!manifest.type || !validTypes.includes(manifest.type)) return false;

  // Must have permissions array
  if (!Array.isArray(manifest.permissions)) return false;

  // Must have main field
  if (typeof manifest.main !== 'string') return false;

  return true;
}

/**
 * Type guard for PluginEntry
 */
export function isValidPluginEntry(obj: unknown): obj is PluginEntry {
  if (!obj || typeof obj !== 'object') return false;
  const entry = obj as Partial<PluginEntry>;

  // Must have valid manifest
  if (!isValidPluginManifest(entry.manifest)) return false;

  // Must have valid state
  const validStates = ['disabled', 'enabled', 'error'];
  if (!entry.state || !validStates.includes(entry.state)) return false;

  // Must have installedAt timestamp
  if (typeof entry.installedAt !== 'number') return false;

  return true;
}

/**
 * Validates and throws descriptive error if invalid
 */
export function assertValidHelper(obj: unknown): asserts obj is HelperDefinition {
  if (!isValidHelperDefinition(obj)) {
    const helper = obj as Partial<HelperDefinition>;
    if (!helper?.id && !helper?.name) {
      throw new Error('Helper must have either id or name');
    }
    if (typeof helper?.fn !== 'function') {
      throw new Error(`Helper ${helper.id || helper.name} must have a function (fn)`);
    }
    throw new Error(`Invalid helper definition: ${helper.id || helper.name}`);
  }
}

/**
 * Validates and throws descriptive error if invalid
 */
export function assertValidInteraction(obj: unknown): asserts obj is InteractionPlugin<BaseInteractionConfig> {
  if (!isValidInteractionPlugin(obj)) {
    const interaction = obj as Partial<InteractionPlugin<BaseInteractionConfig>>;
    if (!interaction?.id) {
      throw new Error('Interaction must have an id');
    }
    if (!interaction?.name) {
      throw new Error(`Interaction ${interaction.id} must have a name`);
    }
    if (typeof interaction?.execute !== 'function') {
      throw new Error(`Interaction ${interaction.id} must have an execute function`);
    }
    throw new Error(`Invalid interaction plugin: ${interaction.id}`);
  }
}

/**
 * Validates and throws descriptive error if invalid
 */
export function assertValidManifest(obj: unknown): asserts obj is PluginManifest {
  if (!isValidPluginManifest(obj)) {
    const manifest = obj as Partial<PluginManifest>;
    if (!manifest?.id) {
      throw new Error('Plugin manifest must have an id');
    }
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error(`Plugin ID "${manifest.id}" must be lowercase alphanumeric with hyphens`);
    }
    if (!manifest?.name) {
      throw new Error(`Plugin ${manifest.id} must have a name`);
    }
    if (!manifest?.version) {
      throw new Error(`Plugin ${manifest.id} must have a version`);
    }
    throw new Error(`Invalid plugin manifest: ${manifest.id || 'unknown'}`);
  }
}
