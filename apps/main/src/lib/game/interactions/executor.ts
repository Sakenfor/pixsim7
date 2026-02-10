/**
 * Interaction Executor
 *
 * Thin wrapper around the engine's executeSlotInteractions.
 * Wires up app-specific preset tracking (localStorage) to engine callbacks.
 *
 * @see packages/game/engine/src/interactions/executor.ts
 */

import type { NpcSlotAssignment } from '@pixsim7/game.engine';
import {
  executeSlotInteractions as executeSlotInteractionsCore,
  type SlotExecutionCallbacks,
} from '@pixsim7/game.engine';
import { interactionRegistry, type InteractionContext } from '@pixsim7/game.engine';

import { trackPresetUsage, trackPresetOutcome } from './presets';

// Re-export engine types for backward compatibility
export type { SlotInteractionConfig, SlotExecutionCallbacks } from '@pixsim7/game.engine';

/**
 * Execute all enabled interactions for an NPC slot.
 * Delegates to engine core, wiring app-specific preset tracking.
 */
export async function executeSlotInteractions(
  assignment: NpcSlotAssignment,
  context: InteractionContext,
  handlers: {
    onDialogue?: (npcId: number) => void;
    onNotification?: (type: 'success' | 'error', title: string, message: string) => void;
  }
): Promise<void> {
  const callbacks: SlotExecutionCallbacks = {
    onPresetUsage: (presetId, presetName) => trackPresetUsage(presetId, presetName),
    onPresetOutcome: (presetId, outcome, presetName) => trackPresetOutcome(presetId, outcome, presetName),
    onDialogue: handlers.onDialogue,
    onNotification: handlers.onNotification,
  };

  return executeSlotInteractionsCore(assignment, context, callbacks, interactionRegistry);
}
