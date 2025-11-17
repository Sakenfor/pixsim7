/**
 * Talk Interaction Plugin
 */
import type { InteractionPlugin, BaseInteractionConfig } from './types';

export interface TalkConfig extends BaseInteractionConfig {
  npcIdOverride?: number | null;
  preferredSceneId?: number | null;
}

export const talkInteraction: InteractionPlugin<TalkConfig> = {
  id: 'talk',
  name: 'Talk',
  description: 'Start a conversation with the NPC',
  icon: '💬',

  defaultConfig: {
    enabled: true,
    npcIdOverride: null,
    preferredSceneId: null,
  },

  configFields: [
    {
      type: 'number',
      key: 'npcIdOverride',
      label: 'NPC ID Override',
      placeholder: 'Use assigned NPC',
    },
    {
      type: 'number',
      key: 'preferredSceneId',
      label: 'Preferred Scene ID',
      placeholder: 'Scene ID for conversation',
    },
  ],

  async execute(config, context) {
    const { state } = context;
    const npcId = config.npcIdOverride || state.assignment.npcId;
    const sceneId = config.preferredSceneId;

    if (!npcId) {
      return {
        success: false,
        message: 'No NPC assigned to this slot',
      };
    }

    if (sceneId) {
      // Trigger scene playback via injected callback
      await context.onSceneOpen(sceneId, npcId);
      return {
        success: true,
        triggerScene: sceneId,
      };
    } else {
      return {
        success: false,
        message: 'No scene configured for this conversation',
      };
    }
  },

  validate(config) {
    if (config.preferredSceneId && config.preferredSceneId < 1) {
      return 'Scene ID must be positive';
    }
    return null;
  },
};
