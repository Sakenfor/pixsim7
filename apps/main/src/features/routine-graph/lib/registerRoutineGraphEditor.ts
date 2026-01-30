/**
 * Register Routine Graph Editor
 *
 * Registers the routine graph editor in the graph editor registry.
 */

import { graphEditorSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import { debugFlags } from '@lib/utils/debugFlags';

import type { GraphEditorComponent } from '@features/graph/lib/editor/types';

import { RoutineGraphPanel } from '../components/RoutineGraphPanel';

/**
 * Register the Routine Graph Editor
 * Should be called during app initialization
 */
export async function registerRoutineGraphEditor(): Promise<void> {
  if (graphEditorSelectors.has('routine-graph')) {
    debugFlags.log('registry', '[Routine Graph] Already registered');
    return;
  }

  await registerPluginDefinition({
    id: 'routine-graph',
    family: 'graph-editor',
    origin: 'builtin',
    source: 'source',
    canDisable: false,
    plugin: {
      id: 'routine-graph',
      label: 'Routine Graph Editor',
      description: 'Visual editor for NPC daily routine schedules',
      icon: '🕐',
      category: 'behavior',
      component: RoutineGraphPanel as GraphEditorComponent,
      storeId: 'routine-graph',
      supportsMultiScene: false,
      supportsWorldContext: true,
      supportsPlayback: false,
      defaultRoute: '/routine-graph',
    },
  });

  debugFlags.log('registry', '[Routine Graph] Editor registered');
}
