/**
 * Pickpocket Interaction Plugin
 *
 * Note: This plugin uses the injected API client from context.
 * No need to import game API functions directly!
 */
import type { InteractionPlugin, BaseInteractionConfig } from './types';

export interface PickpocketConfig extends BaseInteractionConfig {
  baseSuccessChance: number;
  detectionChance: number;
  onSuccessFlags: string[];
  onFailFlags: string[];
}

export const pickpocketInteraction: InteractionPlugin<PickpocketConfig> = {
  id: 'pickpocket',
  name: 'Pickpocket',
  description: 'Attempt to steal from the NPC',
  icon: '🤏',

  defaultConfig: {
    enabled: true,
    baseSuccessChance: 0.4,
    detectionChance: 0.3,
    onSuccessFlags: [],
    onFailFlags: [],
  },

  configFields: [
    {
      type: 'number',
      key: 'baseSuccessChance',
      label: 'Success Chance (0-1)',
      min: 0,
      max: 1,
      step: 0.1,
    },
    {
      type: 'number',
      key: 'detectionChance',
      label: 'Detection Chance (0-1)',
      min: 0,
      max: 1,
      step: 0.1,
    },
    {
      type: 'array',
      key: 'onSuccessFlags',
      label: 'Success Flags (comma-separated)',
      placeholder: 'e.g., stealth:stole_from_npc',
    },
    {
      type: 'array',
      key: 'onFailFlags',
      label: 'Fail Flags (comma-separated)',
      placeholder: 'e.g., stealth:caught_by_npc',
    },
  ],

  async execute(config, context) {
    // Access state from context (no direct imports needed!)
    const { state, api, onSessionUpdate } = context;

    if (!state.gameSession) {
      return {
        success: false,
        message: 'No game session active. Please start a scene first.',
      };
    }

    if (!state.assignment.npcId) {
      return {
        success: false,
        message: 'No NPC in this slot to pickpocket',
      };
    }

    try {
      // Use injected API client (no imports!)
      const result = await api.attemptPickpocket({
        npc_id: state.assignment.npcId,
        slot_id: state.assignment.slot.id,
        base_success_chance: config.baseSuccessChance,
        detection_chance: config.detectionChance,
        world_id: state.worldId,
        session_id: state.gameSession.id,
      });

      // Refresh session via injected API
      if (result.success || result.detected) {
        const updatedSession = await api.getSession(state.gameSession.id);
        onSessionUpdate?.(updatedSession);
      }

      return {
        success: true,
        message: result.message,
        updateSession: true,
      };
    } catch (e: any) {
      return {
        success: false,
        message: String(e?.message ?? e),
      };
    }
  },

  validate(config) {
    if (config.baseSuccessChance < 0 || config.baseSuccessChance > 1) {
      return 'Success chance must be between 0 and 1';
    }
    if (config.detectionChance < 0 || config.detectionChance > 1) {
      return 'Detection chance must be between 0 and 1';
    }
    return null;
  },

  isAvailable(context) {
    // Pickpocket requires a game session
    return context.state.gameSession !== null;
  },
};
