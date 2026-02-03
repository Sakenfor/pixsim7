/**
 * Talk Interaction Plugin
 *
 * Basic conversation starter plugin.
 * Opens a dialogue/scene with the assigned NPC.
 */

import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
} from '../registry';

/**
 * Talk interaction config
 */
export interface TalkConfig extends BaseInteractionConfig {
  npcId?: number | null; // Optional override; else use assigned NPC
  preferredSceneId?: number | null;
}

/**
 * Talk interaction plugin
 */
export const talkPlugin: InteractionPlugin<TalkConfig> = {
  id: 'talk',
  name: 'Talk',
  description: 'Start a conversation with the NPC',
  icon: '💬',
  category: 'social',
  version: '1.0.0',
  tags: ['dialogue', 'conversation', 'social'],

  // UI behavior: opens dialogue interface
  uiMode: 'dialogue',

  // Capabilities for UI hints
  capabilities: {
    opensDialogue: true,
    affectsRelationship: true, // Conversations can affect relationships
  },

  defaultConfig: {
    enabled: true,
    npcId: null,
    preferredSceneId: null,
  },

  configFields: [
    {
      key: 'npcId',
      label: 'NPC ID Override',
      type: 'number',
      placeholder: 'Use assigned NPC',
      description: 'Optional: Override which NPC to talk to',
    },
    {
      key: 'preferredSceneId',
      label: 'Preferred Scene ID',
      type: 'number',
      placeholder: 'Scene ID for conversation',
      description: 'The scene to play when talking to this NPC',
    },
  ],

  async execute(config: TalkConfig, context: InteractionContext): Promise<InteractionResult> {
    const npcId = config.npcId || context.state.assignment.npcId;
    const sceneId = config.preferredSceneId;

    if (!npcId) {
      return { success: false, message: 'No NPC assigned to this slot' };
    }

    if (!sceneId) {
      return { success: false, message: 'No conversation scene configured' };
    }

    try {
      // Open the scene
      await context.onSceneOpen(sceneId, npcId);
      return { success: true, message: `Started conversation with NPC #${npcId}` };
    } catch (e: any) {
      context.onError(String(e?.message ?? e));
      return { success: false, message: String(e?.message ?? e) };
    }
  },

  validate(config: TalkConfig): string | null {
    if (!config.preferredSceneId) {
      return 'Preferred scene ID is required';
    }
    return null;
  },
};
