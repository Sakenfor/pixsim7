import { registerRendererFromNodeType } from './rendererBootstrap';
import { ArcNodeRenderer } from '../../components/graph/ArcNodeRenderer';
import { QuestNodeRenderer } from '../../components/graph/QuestNodeRenderer';
import { MilestoneNodeRenderer } from '../../components/graph/MilestoneNodeRenderer';
import { QuestTriggerRenderer } from '../../components/graph/QuestTriggerRenderer';
import { DefaultNodeRenderer } from '../../components/graph/DefaultNodeRenderer';

/**
 * Register all arc graph node renderers
 * Called on app initialization
 *
 * Note: Uses registerRendererFromNodeType() to automatically inherit
 * preloadPriority from the node type definitions.
 */
export function registerArcRenderers() {
  // Arc node - shows arc/story beat information
  // Priority inherited from node type (priority 4)
  registerRendererFromNodeType({
    nodeType: 'arc',
    component: ArcNodeRenderer,
    defaultSize: { width: 240, height: 200 },
  });

  // Quest node - shows quest objective information
  // Priority inherited from node type (priority 4)
  registerRendererFromNodeType({
    nodeType: 'quest',
    component: QuestNodeRenderer,
    defaultSize: { width: 240, height: 200 },
  });

  // Milestone node - shows major story checkpoint
  // Priority inherited from node type (priority 3)
  registerRendererFromNodeType({
    nodeType: 'milestone',
    component: MilestoneNodeRenderer,
    defaultSize: { width: 240, height: 180 },
  });

  // Arc group uses default renderer
  // Priority inherited from node type (priority 2)
  registerRendererFromNodeType({
    nodeType: 'arc_group',
    component: DefaultNodeRenderer,
    defaultSize: { width: 200, height: 120 },
  });

  // Quest trigger node - shows quest trigger information
  // Plugin node type - use explicit priority since it may not have node type definition
  registerRendererFromNodeType({
    nodeType: 'quest-trigger',
    component: QuestTriggerRenderer,
    defaultSize: { width: 280, height: 200 },
  }, {
    priorityOverride: 7, // Moderately important plugin
  });

  console.log('✓ Registered arc node renderers');
}
