/**
 * Give Item Interaction Plugin
 *
 * Allows player to offer an item to an NPC.
 * Demonstrates inventory access, relationship checks, and scene triggers.
 */

import type { NpcRelationshipState } from '../../core/types';
import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
} from '../registry';

export interface GiveItemConfig extends BaseInteractionConfig {
  itemId: string;
  requiredRelationship: number;
  rewardSceneId?: number | null;
  rejectSceneId?: number | null;
}

export const giveItemPlugin: InteractionPlugin<GiveItemConfig> = {
  id: 'give_item',
  name: 'Give Item',
  description: 'Offer an item to the NPC',
  icon: '🎁',
  category: 'social',
  version: '1.0.0',
  tags: ['item', 'gift', 'social'],

  // UI behavior: may open dialogue depending on scene config
  uiMode: 'custom',

  // Capabilities for UI hints
  capabilities: {
    opensDialogue: true, // Can open reward/reject scenes
    modifiesInventory: true,
    affectsRelationship: true,
    requiresItems: true,
    consumesItems: true,
  },

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

  async execute(config: GiveItemConfig, context: InteractionContext): Promise<InteractionResult> {
    const { state } = context;

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
    const inventory = context.session.getInventory();
    const hasItem = inventory.some(item => item.id === config.itemId) || inventory.length === 0;

    if (!hasItem) {
      return {
        success: false,
        message: `You don't have a ${config.itemId}`,
      };
    }

    // Check relationship level using generic getStat API
    const relState = context.session.getStat('session.relationships', state.assignment.npcId!) as NpcRelationshipState | null;
    const relationshipScore = relState?.values.affinity ?? 0;

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
        data: { triggerScene: config.rewardSceneId },
      };
    } else if (!accepted && config.rejectSceneId) {
      await context.onSceneOpen(config.rejectSceneId, state.assignment.npcId!);
      return {
        success: true,
        message: `NPC rejected your ${config.itemId}`,
        data: { triggerScene: config.rejectSceneId },
      };
    }

    return {
      success: true,
      message: accepted
        ? `NPC accepted your ${config.itemId}!`
        : `NPC rejected your ${config.itemId}`,
    };
  },

  validate(config: GiveItemConfig): string | null {
    if (!config.itemId || config.itemId.trim() === '') {
      return 'Item ID is required';
    }
    return null;
  },

  isAvailable(context: InteractionContext): boolean {
    // Could check if player has items in inventory
    return context.state.gameSession !== null && context.session.getInventory().length > 0;
  },
};
