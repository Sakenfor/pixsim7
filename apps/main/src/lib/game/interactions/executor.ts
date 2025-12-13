/**
 * Interaction Executor
 *
 * Extracts the logic for normalizing and executing NPC slot interactions.
 * Makes Game2D cleaner and testable.
 */

import type { GameSessionDTO, NpcPresenceDTO } from '../../api/game';
import type { NpcSlotAssignment } from '@pixsim7/game.engine';
import type { InteractionContext } from './types';
import { executeInteraction } from './index';
import { trackPresetUsage, trackPresetOutcome, type InteractionOutcome } from './presets';

export interface SlotInteractionConfig {
  [key: string]: any;
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
  let hasDialogueInteraction = false;

  for (const [interactionId, config] of Object.entries(interactions)) {
    if (!config || !config.enabled) continue;

    hasInteraction = true;

    // Track preset usage if this interaction was created from a preset
    if (config.__presetId) {
      trackPresetUsage(config.__presetId, config.__presetName);
    }

    // Get the plugin to check its UI mode
    const plugin = await (await import('./index')).interactionRegistry.getAsync(interactionId);

    // Handle dialogue-mode interactions (e.g., talk)
    if (plugin?.uiMode === 'dialogue') {
      hasDialogueInteraction = true;
      // Execute the interaction (which will open the dialogue)
      try {
        await executeInteraction(interactionId, config, context);
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
      const result = await executeInteraction(interactionId, config, context);

      // Phase 7: Track preset outcome if this interaction was created from a preset
      if (config.__presetId) {
        // Determine outcome based on result
        let outcome: InteractionOutcome;
        if (result.success) {
          outcome = 'success';
        } else if (result.success === false) {
          outcome = 'failure';
        } else {
          outcome = 'neutral';
        }
        trackPresetOutcome(config.__presetId, outcome, config.__presetName);
      }

      if (result.success && result.message && handlers.onNotification) {
        handlers.onNotification('success', `${interactionId} Success`, result.message);
      }
    } catch (e: any) {
      // Phase 7: Track failure outcome for preset
      if (config.__presetId) {
        trackPresetOutcome(config.__presetId, 'failure', config.__presetName);
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
