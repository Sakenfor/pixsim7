/**
 * Register Dev Tools
 *
 * Central initialization for all built-in developer tools.
 * This should be called once at app startup.
 *
 * Note: Tool definitions now live in `features/devtools/plugins/` following
 * the standard plugin pattern. See docs/PLUGIN_ARCHITECTURE.md.
 */

import { devToolRegistry } from './devToolRegistry';
import { builtInDevTools } from '@features/devtools';

/**
 * Register all built-in dev tools
 */
export function registerDevTools(): void {
  // Register built-in tools from the plugins folder
  builtInDevTools.forEach(tool => {
    if (!devToolRegistry.get(tool.id)) {
      devToolRegistry.register(tool);
    }
  });

  console.log(`[DevToolRegistry] Registered ${devToolRegistry.getAll().length} dev tools`);
}
