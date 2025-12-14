/**
 * Gallery Tools Registration
 *
 * Registers all available gallery tools with the registry.
 * Called once at application startup.
 *
 * Note: Tools now live in `features/gallery/plugins/` following the
 * standard plugin pattern. See docs/PLUGIN_ARCHITECTURE.md.
 */

import { galleryToolRegistry } from './types';
import { builtInGalleryTools } from '../../plugins';

/**
 * Register all gallery tools
 *
 * This should be called once during application initialization.
 */
export function registerGalleryTools(): void {
  // Register built-in tools from the plugins folder
  builtInGalleryTools.forEach(tool => {
    if (!galleryToolRegistry.get(tool.id)) {
      galleryToolRegistry.register(tool);
    }
  });

  console.log(`✓ Registered ${galleryToolRegistry.getAll().length} gallery tool(s)`);
}
