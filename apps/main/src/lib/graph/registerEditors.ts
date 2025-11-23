/**
 * Register Graph Editors
 *
 * Registers built-in graph editor surfaces in the graph editor registry.
 * Part of Task 53 - Graph Editor Registry & Modular Surfaces
 */

import { graphEditorRegistry } from './editorRegistry';
import { GraphPanelWithProvider } from '../../components/legacy/GraphPanel';
import { ArcGraphPanel } from '../../components/arc-graph/ArcGraphPanel';

/**
 * Register all built-in graph editors
 * Should be called during app initialization
 */
export function registerGraphEditors(): void {
  // Register Scene Graph Editor (Legacy/Core)
  graphEditorRegistry.register({
    id: 'scene-graph-v2',
    label: 'Scene Graph Editor',
    description: 'Multi-scene node editor for runtime scenes',
    icon: '🔀',
    category: 'core',
    component: GraphPanelWithProvider,
    storeId: 'scene-graph-v2',
    supportsMultiScene: true,
    supportsWorldContext: true,
    supportsPlayback: true,
    defaultPanelId: 'graph',
  });

  // Register Arc Graph Editor (Modern)
  graphEditorRegistry.register({
    id: 'arc-graph',
    label: 'Arc Graph Editor',
    description: 'Arc/quest progression editor',
    icon: '🗺️',
    category: 'arc',
    component: ArcGraphPanel,
    storeId: 'arc-graph',
    supportsMultiScene: true,
    supportsWorldContext: true,
    supportsPlayback: false,
    defaultRoute: '/arc-graph',
  });

  console.log('[Graph Editor Registry] Registered graph editors:', graphEditorRegistry.getStats());
}
