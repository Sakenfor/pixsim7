/**
 * Interaction Plugin Registry
 *
 * Import and register all available interaction plugins here.
 * Adding a new interaction type is as simple as:
 * 1. Create a new plugin file (e.g., giveItem.ts)
 * 2. Import and register it here
 *
 * NOTE: For canonical registry imports, use:
 * import { interactionRegistry } from '@/lib/registries';
 */

import { interactionRegistry } from './types';
import { talkPlugin } from './talk';
import { pickpocketPlugin } from './pickpocket';
import { giveItemInteraction } from './giveItem';
import { persuadePlugin } from './persuade';

// Register all built-in interactions
interactionRegistry.register(talkPlugin);
interactionRegistry.register(pickpocketPlugin);
interactionRegistry.register(giveItemInteraction);
interactionRegistry.register(persuadePlugin);

// Export registry and types for use in components
// DEPRECATED: Import from @/lib/registries instead for consistency
export { interactionRegistry } from './types';
export type {
  InteractionPlugin,
  InteractionContext,
  InteractionResult,
  BaseInteractionConfig,
  FormField,
  InteractionUIMode,
  InteractionCapabilities,
} from './types';

// Export specific configs for type safety
export type { TalkConfig } from './talk';
export type { PickpocketConfig } from './pickpocket';
export type { GiveItemConfig } from './giveItem';
export type { PersuadeConfig } from './persuade';

// Export the config form component
export { InteractionConfigForm } from './InteractionConfigForm';

/**
 * Helper to execute an interaction by ID
 */
export async function executeInteraction(
  interactionId: string,
  config: any,
  context: any
) {
  const plugin = interactionRegistry.get(interactionId);
  if (!plugin) {
    throw new Error(`Unknown interaction type: ${interactionId}`);
  }

  // Validate config if validator exists
  if (plugin.validate) {
    const error = plugin.validate(config);
    if (error) {
      throw new Error(error);
    }
  }

  // Check availability if gate exists
  if (plugin.isAvailable && !plugin.isAvailable(context)) {
    throw new Error(`Interaction ${interactionId} is not available in this context`);
  }

  return plugin.execute(config, context);
}
