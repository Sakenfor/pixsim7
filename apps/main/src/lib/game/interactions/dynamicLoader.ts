/**
 * Dynamic Plugin Interaction Loader
 *
 * Fetches plugin manifests from the backend and dynamically registers
 * interactions using createGenericInteraction.
 */

import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
  FormField,
  FormFieldType,
  InteractionUIMode,
  InteractionCapabilities,
} from './types';
import { interactionRegistry } from './types';
import {
  registerInteraction,
  ensureBackendPluginCatalogEntry,
  type BackendPluginEntryLike,
} from '@lib/plugins/registryBridge';
import type { PluginOrigin } from '@lib/plugins/pluginSystem';

// =============================================================================
// Types (aligned with packages/plugins/stealth/shared/types.ts)
// =============================================================================

/**
 * JSON Schema property definition
 */
interface JsonSchemaProperty {
  type: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: (string | number)[];
  items?: JsonSchemaProperty;
}

/**
 * JSON Schema object
 */
interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Interaction capabilities from manifest
 */
interface ManifestCapabilities {
  opensDialogue?: boolean;
  modifiesInventory?: boolean;
  affectsRelationship?: boolean;
  triggersEvents?: boolean;
  hasRisk?: boolean;
  requiresItems?: boolean;
  consumesItems?: boolean;
  canBeDetected?: boolean;
}

/**
 * Frontend interaction manifest from backend
 */
interface FrontendInteractionManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  version: string;
  tags?: string[];
  apiEndpoint: string;
  configSchema: JsonSchema;
  defaultConfig: Record<string, unknown>;
  uiMode?: string;
  capabilities?: ManifestCapabilities;
}

/**
 * Frontend plugin manifest from backend
 */
interface FrontendPluginManifest {
  pluginId: string;
  pluginName: string;
  version: string;
  description?: string;
  icon?: string;
  tags?: string[];
  interactions?: FrontendInteractionManifest[];
}

/**
 * Response from /admin/plugins/frontend/all
 */
interface AllFrontendManifestsResponse {
  manifests: Array<{
    pluginId: string;
    enabled: boolean;
    kind?: string;
    required?: boolean;
    origin?: PluginOrigin;
    author?: string;
    description?: string;
    version?: string;
    tags?: string[];
    permissions?: string[];
    manifest: FrontendPluginManifest;
  }>;
  total: number;
}

// =============================================================================
// JSON Schema to ConfigFields Converter
// =============================================================================

/**
 * Convert a camelCase key to a human-readable label
 */
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Map JSON Schema type to FormField type
 */
function mapSchemaTypeToFieldType(
  schemaType: string,
  hasEnum?: (string | number)[]
): FormFieldType {
  if (hasEnum) return 'select';

  switch (schemaType) {
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'tags';
    case 'string':
    default:
      return 'text';
  }
}

/**
 * Convert JSON Schema to FormField array for interaction config UI
 *
 * Handles:
 * - number/integer with min/max constraints
 * - string with enum options
 * - boolean
 * - array (as tags)
 *
 * @param schema - JSON Schema object
 * @returns Array of FormField definitions
 */
export function jsonSchemaToConfigFields(schema: JsonSchema): FormField[] {
  const fields: FormField[] = [];

  if (!schema.properties) {
    return fields;
  }

  for (const [key, prop] of Object.entries(schema.properties)) {
    const field: FormField = {
      key,
      label: formatLabel(key),
      type: mapSchemaTypeToFieldType(prop.type, prop.enum),
      description: prop.description,
    };

    // Add number constraints
    if (prop.type === 'number' || prop.type === 'integer') {
      if (prop.minimum !== undefined) field.min = prop.minimum;
      if (prop.maximum !== undefined) field.max = prop.maximum;
      // Default step for 0-1 ranges
      if (prop.minimum === 0 && prop.maximum === 1) {
        field.step = 0.1;
      }
    }

    // Add enum options
    if (prop.enum) {
      field.options = prop.enum.map((v) => ({
        value: v,
        label: String(v),
      }));
    }

    // Handle array types as tags
    if (prop.type === 'array') {
      field.type = 'tags';
      field.placeholder = `e.g., ${key}:example_value`;
    }

    fields.push(field);
  }

  return fields;
}

// =============================================================================
// Generic Interaction Factory
// =============================================================================

/**
 * Create a generic interaction plugin from a manifest
 *
 * This factory creates an InteractionPlugin that:
 * 1. Uses the manifest's configSchema for form generation
 * 2. Calls the manifest's apiEndpoint to execute
 * 3. Uses the manifest's capabilities for UI hints
 *
 * @param manifest - Frontend interaction manifest from backend
 * @returns InteractionPlugin implementation
 */
