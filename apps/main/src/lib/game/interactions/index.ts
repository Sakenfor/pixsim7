/**
 * Interaction Plugin Registry
 *
 * Bundled interactions are registered here. Plugin-provided interactions
 * (like pickpocket from game_stealth) are loaded dynamically at runtime
 * via loadPluginInteractions().
 *
 * NOTE: For canonical registry imports, use:
 * import { interactionRegistry } from '@lib/registries';
 */

import {
  giveItemPlugin as giveItemInteraction,
  persuadePlugin,
  sensualizePlugin,
  talkPlugin,
} from '@pixsim7/game.engine';

import { loadPluginInteractions } from './dynamicLoader';
import { interactionRegistry } from './types';

// Register bundled interactions (always available)
interactionRegistry.register(talkPlugin);
interactionRegistry.register(giveItemInteraction);
interactionRegistry.register(persuadePlugin);
interactionRegistry.register(sensualizePlugin);
// Plugin interactions (pickpocket, etc.) are loaded via initializeInteractions()

/**
 * Initialize interactions including dynamic plugin loading
 *
 * Call this at app startup to load plugin-provided interactions
 * from the backend. Returns the number of dynamically loaded interactions.
 *
 * This is safe to call multiple times - already loaded plugins are skipped.
 */
export async function initializeInteractions(): Promise<number> {
  try {
    const loadedCount = await loadPluginInteractions();
    console.info(`[interactions] Initialized with ${loadedCount} dynamic interactions`);
    return loadedCount;
  } catch (error) {
    console.warn('[interactions] Dynamic loading failed, using bundled interactions only:', error);
    return 0;
  }
}

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
  SessionAPI,
} from './types';

// Export specific configs for type safety
// Note: PickpocketConfig is in @pixsim7/plugins.stealth/types
export type { TalkConfig } from '@pixsim7/game.engine';
export type { GiveItemConfig } from '@pixsim7/game.engine';
export type { PersuadeConfig } from '@pixsim7/game.engine';
export type { SensualizeConfig } from '@pixsim7/game.engine';

// Export dynamic loader utilities
export {
  loadPluginInteractions,
  createGenericInteraction,
  jsonSchemaToConfigFields,
  isDynamicLoadingAvailable,
  clearLoadedPluginsCache,
} from './dynamicLoader';

// Export the config form component
export { InteractionConfigForm } from './InteractionConfigForm';

// Export utilities for working with interactions dynamically
export {
  getInteractionMetadata,
  getEnabledInteractions,
  hasEnabledInteractions,
  getInteractionPlugin,
  getAllInteractions,
} from './utils';

/**
 * Helper to execute an interaction by ID
 */
export async function executeInteraction(
  interactionId: string,
  config: any,
  context: any
) {
  const plugin = await interactionRegistry.getAsync(interactionId);
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
