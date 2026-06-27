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

import { lazy, Suspense } from 'react';

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import type { SceneViewPlugin } from '@lib/plugins/sceneViewPlugin';

import { manifest } from './manifest';

const LazyComicPanelSceneView = lazy(() =>
  import('./PluginSceneView').then((module) => ({
    default: module.ComicPanelSceneView,
  }))
);

/**
 * Plugin instance implementing the SceneViewPlugin interface.
 */
export const plugin: SceneViewPlugin = {
  render(props) {
    return (
      <Suspense fallback={null}>
        <LazyComicPanelSceneView {...props} />
      </Suspense>
    );
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
