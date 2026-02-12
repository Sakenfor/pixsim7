/**
 * Register Graph Editors
 *
 * Registers built-in graph editor surfaces in the graph editor registry.
 * Part of Task 53 - Graph Editor Registry & Modular Surfaces
 *
 * The Scene Graph Editor ('scene-graph-v2') is the **Core Flow View** -
 * the canonical logic/flow editor for designing flows (scenes, nodes, choices,
 * transitions, edge effects).
 *
 * @see EditorContext.editor.primaryView for how this integrates with the editor context
 * @see coreEditorRole in PanelDefinition for panel-level identification
 */

import { lazy } from 'react';

import { graphEditorSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import { debugFlags } from '@lib/utils/debugFlags';

import { ArcGraphPanel } from '@features/graph';

import type { GraphEditorComponent } from './types';

// Use lazy import to break circular dependency
const SceneGraphPanelWithProvider = lazy(() =>
  import('@features/graph/components/scene-graph-v2/SceneGraphPanel').then(m => ({
    default: m.SceneGraphPanelWithProvider,
  }))
);

/**
 * Register all built-in graph editors
 * Should be called during app initialization
 */
export async function registerGraphEditors(): Promise<void> {
  // Register Scene Graph Editor (Core)
  // Core Flow View: The canonical logic/flow editor for designing scenes, nodes, choices, transitions
  if (!graphEditorSelectors.has('scene-graph-v2')) {
    await registerPluginDefinition({
      id: 'scene-graph-v2',
      family: 'graph-editor',
      origin: 'builtin',
      source: 'source',
      canDisable: false,
      plugin: {
        id: 'scene-graph-v2',
        label: 'Scene Graph Editor',
        description: 'Multi-scene node editor for runtime scenes (Core Flow View)',
        icon: 'dY"?',
        category: 'core',
        component: SceneGraphPanelWithProvider as GraphEditorComponent,
        storeId: 'scene-graph-v2',
        supportsMultiScene: true,
        supportsWorldContext: true,
        supportsPlayback: true,
        defaultPanelId: 'graph',
      },
    });
  }

  // Register Arc Graph Editor (Modern)
  if (!graphEditorSelectors.has('arc-graph')) {
    await registerPluginDefinition({
      id: 'arc-graph',
      family: 'graph-editor',
      origin: 'builtin',
      source: 'source',
      canDisable: false,
      plugin: {
        id: 'arc-graph',
        label: 'Arc Graph Editor',
        description: 'Arc/quest progression editor',
        icon: 'dY-??,?',
        category: 'arc',
        component: ArcGraphPanel,
        storeId: 'arc-graph',
        supportsMultiScene: true,
        supportsWorldContext: true,
        supportsPlayback: false,
        defaultRoute: '/arc-graph',
      },
    });
  }

  debugFlags.log('registry', '[Graph Editor Catalog] Registered graph editors:', graphEditorSelectors.getStats());
}