export function createGenericInteraction<TConfig extends BaseInteractionConfig = BaseInteractionConfig>(
  manifest: FrontendInteractionManifest
): InteractionPlugin<TConfig> {
  const configFields = jsonSchemaToConfigFields(manifest.configSchema);

  // Build default config with enabled flag
  const defaultConfig = {
    enabled: true,
    ...manifest.defaultConfig,
  } as TConfig;

  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    category: manifest.category,
    version: manifest.version,
    tags: manifest.tags,

    uiMode: (manifest.uiMode as InteractionUIMode) || 'notification',
    capabilities: manifest.capabilities as InteractionCapabilities | undefined,

    defaultConfig,
    configFields,

    async execute(config: TConfig, context: InteractionContext): Promise<InteractionResult> {
      const npcId = context.state.assignment.npcId;
      const gameSession = context.state.gameSession;

      if (!npcId) {
        return { success: false, message: 'No NPC assigned to this slot' };
      }

      if (!gameSession) {
        context.onError('No game session active. Please start a scene first.');
        return { success: false, message: 'No active game session' };
      }

      try {
        // Build request payload from config
        // Convert camelCase config to snake_case for backend
        const requestPayload: Record<string, unknown> = {
          npc_id: npcId,
          slot_id: context.state.assignment.slot.id,
          world_id: context.state.worldId,
          session_id: gameSession.id,
        };

        // Map config fields to request payload (camelCase to snake_case)
        for (const [key, value] of Object.entries(config)) {
          if (key === 'enabled') continue; // Skip enabled flag
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          requestPayload[snakeKey] = value;
        }

        // Call the API endpoint
        const response = await fetch(`/api/v1${manifest.apiEndpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error || `Request failed with status ${response.status}`);
        }

        const result = await response.json();

        // Show result to user
        const message = result.message || (result.success ? 'Success!' : 'Failed');
        if (result.success) {
          context.onSuccess(message);
        } else {
          context.onError(message);
        }

        // Optionally update session
        if (context.onSessionUpdate && result.updated_flags) {
          const updatedSession = await context.api.getSession(gameSession.id);
          context.onSessionUpdate(updatedSession);
        }

        return {
          success: result.success ?? true,
          message,
          data: result,
        };
      } catch (e: unknown) {
        const errorMsg = String((e as Error)?.message ?? e);
        context.onError(errorMsg);
        return { success: false, message: errorMsg };
      }
    },

    // Generic validation based on schema constraints
    validate(config: TConfig): string | null {
      for (const field of configFields) {
        const value = (config as Record<string, unknown>)[field.key];

        if (field.type === 'number' && typeof value === 'number') {
          if (field.min !== undefined && value < field.min) {
            return `${field.label} must be at least ${field.min}`;
          }
          if (field.max !== undefined && value > field.max) {
            return `${field.label} must be at most ${field.max}`;
          }
        }
      }
      return null;
    },
  };
}

// =============================================================================
// Plugin Loader
// =============================================================================

/** Track which plugins have been loaded to avoid duplicates */
const loadedPlugins = new Set<string>();

/**
 * Load all plugin interactions from the backend
 *
 * Fetches frontend manifests from /admin/plugins/frontend/all
 * and registers each interaction with the interactionRegistry.
 *
 * This function is idempotent - calling it multiple times won't
 * register duplicate plugins.
 *
 * @returns Promise resolving to number of newly loaded interactions
 */
export async function loadPluginInteractions(): Promise<number> {
  try {
    const response = await fetch('/api/v1/admin/plugins/frontend/all');

    if (!response.ok) {
      console.warn('[dynamicLoader] Failed to fetch plugin manifests:', response.status);
      return 0;
    }

  const data: AllFrontendManifestsResponse = await response.json();

  let loadedCount = 0;

  for (const entry of data.manifests) {
    const { pluginId, enabled, manifest } = entry;
    if (!enabled) {
      console.debug(`[dynamicLoader] Skipping disabled plugin: ${pluginId}`);
      continue;
    }

      // Skip if already loaded
      if (loadedPlugins.has(pluginId)) {
        console.debug(`[dynamicLoader] Plugin already loaded: ${pluginId}`);
        continue;
      }

      ensureBackendPluginCatalogEntry(entry);

      const interactions = manifest.interactions ?? [];

      // Register each interaction from the manifest
      for (const interactionManifest of interactions) {
        // Check if already registered (by another source)
        if (interactionRegistry.has(interactionManifest.id)) {
          console.debug(
            `[dynamicLoader] Interaction already registered: ${interactionManifest.id}`
          );
          continue;
        }

        // Create and register the interaction
        const plugin = createGenericInteraction(interactionManifest);
        registerInteraction(plugin, { origin: 'plugin-dir' });
        loadedCount++;

        console.info(
          `[dynamicLoader] Registered interaction: ${interactionManifest.id} from ${pluginId}`
        );
      }

    loadedPlugins.add(pluginId);
  }

    console.info(`[dynamicLoader] Loaded ${loadedCount} new interactions from ${data.total} plugins`);
    return loadedCount;
  } catch (error) {
    console.error('[dynamicLoader] Error loading plugin interactions:', error);
    return 0;
  }
}

// ensureBackendPluginCatalogEntry and resolvePluginOrigin are now in registryBridge.ts

/**
 * Check if dynamic loading is supported
 *
 * Returns false if the backend endpoint is not available
 */
export async function isDynamicLoadingAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/admin/plugins/frontend/all', {
      method: 'HEAD',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Clear the loaded plugins cache (for testing)
 */
export function clearLoadedPluginsCache(): void {
  loadedPlugins.clear();
}
