import type { Node, Edge } from 'reactflow';
import type { DraftScene, DraftSceneNode, NodeGroupData } from './index';

/**
 * Graph Sync Utilities
 * Converts scene-builder draft data to/from React Flow structures
 */

// Map DraftSceneNode to React Flow Node
export function toFlowNode(draftNode: DraftSceneNode, isStart: boolean, parentNodeId?: string): Node {
  const position = draftNode.metadata?.position || { x: 100, y: 100 };

  // Determine React Flow node type
  const flowType = draftNode.type === 'node_group' ? 'group' : 'scene';

  const flowNode: Node = {
    id: draftNode.id,
    type: flowType,
    position,
    data: {
      label: draftNode.metadata?.label || draftNode.id,
      nodeType: draftNode.type,
      isStart,
      draftNode,
    },
  };

  // Set parent node if this node is inside a group
  if (parentNodeId) {
    flowNode.parentNode = parentNodeId;
    flowNode.extent = 'parent'; // Constrain to parent boundaries
  }

  // For group nodes, add dimensions
  if (draftNode.type === 'node_group') {
    const groupData = draftNode as NodeGroupData;
    flowNode.style = {
      width: groupData.width || 400,
      height: groupData.height || 300,
    };
  }

  return flowNode;
}

// Convert all draft nodes to React Flow nodes
export function toFlowNodes(draft: DraftScene | undefined | null): Node[] {
  if (!draft) return [];
  const startNodeId = draft.startNodeId;

  // Build parent-child mapping from groups
  const parentMap = new Map<string, string>(); // nodeId -> parentGroupId
  draft.nodes.forEach((node) => {
    if (node.type === 'node_group') {
      const groupNode = node as NodeGroupData;
      groupNode.childNodeIds?.forEach((childId) => {
        parentMap.set(childId, node.id);
      });
    }
  });

  // Convert nodes with parent relationships
  return draft.nodes.map((n) => {
    const parentId = parentMap.get(n.id);
    return toFlowNode(n, n.id === startNodeId, parentId);
  });
}

// Convert draft edges to React Flow edges
export function toFlowEdges(draft: DraftScene | undefined | null): Edge[] {
  if (!draft) return [];

  const flowEdges: Edge[] = [];

  // Use draft.edges with port metadata
  draft.edges.forEach((e, i) => {
    flowEdges.push({
      id: e.id || `edge_${i}`,
      source: e.from,
      target: e.to,
      sourceHandle: e.meta?.fromPort || 'default',
      targetHandle: e.meta?.toPort || 'input',
      type: 'smoothstep',
    });
  });

  return flowEdges;
}

import type { NodeChange } from 'reactflow';

/**
 * Extract node position updates from React Flow changes
 * Returns an array of { nodeId, position } for nodes that need updating
 * @param changes - React Flow node changes array
 * @param nodes - Current React Flow nodes (for looking up data)
 */
export function extractPositionUpdates(
  changes: NodeChange[],
  nodes: Node[]
): Array<{ nodeId: string; position: { x: number; y: number } }> {
  const updates: Array<{ nodeId: string; position: { x: number; y: number } }> = [];

  changes.forEach((change) => {
    if (change.type === 'position' && change.position && !change.dragging) {
      const node = nodes.find((n) => n.id === change.id);
      if (node) {
        updates.push({
          nodeId: change.id,
          position: change.position,
        });
      }
    }
  });

  return updates;
}
