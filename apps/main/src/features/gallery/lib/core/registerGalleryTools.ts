/**
 * Gallery Tools Registration
 *
 * Registers all available gallery tools with the plugin catalog.
 * Called once at application startup.
 *
 * Note: Tools now live in `features/gallery/plugins/` following the
 * standard plugin pattern. See docs/PLUGIN_ARCHITECTURE.md.
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import { galleryToolSelectors } from '@lib/plugins/catalogSelectors';

import { builtInGalleryTools } from '../../plugins';

/**
 * Register all gallery tools
 *
 * This should be called once during application initialization.
 */
export async function registerGalleryTools(): Promise<void> {
  // Register built-in tools from the plugins folder
  for (const tool of builtInGalleryTools) {
    if (!galleryToolSelectors.get(tool.id)) {
      await registerPluginDefinition({
        id: tool.id,
        family: 'gallery-tool',
        origin: 'builtin',
        source: 'source',
        plugin: tool,
        canDisable: false,
      });
    }
  }

  console.log(`[GalleryTools] Registered ${galleryToolSelectors.getAll().length} gallery tool(s)`);
}
