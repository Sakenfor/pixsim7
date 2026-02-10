/**
 * Generic Interaction Factory
 *
 * Creates InteractionPlugin instances from frontend interaction manifests.
 * The factory is pure — it turns a manifest schema into a plugin object.
 * The execute implementation uses fetch() to call the manifest's API endpoint.
 */

import { toSnakeCaseDeep } from '@pixsim7/shared.helpers.core';

import type { JsonSchema } from './configSchema';
import { jsonSchemaToConfigFields } from './configSchema';
import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
  InteractionUIMode,
  InteractionCapabilities,
} from './registry';

// ============================================================================
// Manifest Types
// ============================================================================

export interface ManifestCapabilities {
  opensDialogue?: boolean;
  modifiesInventory?: boolean;
  affectsRelationship?: boolean;
  triggersEvents?: boolean;
  hasRisk?: boolean;
  requiresItems?: boolean;
  consumesItems?: boolean;
  canBeDetected?: boolean;
}

export interface FrontendInteractionManifest {
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

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a generic interaction plugin from a manifest.
 *
 * 1. Uses the manifest's configSchema for form generation
 * 2. Calls the manifest's apiEndpoint to execute
 * 3. Uses the manifest's capabilities for UI hints
 */
export function createGenericInteraction<
  TConfig extends BaseInteractionConfig = BaseInteractionConfig,
>(manifest: FrontendInteractionManifest): InteractionPlugin<TConfig> {
  const configFields = jsonSchemaToConfigFields(manifest.configSchema);

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
        const requestPayload: Record<string, unknown> = {
          npc_id: npcId,
          slot_id: context.state.assignment.slot.id,
          world_id: context.state.worldId,
          session_id: gameSession.id,
        };

        const configPayload = toSnakeCaseDeep(
          Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'enabled')),
        );
        Object.assign(requestPayload, configPayload);

        const response = await fetch(`/api/v1${manifest.apiEndpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error || `Request failed with status ${response.status}`);
        }

        const result = await response.json();

        const message = result.message || (result.success ? 'Success!' : 'Failed');
        if (result.success) {
          context.onSuccess(message);
        } else {
          context.onError(message);
        }

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
