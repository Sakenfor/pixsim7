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
 */
export function normalizeInteractions(
  interactions: Record<string, any> | undefined
): Record<string, any> {
  if (!interactions) return {};

  const normalized: Record<string, any> = {};

  // Handle old format (canTalk, npcTalk, canPickpocket, pickpocket)
  if ((interactions as any).canTalk) {
    normalized.talk = {
      enabled: true,
      ...(interactions as any).npcTalk,
    };
  } else if ((interactions as any).talk) {
    normalized.talk = (interactions as any).talk;
  }

  if ((interactions as any).canPickpocket) {
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
  let hasTalkInteraction = false;

  for (const [interactionId, config] of Object.entries(interactions)) {
    if (!config || !config.enabled) continue;

    hasInteraction = true;

    // Handle talk interactions specially (show dialogue UI)
    if (interactionId === 'talk') {
      hasTalkInteraction = true;
      if (handlers.onDialogue) {
        handlers.onDialogue(assignment.npcId);
      }
      continue;
    }

    // Execute other interactions
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
