/**
 * Provider-specific generation UI plugins
 *
 * This module auto-registers all provider-specific plugins.
 * Import this module early in your app to ensure plugins are available.
 */

import { generationUIPluginRegistry } from '../generationPlugins';
import { pixversePlugin } from './PixversePlugin';
import { soraPlugin } from './SoraPlugin';

/**
 * Register all provider plugins
 */
export function registerProviderPlugins() {
  generationUIPluginRegistry.register(pixversePlugin);
  generationUIPluginRegistry.register(soraPlugin);
}

/**
 * Auto-register plugins on module load
 */
registerProviderPlugins();

/**
 * Export plugins for direct access if needed
 */
export { pixversePlugin, soraPlugin };
