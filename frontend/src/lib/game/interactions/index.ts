/**
 * Interaction plugin registry
 *
 * To add a new interaction:
 * 1. Create a new plugin file (e.g., myInteraction.ts)
 * 2. Import and register it here (1 line!)
 */

import { interactionRegistry } from './types';
import { talkPlugin } from './talk';
import { pickpocketPlugin } from './pickpocket';

// Register all plugins
interactionRegistry.register(talkPlugin);
interactionRegistry.register(pickpocketPlugin);

// Re-export everything for convenience
export * from './types';
export { talkPlugin } from './talk';
export { pickpocketPlugin } from './pickpocket';
export { InteractionConfigForm } from './InteractionConfigForm';
