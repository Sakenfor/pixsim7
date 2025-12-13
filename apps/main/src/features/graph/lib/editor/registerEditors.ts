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

import { graphEditorRegistry } from './editorRegistry';
import { GraphPanelWithProvider } from '@/components/legacy/GraphPanel';
import { ArcGraphPanel } from '@features/graph';
import { debugFlags } from '@/lib/utils/debugFlags';

/**
 * Register all built-in graph editors
 * Should be called during app initialization
 */
export function registerGraphEditors(): void {
  // Register Scene Graph Editor (Legacy/Core)
  // Core Flow View: The canonical logic/flow editor for designing scenes, nodes, choices, transitions
  graphEditorRegistry.register({
    id: 'scene-graph-v2',
    label: 'Scene Graph Editor',
    description: 'Multi-scene node editor for runtime scenes (Core Flow View)',
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

  debugFlags.log('registry', '[Graph Editor Registry] Registered graph editors:', graphEditorRegistry.getStats());
}
