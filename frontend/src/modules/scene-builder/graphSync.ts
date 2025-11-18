import type { Node, Edge } from 'reactflow';
import type { DraftScene, DraftSceneNode, NodeGroupData } from './index';

/**
 * Graph Sync Utilities
 * Converts scene-builder draft data to/from React Flow structures
 */

// Map DraftSceneNode to React Flow Node
export function toFlowNode(draftNode: DraftSceneNode, isStart: boolean, parentNodeId?: string): Node {
  let position = draftNode.metadata?.position || { x: 100, y: 100 };

  // Validate position values
  if (
    typeof position.x !== 'number' ||
    typeof position.y !== 'number' ||
    !isFinite(position.x) ||
    !isFinite(position.y) ||
    isNaN(position.x) ||
    isNaN(position.y)
  ) {
    console.warn('[graphSync] Invalid position for node', draftNode.id, position);
    position = { x: 100, y: 100 };
  }

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

  // Define reasonable bounds for node positions (10,000 x 10,000 canvas)
  const MAX_POSITION = 10000;
  const MIN_POSITION = -10000;

  changes.forEach((change) => {
    if (change.type === 'position' && change.position && !change.dragging) {
      const node = nodes.find((n) => n.id === change.id);
      if (node) {
        const pos = change.position;

        // Validate position values
        if (
          typeof pos.x !== 'number' ||
          typeof pos.y !== 'number' ||
          !isFinite(pos.x) ||
          !isFinite(pos.y) ||
          isNaN(pos.x) ||
          isNaN(pos.y)
        ) {
          console.warn('[graphSync] Invalid position values for node', change.id, pos);
          return; // Skip this update
        }

        // Apply bounds checking
        const boundedPosition = {
          x: Math.max(MIN_POSITION, Math.min(MAX_POSITION, pos.x)),
          y: Math.max(MIN_POSITION, Math.min(MAX_POSITION, pos.y)),
        };

        // Warn if position was clamped
        if (boundedPosition.x !== pos.x || boundedPosition.y !== pos.y) {
          console.warn('[graphSync] Position clamped for node', change.id, 'from', pos, 'to', boundedPosition);
        }

        updates.push({
          nodeId: change.id,
          position: boundedPosition,
        });
      }
    }
  });

  return updates;
}
