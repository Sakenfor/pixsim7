import { nodeRendererRegistry } from './nodeRendererRegistry';
import { DefaultNodeRenderer } from '../../components/graph/DefaultNodeRenderer';
import { VideoNodeRenderer } from '../../components/graph/VideoNodeRenderer';
import { ChoiceNodeRenderer } from '../../components/graph/ChoiceNodeRenderer';

/**
 * Register all built-in node renderers
 * Called on app initialization
 */
export function registerBuiltinRenderers() {
  // Default fallback renderer - MUST be registered first
  nodeRendererRegistry.register({
    nodeType: 'default',
    component: DefaultNodeRenderer,
    defaultSize: { width: 200, height: 120 },
  });

  // Video node - shows media thumbnail and playback info
  nodeRendererRegistry.register({
    nodeType: 'video',
    component: VideoNodeRenderer,
    defaultSize: { width: 220, height: 180 },
  });

  // Choice node - shows available choices
  nodeRendererRegistry.register({
    nodeType: 'choice',
    component: ChoiceNodeRenderer,
    defaultSize: { width: 200, height: 150 },
  });

  // Mini-game nodes use the video renderer
  nodeRendererRegistry.register({
    nodeType: 'miniGame',
    component: VideoNodeRenderer,
    defaultSize: { width: 220, height: 180 },
  });

  // Other node types use default renderer
  const defaultNodeTypes = [
    'action',
    'condition',
    'end',
    'scene_call',
    'return',
    'generation',
    'node_group',
  ];

  defaultNodeTypes.forEach(nodeType => {
    nodeRendererRegistry.register({
      nodeType,
      component: DefaultNodeRenderer,
      defaultSize: { width: 200, height: 120 },
    });
  });

  console.log('✓ Registered built-in node renderers:', nodeRendererRegistry.getAll().length);
}
