/**
 * Gallery Tools Registration
 *
 * Registers all available gallery tools with the registry.
 * Called once at application startup.
 */

import { galleryToolRegistry } from './types';
import { bulkTagTool } from './tools/bulkTagTool';

/**
 * Register all gallery tools
 *
 * This should be called once during application initialization.
 */
export function registerGalleryTools(): void {
  // Register built-in tools
  galleryToolRegistry.register(bulkTagTool);

  console.log(`✓ Registered ${galleryToolRegistry.getAll().length} gallery tool(s)`);
}
