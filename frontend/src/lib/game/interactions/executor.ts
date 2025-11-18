/**
 * Interaction Executor
 *
 * Extracts the logic for normalizing and executing NPC slot interactions.
 * Makes Game2D cleaner and testable.
 */

import type { GameSessionDTO, NpcPresenceDTO } from '../../api/game';
import type { NpcSlotAssignment } from '@pixsim7/game-core';
import type { InteractionContext } from './types';
import { executeInteraction } from './index';

export interface SlotInteractionConfig {
  [key: string]: any;
}

/**
 * Normalize old and new interaction formats
 *
 * @deprecated Legacy format support for backward compatibility only.
 * New slots should use the plugin-based format directly:
 *
 * ```typescript
 * {
 *   talk: { enabled: true, preferredSceneId: 123 },
 *   pickpocket: { enabled: true, baseSuccessChance: 0.4, detectionChance: 0.3 }
 * }
 * ```
 *
 * OLD format (deprecated):
 * ```typescript
 * {
 *   canTalk: true,
 *   npcTalk: { preferredSceneId: 123 },
 *   canPickpocket: true,
 *   pickpocket: { baseSuccessChance: 0.4, detectionChance: 0.3 }
 * }
 * ```
 */
export function normalizeInteractions(
  interactions: Record<string, any> | undefined
): Record<string, any> {
  if (!interactions) return {};

  const normalized: Record<string, any> = {};
  let hasLegacyFormat = false;

  // Handle old format (canTalk, npcTalk, canPickpocket, pickpocket) - DEPRECATED
  if ((interactions as any).canTalk) {
    hasLegacyFormat = true;
    normalized.talk = {
      enabled: true,
      ...(interactions as any).npcTalk,
    };
  } else if ((interactions as any).talk) {
    normalized.talk = (interactions as any).talk;
  }

  if ((interactions as any).canPickpocket) {
    hasLegacyFormat = true;
    normalized.pickpocket = {
      enabled: true,
      ...(interactions as any).pickpocket,
    };
  } else if ((interactions as any).pickpocket) {
    normalized.pickpocket = (interactions as any).pickpocket;
  }

  // Copy over any other plugin-based interactions
  for (const [key, value] of Object.entries(interactions)) {
    if (
      key !== 'canTalk' &&
      key !== 'npcTalk' &&
      key !== 'canPickpocket' &&
      key !== 'pickpocket'
    ) {
      normalized[key] = value;
    }
  }

  // Warn about legacy format usage
  if (hasLegacyFormat) {
    console.warn(
      '⚠️ [DEPRECATED] Legacy interaction format detected (canTalk, canPickpocket). ' +
      'Please migrate to the new plugin-based format. See executor.ts for migration guide.'
    );
  }

  return normalized;
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
  const interactions = normalizeInteractions(slot.interactions);

  let hasInteraction = false;
  let hasDialogueInteraction = false;

  for (const [interactionId, config] of Object.entries(interactions)) {
    if (!config || !config.enabled) continue;

    hasInteraction = true;

    // Get the plugin to check its UI mode
    const plugin = (await import('./index')).interactionRegistry.get(interactionId);

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
      if (result.success && result.message && handlers.onNotification) {
        handlers.onNotification('success', `${interactionId} Success`, result.message);
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
  }

  // If no interactions configured, show simple dialogue
  if (!hasInteraction && handlers.onDialogue) {
    handlers.onDialogue(assignment.npcId);
  }
}
