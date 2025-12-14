/**
 * Comic Panel View Plugin
 *
 * Entry point for the comic panel scene view plugin. This module:
 * - Exports the plugin manifest for discovery
 * - Creates the plugin instance
 * - Registers with the scene view registry on import
 *
 * The plugin renders scene content as sequential comic frames with:
 * - Multiple layout modes (single, strip, grid)
 * - Optional captions
 * - Automatic asset resolution
 * - Dynamic generation fallback
 *
 * @example
 * ```typescript
 * // Bootstrap loads this module automatically
 * await import('@plugins/scene/comic-panel-view');
 *
 * // Or manually register
 * import { manifest, plugin } from '@plugins/scene/comic-panel-view';
 * sceneViewRegistry.register(manifest, plugin);
 * ```
 */

import { sceneViewRegistry, type SceneViewPlugin } from '@lib/plugins/sceneViewPlugin';
import { manifest } from './manifest';
import { ComicPanelSceneView } from './PluginSceneView';

/**
 * Plugin instance implementing the SceneViewPlugin interface.
 */
export const plugin: SceneViewPlugin = {
  render(props) {
    return <ComicPanelSceneView {...props} />;
  },
};

// Auto-register on import
sceneViewRegistry.register(manifest, plugin);

// Re-export for manual usage
export { manifest };
export { ComicPanelSceneView } from './PluginSceneView';
