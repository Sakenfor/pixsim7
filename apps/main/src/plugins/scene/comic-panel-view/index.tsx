/**
 * Comic Panel View Plugin
 *
 * Entry point for the comic panel scene view plugin. This module:
 * - Exports the plugin manifest for discovery
 * - Creates the plugin instance
 * - Registers with the scene view registry via an explicit register function
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
 * await registerComicPanelView();
 *
 * // Or manually register
 * import { registerComicPanelView } from '@plugins/scene/comic-panel-view';
 * await registerComicPanelView();
 * ```
 */

/* eslint-disable react-refresh/only-export-components */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import type { SceneViewPlugin } from '@lib/plugins/sceneViewPlugin';

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

export async function registerComicPanelView(): Promise<void> {
  await registerPluginDefinition({
    id: manifest.id,
    family: 'scene-view',
    origin: 'builtin',
    source: 'source',
    plugin: { manifest, plugin },
    canDisable: false,
  });
}

// Re-export for manual usage
export { manifest };
export { ComicPanelSceneView } from './PluginSceneView';
