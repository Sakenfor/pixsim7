/**
 * Interaction Executor
 *
 * Core orchestration logic for executing NPC slot interactions.
 * Uses callback pattern for app-specific concerns (preset tracking, UI dispatch).
 *
 * Moved from apps/main/src/lib/game/interactions/executor.ts
 */

import type { NpcSlotAssignment } from '../world/slotAssignment';
import type { InteractionContext, InteractionResult } from './registry';
import { InteractionRegistry, interactionRegistry as defaultRegistry } from './registry';

export interface SlotInteractionConfig {
  enabled?: boolean;
  __presetId?: string;
  __presetName?: string;
  [key: string]: unknown;
}

/**
 * Callbacks for app-specific concerns that the engine delegates
 */
export interface SlotExecutionCallbacks {
  /** Called when a preset-backed interaction is about to execute */
  onPresetUsage?: (presetId: string, presetName?: string) => void;
  /** Called after a preset-backed interaction completes with an outcome */
  onPresetOutcome?: (presetId: string, outcome: 'success' | 'failure' | 'neutral', presetName?: string) => void;
  /** Called when a dialogue-mode interaction succeeds */
  onDialogue?: (npcId: number) => void;
  /** Called to show success/error notifications to the user */
  onNotification?: (type: 'success' | 'error', title: string, message: string) => void;
}

/**
 * Determine interaction outcome from result
 */
function determineOutcome(result: InteractionResult): 'success' | 'failure' | 'neutral' {
  if (result.success) return 'success';
  if (result.success === false) return 'failure';
  return 'neutral';
}

/**
 * Execute all enabled interactions for an NPC slot.
 *
 * Orchestration logic:
 * 1. Iterates slot interactions, filtering by enabled
 * 2. Tracks preset usage via callbacks
 * 3. Resolves plugin from registry and checks uiMode
 * 4. Routes dialogue vs standard execution
 * 5. Tracks outcomes and dispatches notifications
 *
 * @param assignment - NPC slot assignment containing interactions config
 * @param context - Interaction context with session, state, callbacks
 * @param callbacks - App-specific callbacks for UI and preset tracking
 * @param registry - Interaction registry to resolve plugins from (defaults to global)
 */
export async function executeSlotInteractions(
  assignment: NpcSlotAssignment,
  context: InteractionContext,
  callbacks: SlotExecutionCallbacks,
  registry: InteractionRegistry = defaultRegistry,
): Promise<void> {
  if (!assignment.npcId) return;

  const slot = assignment.slot;
  const interactions = slot.interactions || {};

  let hasInteraction = false;

  for (const [interactionId, config] of Object.entries(interactions)) {
    const interactionConfig = config as SlotInteractionConfig | undefined;

    if (!interactionConfig?.enabled) continue;

    hasInteraction = true;

    // Track preset usage if this interaction was created from a preset
    if (typeof interactionConfig.__presetId === 'string' && callbacks.onPresetUsage) {
      callbacks.onPresetUsage(interactionConfig.__presetId, interactionConfig.__presetName);
    }

    // Get the plugin to check its UI mode
    const plugin = await registry.getAsync(interactionId);

    // Handle dialogue-mode interactions (e.g., talk)
    if (plugin?.uiMode === 'dialogue') {
      try {
        // Validate and execute
        if (plugin.validate) {
          const error = plugin.validate(interactionConfig);
          if (error) throw new Error(error);
        }
        if (plugin.isAvailable && !plugin.isAvailable(context)) {
          throw new Error(`${plugin.name} is not available`);
        }
        await plugin.execute(interactionConfig, context);

        // Also trigger the onDialogue handler for backward compatibility
        if (callbacks.onDialogue) {
          callbacks.onDialogue(assignment.npcId);
        }
      } catch (e: any) {
        if (callbacks.onNotification) {
          callbacks.onNotification(
            'error',
            'Interaction Failed',
            String(e?.message ?? e)
          );
        }
      }
      continue;
    }

    // Execute other interactions normally
    try {
      // Validate and execute
      if (plugin?.validate) {
        const error = plugin.validate(interactionConfig);
        if (error) throw new Error(error);
      }
      if (plugin?.isAvailable && !plugin.isAvailable(context)) {
        throw new Error(`${plugin.name} is not available`);
      }
      if (!plugin) {
        throw new Error(`Unknown interaction type: ${interactionId}`);
      }
      const result = await plugin.execute(interactionConfig, context);

      // Track preset outcome
      if (typeof interactionConfig.__presetId === 'string' && callbacks.onPresetOutcome) {
        callbacks.onPresetOutcome(
          interactionConfig.__presetId,
          determineOutcome(result),
          interactionConfig.__presetName
        );
      }

      if (result.success && result.message && callbacks.onNotification) {
        callbacks.onNotification('success', `${interactionId} Success`, result.message);
      }
    } catch (e: any) {
      // Track failure outcome for preset
      if (typeof interactionConfig.__presetId === 'string' && callbacks.onPresetOutcome) {
        callbacks.onPresetOutcome(
          interactionConfig.__presetId,
          'failure',
          interactionConfig.__presetName
        );
      }

      if (callbacks.onNotification) {
        callbacks.onNotification(
          'error',
          'Interaction Failed',
          String(e?.message ?? e)
        );
      }
    }
  }

  // If no interactions configured, show simple dialogue
  if (!hasInteraction && callbacks.onDialogue) {
    callbacks.onDialogue(assignment.npcId);
  }
}
