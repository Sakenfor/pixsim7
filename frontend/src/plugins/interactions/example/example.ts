/**
 * Example Interaction Plugin
 *
 * This is an example of how to create a custom NPC interaction plugin.
 * Interaction plugins add new ways to interact with NPCs in the game.
 *
 * To use this example:
 * 1. Uncomment the code below
 * 2. The plugin loader will automatically discover and register it
 * 3. It will appear in the NPC interaction UI when talking to NPCs
 *
 * For more examples, see:
 * - frontend/src/lib/game/interactions/ (built-in interactions)
 * - PLUGIN_SYSTEM.md documentation
 */

import type { InteractionPlugin, InteractionContext, InteractionResult } from '../../../lib/game/interactions/types';

/**
 * Configuration interface for this interaction
 * Must extend BaseInteractionConfig (which requires 'enabled' field)
 */
interface ExampleInteractionConfig {
  enabled: boolean;
  points: number;
  message: string;
}

/**
 * Example interaction plugin
 * Convention: Export name should end with 'Plugin'
 */
export const exampleInteractionPlugin: InteractionPlugin<ExampleInteractionConfig> = {
  // Unique ID (used to reference this interaction)
  id: 'example-interaction',

  // Display name shown in UI
  name: 'Example Interaction',

  // Description shown in UI
  description: 'An example interaction that demonstrates the plugin system',

  // Icon/emoji shown in UI
  icon: '⚡',

  // Default configuration when first enabled
  defaultConfig: {
    enabled: true,
    points: 10,
    message: 'Hello!',
  },

  // Form fields for configuration UI
  // These are automatically rendered in the interaction config panel
  configFields: [
    {
      key: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      description: 'Enable or disable this interaction',
    },
    {
      key: 'points',
      label: 'Points',
      type: 'number',
      description: 'Number of points to award',
      min: 0,
      max: 100,
      step: 5,
    },
    {
      key: 'message',
      label: 'Message',
      type: 'text',
      description: 'Message to display',
      placeholder: 'Enter a message...',
    },
  ],

  /**
   * Main execution function
   * Called when the user triggers this interaction
   */
  async execute(config: ExampleInteractionConfig, context: InteractionContext): Promise<InteractionResult> {
    try {
      // Access game state
      const { state, session, onSuccess, onError } = context;
      const npcId = state.assignment.npc_id;
      const npcName = state.assignment.npc?.name || 'Unknown';

      console.log(`Example interaction executed with NPC ${npcName} (ID: ${npcId})`);
      console.log('Config:', config);

      // You can use session helpers to modify the game state
      // For example, updating relationship:
      if (state.gameSession) {
        await session.updateNpcRelationship(npcId, {
          affinity: (state.relationships[npcId]?.affinity || 0) + config.points,
        });
      }

      // Show success message
      onSuccess(`${config.message} (Awarded ${config.points} points)`);

      // Return success result
      return {
        success: true,
        message: `Successfully interacted with ${npcName}`,
        data: {
          pointsAwarded: config.points,
          npcId,
          npcName,
        },
      };
    } catch (error: any) {
      // Show error message
      context.onError(error.message || 'Failed to execute interaction');

      // Return failure result
      return {
        success: false,
        message: error.message || 'An error occurred',
      };
    }
  },

  /**
   * Optional: Validate configuration
   * Return null if valid, or an error message if invalid
   */
  validate(config: ExampleInteractionConfig): string | null {
    if (config.points < 0) {
      return 'Points cannot be negative';
    }

    if (!config.message || config.message.trim().length === 0) {
      return 'Message cannot be empty';
    }

    return null; // Valid
  },

  /**
   * Optional: Check if this interaction is available in the current context
   * Return true to show, false to hide
   */
  isAvailable(context: InteractionContext): boolean {
    // For example, only show this interaction if the NPC has a certain tag
    // const npc = context.state.assignment.npc;
    // return npc?.tags?.includes('friendly') || false;

    // For this example, always available
    return true;
  },
};

/**
 * USAGE NOTES:
 *
 * 1. This plugin is automatically discovered by the plugin loader because:
 *    - It's in the plugins/interactions/ directory
 *    - It exports an object with 'id' and 'execute' properties
 *
 * 2. The plugin loader will call interactionRegistry.register(exampleInteractionPlugin)
 *
 * 3. Users can then enable/configure it in the NPC interaction UI
 *
 * 4. The interaction context provides:
 *    - state: Current game/world/NPC state
 *    - session: Helper methods for session manipulation
 *    - api: API methods for backend calls
 *    - onSceneOpen: Function to open a scene
 *    - onSuccess/onError: Functions to show feedback
 *
 * 5. Session helpers use optimistic updates:
 *    - Changes apply immediately for instant UI feedback
 *    - Backend validates and can reject/rollback changes
 *
 * For more advanced examples, see the built-in interactions:
 * - frontend/src/lib/game/interactions/talk.ts
 * - frontend/src/lib/game/interactions/pickpocket.ts
 * - frontend/src/lib/game/interactions/giveItem.ts
 * - frontend/src/lib/game/interactions/persuade.ts
 */
