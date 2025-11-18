import { registerRendererFromNodeType } from './rendererBootstrap';
import { DefaultNodeRenderer } from '../../components/graph/DefaultNodeRenderer';
import { VideoNodeRenderer } from '../../components/graph/VideoNodeRenderer';
import { ChoiceNodeRenderer } from '../../components/graph/ChoiceNodeRenderer';

/**
 * Register all built-in node renderers
 * Called on app initialization
 *
 * Note: Uses registerRendererFromNodeType() to automatically inherit
 * preloadPriority from the node type definitions.
 */
export function registerBuiltinRenderers() {
  // Default fallback renderer - MUST be registered first
  // Highest priority since it's used as fallback
  registerRendererFromNodeType({
    nodeType: 'default',
    component: DefaultNodeRenderer,
    defaultSize: { width: 200, height: 120 },
    preloadPriority: 10, // Critical - used as fallback
  });

  // Video node - shows media thumbnail and playback info
  // Priority inherited from node type (priority 10)
  registerRendererFromNodeType({
    nodeType: 'video',
    component: VideoNodeRenderer,
    defaultSize: { width: 220, height: 180 },
  });

  // Choice node - shows available choices
  // Priority inherited from node type (priority 9)
  registerRendererFromNodeType({
    nodeType: 'choice',
    component: ChoiceNodeRenderer,
    defaultSize: { width: 200, height: 150 },
  });

  // Mini-game nodes use the video renderer
  // Priority inherited from node type (priority 3)
  registerRendererFromNodeType({
    nodeType: 'miniGame',
    component: VideoNodeRenderer,
    defaultSize: { width: 220, height: 180 },
  });

  // Other node types use default renderer
  // Priority inherited from their respective node types
  const defaultNodeTypes = [
    'action',        // priority 6
    'condition',     // priority 7
    'end',           // priority 5
    'scene_call',    // priority 8
    'return',        // priority 5
    'generation',    // priority 2
    'node_group',    // priority 1
  ];

  defaultNodeTypes.forEach(nodeType => {
    registerRendererFromNodeType({
      nodeType,
      component: DefaultNodeRenderer,
      defaultSize: { width: 200, height: 120 },
    });
  });

  console.log('✓ Registered built-in node renderers');
}
