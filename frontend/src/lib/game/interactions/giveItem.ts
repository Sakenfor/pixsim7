/**
 * Give Item Interaction Plugin
 *
 * Example of how easy it is to add a new interaction type.
 * Just define the config, fields, and execute logic.
 */
import type { InteractionPlugin, BaseInteractionConfig } from './types';

export interface GiveItemConfig extends BaseInteractionConfig {
  itemId: string;
  requiredRelationship: number;
  rewardSceneId?: number | null;
  rejectSceneId?: number | null;
}

export const giveItemInteraction: InteractionPlugin<GiveItemConfig> = {
  id: 'give_item',
  name: 'Give Item',
  description: 'Offer an item to the NPC',
  icon: '🎁',

  defaultConfig: {
    enabled: true,
    itemId: '',
    requiredRelationship: 0,
    rewardSceneId: null,
    rejectSceneId: null,
  },

  configFields: [
    {
      type: 'text',
      key: 'itemId',
      label: 'Item ID',
      placeholder: 'e.g., flower, gift, letter',
    },
    {
      type: 'number',
      key: 'requiredRelationship',
      label: 'Required Relationship Level',
      min: 0,
      max: 100,
    },
    {
      type: 'number',
      key: 'rewardSceneId',
      label: 'Reward Scene (if accepted)',
      placeholder: 'Scene ID',
    },
    {
      type: 'number',
      key: 'rejectSceneId',
      label: 'Reject Scene (if declined)',
      placeholder: 'Scene ID',
    },
  ],

  async execute(config, context) {
    const { state, api } = context;

    if (!state.gameSession) {
      return {
        success: false,
        message: 'No game session active',
      };
    }

    if (!config.itemId) {
      return {
        success: false,
        message: 'No item configured',
      };
    }

    // Access player inventory from state (when implemented)
    const hasItem = state.inventory?.some(item => item.id === config.itemId) ?? true; // Placeholder

    if (!hasItem) {
      return {
        success: false,
        message: `You don't have a ${config.itemId}`,
      };
    }

    // Check relationship level from state
    const npcKey = `npc:${state.assignment.npcId}`;
    const relationship = state.relationships[npcKey];
    const relationshipScore = relationship?.score ?? 0;

    if (relationshipScore < config.requiredRelationship) {
      return {
        success: false,
        message: `Relationship too low (need ${config.requiredRelationship}, have ${relationshipScore})`,
      };
    }

    // Placeholder: random acceptance
    const accepted = Math.random() > 0.5;

    if (accepted && config.rewardSceneId) {
      await context.onSceneOpen(config.rewardSceneId, state.assignment.npcId!);
      return {
        success: true,
        message: `NPC accepted your ${config.itemId}!`,
        triggerScene: config.rewardSceneId,
      };
    } else if (!accepted && config.rejectSceneId) {
      await context.onSceneOpen(config.rejectSceneId, state.assignment.npcId!);
      return {
        success: true,
        message: `NPC rejected your ${config.itemId}`,
        triggerScene: config.rejectSceneId,
      };
    }

    return {
      success: true,
      message: accepted
        ? `NPC accepted your ${config.itemId}!`
        : `NPC rejected your ${config.itemId}`,
    };
  },

  validate(config) {
    if (!config.itemId || config.itemId.trim() === '') {
      return 'Item ID is required';
    }
    return null;
  },

  isAvailable(context) {
    // Could check if player has items in inventory
    // Access state without importing anything!
    return context.state.gameSession !== null && (context.state.inventory?.length ?? 0) > 0;
  },
};
