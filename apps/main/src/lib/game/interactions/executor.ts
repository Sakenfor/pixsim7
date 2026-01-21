/**
 * Interaction Executor
 *
 * Extracts the logic for normalizing and executing NPC slot interactions.
 * Makes Game2D cleaner and testable.
 */

import type { NpcSlotAssignment } from '@pixsim7/game.engine';

import { trackPresetUsage, trackPresetOutcome, type InteractionOutcome } from './presets';
import type { InteractionContext } from './types';

import { executeInteraction } from './index';

export interface SlotInteractionConfig {
  enabled?: boolean;
  __presetId?: string;
  __presetName?: string;
  [key: string]: unknown;
}

/**
 * Execute all enabled interactions for an NPC slot
 */
export async function executeSlotInteractions(
  assignment: NpcSlotAssignment,
  context: InteractionContext,
  handlers: {
    onDialogue?: (npcId: number) => void;
    onNotification?: (type: 'success' | 'error', title: string, message: string) => void;
  }
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
    if (typeof interactionConfig.__presetId === 'string') {
      trackPresetUsage(interactionConfig.__presetId, interactionConfig.__presetName);
    }

    // Get the plugin to check its UI mode
    const plugin = await (await import('./index')).interactionRegistry.getAsync(interactionId);

    // Handle dialogue-mode interactions (e.g., talk)
    if (plugin?.uiMode === 'dialogue') {
      // Execute the interaction (which will open the dialogue)
      try {
        await executeInteraction(interactionId, interactionConfig, context);
        // Also trigger the onDialogue handler for backward compatibility
        if (handlers.onDialogue) {
          handlers.onDialogue(assignment.npcId);
        }
      } catch (e: any) {
        if (handlers.onNotification) {
          handlers.onNotification(
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
      const result = await executeInteraction(interactionId, interactionConfig, context);

      // Phase 7: Track preset outcome if this interaction was created from a preset
      if (typeof interactionConfig.__presetId === 'string') {
        // Determine outcome based on result
        let outcome: InteractionOutcome;
        if (result.success) {
          outcome = 'success';
        } else if (result.success === false) {
          outcome = 'failure';
        } else {
          outcome = 'neutral';
        }
        trackPresetOutcome(
          interactionConfig.__presetId,
          outcome,
          interactionConfig.__presetName
        );
      }

      if (result.success && result.message && handlers.onNotification) {
        handlers.onNotification('success', `${interactionId} Success`, result.message);
      }
    } catch (e: any) {
      // Phase 7: Track failure outcome for preset
      if (typeof interactionConfig.__presetId === 'string') {
        trackPresetOutcome(
          interactionConfig.__presetId,
          'failure',
          interactionConfig.__presetName
        );
      }

      if (handlers.onNotification) {
        handlers.onNotification(
          'error',
          'Interaction Failed',
          String(e?.message ?? e)
        );
      }
    }
  }

  // If no interactions configured, show simple dialogue
  if (!hasInteraction && handlers.onDialogue) {
    handlers.onDialogue(assignment.npcId);
  }
}
