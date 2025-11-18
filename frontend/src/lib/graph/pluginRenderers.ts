import { nodeRendererRegistry } from './nodeRendererRegistry';
import { SeductionNodeRenderer } from '../../components/graph/SeductionNodeRenderer';
import { QuestTriggerRenderer } from '../../components/graph/QuestTriggerRenderer';

/**
 * Register all plugin node renderers
 * Called on app initialization after built-in renderers
 */
export function registerPluginRenderers() {
  // Seduction node - shows stages and progress
  nodeRendererRegistry.register({
    nodeType: 'seduction',
    component: SeductionNodeRenderer,
    defaultSize: { width: 220, height: 200 },
  });

  // Quest trigger node - shows quest info and objectives
  nodeRendererRegistry.register({
    nodeType: 'quest-trigger',
    component: QuestTriggerRenderer,
    defaultSize: { width: 240, height: 220 },
  });

  console.log('✓ Registered plugin node renderers:', 2);
}
