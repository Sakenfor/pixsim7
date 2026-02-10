import type { NodeTypes } from 'reactflow';

import { SceneNode, NodeGroup } from '@features/graph';

// Default edge options (defined outside component to avoid re-creating on every render)
export const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  animated: false,
};

// Stable node type registry to satisfy React Flow error #002
export const nodeTypes: NodeTypes = {
  scene: SceneNode,
  group: NodeGroup,
};
