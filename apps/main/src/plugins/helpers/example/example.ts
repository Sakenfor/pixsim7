/**
 * Example Helper Plugin
 *
 * This is an example of how to create a custom session helper plugin.
 * Helper plugins extend the session state management system.
 *
 * To use this example:
 * 1. Uncomment the code below
 * 2. The plugin loader will automatically discover and register it
 * 3. Access it via sessionHelperRegistry.execute('exampleHelper', session, ...)
 *
 * For more examples, see:
 * - frontend/src/lib/game/customHelpers.ts
 * - docs/systems/plugins/PLUGIN_SYSTEM.md documentation
 */

import { sessionHelperRegistry, generateHelper } from '@/lib/registries';
import type { GameSessionDTO } from '@/lib/registries';
import { debugFlags } from '@/lib/debugFlags';

/**
 * Registration function - automatically called by the plugin loader
 * Convention: Function name should start with 'register'
 */
export function registerExampleHelper() {
  // Avoid duplicate registration under hot-reload or repeated plugin loads
  if (sessionHelperRegistry.get('exampleHelper')) {
    debugFlags.log('registry', '[PixSim7] Example helper plugin already registered, skipping');
    return;
  }
  // Example 1: Manual helper registration with metadata
  sessionHelperRegistry.register({
    id: 'example-helper',
    name: 'exampleHelper',
    category: 'custom',
    description: 'An example helper that demonstrates the plugin system',
    version: '1.0.0',
    tags: ['example', 'demo', 'tutorial'],
    experimental: true,
    fn: (session: GameSessionDTO, message: string) => {
      console.log('Example helper called with:', message);

      // You can modify session flags
      if (!session.flags.examples) {
        session.flags.examples = [];
      }
      session.flags.examples.push({
        message,
        timestamp: Date.now(),
      });

      return session;
    },
    params: [
      { name: 'session', type: 'GameSessionDTO', description: 'The game session' },
      { name: 'message', type: 'string', description: 'A message to log' },
    ],
    returns: 'GameSessionDTO',
    configSchema: {
      enableLogging: {
        key: 'enableLogging',
        label: 'Enable Logging',
        type: 'boolean',
        description: 'Log messages to console',
        default: true,
      },
      maxMessages: {
        key: 'maxMessages',
        label: 'Max Messages',
        type: 'number',
        description: 'Maximum number of messages to store',
        default: 100,
        min: 1,
        max: 1000,
        step: 10,
      },
    },
  });

  // Example 2: Auto-generated helpers using generateHelper
  // These are useful for simple CRUD operations on session flags

  generateHelper({
    name: 'getExampleCounter',
    category: 'custom',
    keyPattern: 'examples.counter',
    operation: 'get',
  });

  generateHelper({
    name: 'incrementExampleCounter',
    category: 'custom',
    keyPattern: 'examples.counter',
    operation: 'inc',
  });

  generateHelper({
    name: 'resetExampleCounter',
    category: 'custom',
    keyPattern: 'examples.counter',
    operation: 'set',
  });

  debugFlags.log('registry', '✓ Registered example helper plugin');
}

/**
 * USAGE EXAMPLES:
 *
 * After registration, you can use these helpers like this:
 *
 * // Manual helper
 * sessionHelperRegistry.execute('exampleHelper', session, 'Hello world!');
 *
 * // Auto-generated helpers
 * const counter = sessionHelperRegistry.execute('getExampleCounter', session);
 * sessionHelperRegistry.execute('incrementExampleCounter', session, 1);
 * sessionHelperRegistry.execute('resetExampleCounter', session, 0);
 *
 * Or build a helpers object for convenience:
 * const helpers = sessionHelperRegistry.buildHelpersObject(session);
 * helpers.exampleHelper('Hello!');
 * helpers.incrementExampleCounter(1);
 */
