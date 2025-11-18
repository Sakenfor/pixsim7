import { nodeRendererRegistry } from './nodeRendererRegistry';
import { ArcNodeRenderer } from '../../components/graph/ArcNodeRenderer';
import { QuestNodeRenderer } from '../../components/graph/QuestNodeRenderer';
import { MilestoneNodeRenderer } from '../../components/graph/MilestoneNodeRenderer';
import { QuestTriggerRenderer } from '../../components/graph/QuestTriggerRenderer';
import { DefaultNodeRenderer } from '../../components/graph/DefaultNodeRenderer';

/**
 * Register all arc graph node renderers
 * Called on app initialization
 */
export function registerArcRenderers() {
  // Arc node - shows arc/story beat information
  nodeRendererRegistry.register({
    nodeType: 'arc',
    component: ArcNodeRenderer,
    defaultSize: { width: 240, height: 200 },
  });

  // Quest node - shows quest objective information
  nodeRendererRegistry.register({
    nodeType: 'quest',
    component: QuestNodeRenderer,
    defaultSize: { width: 240, height: 200 },
  });

  // Milestone node - shows major story checkpoint
  nodeRendererRegistry.register({
    nodeType: 'milestone',
    component: MilestoneNodeRenderer,
    defaultSize: { width: 240, height: 180 },
  });

  // Arc group uses default renderer
  nodeRendererRegistry.register({
    nodeType: 'arc_group',
    component: DefaultNodeRenderer,
    defaultSize: { width: 200, height: 120 },
  });

  // Quest trigger node - shows quest trigger information
  nodeRendererRegistry.register({
    nodeType: 'quest-trigger',
    component: QuestTriggerRenderer,
    defaultSize: { width: 280, height: 200 },
    preloadPriority: 7,
  });

  console.log('✓ Registered arc node renderers');
}
