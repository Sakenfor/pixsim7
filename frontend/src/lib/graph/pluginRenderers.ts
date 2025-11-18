import { registerRendererFromNodeType } from './rendererBootstrap';
import { SeductionNodeRenderer } from '../../components/graph/SeductionNodeRenderer';
import { QuestTriggerRenderer } from '../../components/graph/QuestTriggerRenderer';

/**
 * Register all plugin node renderers
 * Called on app initialization after built-in renderers
 *
 * Note: Uses registerRendererFromNodeType() to automatically inherit
 * preloadPriority from the node type definitions. Plugin node types
 * can specify their own preloadPriority in their definitions.
 */
export function registerPluginRenderers() {
  // Seduction node - shows stages and progress
  // Priority inherited from plugin node type definition
  registerRendererFromNodeType({
    nodeType: 'seduction',
    component: SeductionNodeRenderer,
    defaultSize: { width: 220, height: 200 },
  });

  // Quest trigger node - shows quest info and objectives
  // Priority inherited from plugin node type definition
  registerRendererFromNodeType({
    nodeType: 'quest-trigger',
    component: QuestTriggerRenderer,
    defaultSize: { width: 240, height: 220 },
  });

  console.log('✓ Registered plugin node renderers');
}
