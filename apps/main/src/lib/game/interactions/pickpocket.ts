import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
} from './types';

/**
 * Pickpocket interaction config
 */
export interface PickpocketConfig extends BaseInteractionConfig {
  baseSuccessChance: number;
  detectionChance: number;
  onSuccessFlags?: string[];
  onFailFlags?: string[];
}

/**
 * Pickpocket interaction plugin
 */
export const pickpocketPlugin: InteractionPlugin<PickpocketConfig> = {
  id: 'pickpocket',
  name: 'Pickpocket',
  description: 'Attempt to steal from the NPC',
  icon: '🤏',
  category: 'stealth',
  version: '1.0.0',
  tags: ['stealth', 'theft', 'risky'],

  // UI behavior: shows notification only
  uiMode: 'notification',

  // Capabilities for UI hints
  capabilities: {
    modifiesInventory: true,
    affectsRelationship: true,
    hasRisk: true,
    canBeDetected: true,
  },

  defaultConfig: {
    enabled: true,
    baseSuccessChance: 0.4,
    detectionChance: 0.3,
    onSuccessFlags: [],
    onFailFlags: [],
  },

  configFields: [
    {
      key: 'baseSuccessChance',
      label: 'Success Chance (0-1)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      description: 'Base probability of successful pickpocket',
    },
    {
      key: 'detectionChance',
      label: 'Detection Chance (0-1)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      description: 'Probability of being caught',
    },
    {
      key: 'onSuccessFlags',
      label: 'Success Flags (comma-separated)',
      type: 'tags',
      placeholder: 'e.g., stealth:stole_from_npc',
      description: 'Flags to set when pickpocket succeeds',
    },
    {
      key: 'onFailFlags',
      label: 'Fail Flags (comma-separated)',
      type: 'tags',
      placeholder: 'e.g., stealth:caught_by_npc',
      description: 'Flags to set when pickpocket fails',
    },
  ],

  async execute(config: PickpocketConfig, context: InteractionContext): Promise<InteractionResult> {
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
      const result = await context.api.attemptPickpocket({
        npc_id: npcId,
        slot_id: context.state.assignment.slot.id,
        base_success_chance: config.baseSuccessChance,
        detection_chance: config.detectionChance,
        world_id: context.state.worldId,
        session_id: gameSession.id,
      });

      // Show result to user
      context.onSuccess(result.message);

      // Optionally update session
      if (context.onSessionUpdate) {
        const updatedSession = await context.api.getSession(gameSession.id);
        context.onSessionUpdate(updatedSession);
      }

      return {
        success: result.success,
        message: result.message,
        data: result,
      };
    } catch (e: any) {
      const errorMsg = String(e?.message ?? e);
      context.onError(errorMsg);
      return { success: false, message: errorMsg };
    }
  },

  validate(config: PickpocketConfig): string | null {
    if (config.baseSuccessChance < 0 || config.baseSuccessChance > 1) {
      return 'Success chance must be between 0 and 1';
    }
    if (config.detectionChance < 0 || config.detectionChance > 1) {
      return 'Detection chance must be between 0 and 1';
    }
    return null;
  },
};
