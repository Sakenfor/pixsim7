import type { StateCreator, GraphState } from './types';
import type { NodeGroupData, DraftSceneNode } from '@/modules/scene-builder';
import { logEvent } from '@/lib/logging';
import { useToastStore } from '@pixsim7/shared.ui';

/**
 * Node Group Slice
 *
 * Handles node group operations:
 * - Create groups from selected nodes
 * - Add/remove nodes to/from groups
 * - Collapse/expand groups
 * - Navigate (zoom) into groups
 */

export interface NodeGroupManagementState {
  // Create a new group containing specified nodes
  createNodeGroup: (
    nodeIds: string[],
    options?: {
      label?: string;
      color?: string;
      icon?: string;
      description?: string;
    }
  ) => string | null;

  // Add nodes to an existing group
  addNodesToGroup: (groupId: string, nodeIds: string[]) => void;

  // Remove nodes from a group
  removeNodesFromGroup: (groupId: string, nodeIds: string[]) => void;

  // Delete a group (optionally delete children too)
  deleteNodeGroup: (groupId: string, deleteChildren?: boolean) => void;

  // Toggle group collapsed state
  toggleGroupCollapsed: (groupId: string) => void;

  // Get all nodes in a group
  getGroupChildren: (groupId: string) => DraftSceneNode[];

  // Find which group a node belongs to
  getNodeGroup: (nodeId: string) => NodeGroupData | null;

  // Get all groups in current scene
  listNodeGroups: () => NodeGroupData[];
}

export const createNodeGroupSlice: StateCreator<NodeGroupManagementState> = (set, get, _api) => ({
  createNodeGroup: (nodeIds, options = {}) => {
    const state = get();
    if (!state.currentSceneId) {
      const errorMsg = 'No current scene selected';
      console.warn('[nodeGroupSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'warning',
        message: errorMsg,
        duration: 4000,
      });
      return null;
    }

    const scene = state.scenes[state.currentSceneId];
    if (!scene) return null;

    // Validate all nodes exist
    const validNodeIds = nodeIds.filter((id) => scene.nodes.some((n) => n.id === id));
    if (validNodeIds.length === 0) {
      const errorMsg = 'No valid nodes to group';
      console.warn('[nodeGroupSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'warning',
        message: errorMsg,
        duration: 4000,
      });
      return null;
    }

    // Generate group ID
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate group position (center of all contained nodes)
    const positions = validNodeIds
      .map((id) => {
        const node = scene.nodes.find((n) => n.id === id);
        return node?.metadata?.position as { x: number; y: number } | undefined;
      })
      .filter(Boolean) as Array<{ x: number; y: number }>;

    const avgX = positions.length > 0 ? positions.reduce((sum, p) => sum + p.x, 0) / positions.length : 100;
    const avgY = positions.length > 0 ? positions.reduce((sum, p) => sum + p.y, 0) / positions.length : 100;

    // Create group node
    const groupNode: NodeGroupData = {
      id: groupId,
      type: 'node_group',
      childNodeIds: validNodeIds,
      collapsed: false,
      color: options.color || '#3b82f6',
      icon: options.icon || '📁',
      description: options.description,
      metadata: {
        label: options.label || `Group ${scene.nodes.filter((n) => n.type === 'node_group').length + 1}`,
        position: { x: avgX, y: avgY },
      },
    };

    set(
      (state) => {
        if (!state.currentSceneId) return state;
        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes: [...scene.nodes, groupNode],
              updatedAt: new Date().toISOString(),
            },
          },
        } as Partial<GraphState>;
      },
      false,
      'createNodeGroup'
    );

    logEvent('DEBUG', 'node_group_created', { groupId, nodeCount: validNodeIds.length });
    return groupId;
  },

  addNodesToGroup: (groupId, nodeIds) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;
        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const groupNode = scene.nodes.find((n) => n.id === groupId && n.type === 'node_group') as
          | NodeGroupData
          | undefined;
        if (!groupNode) {
          const errorMsg = `Group '${groupId}' not found`;
          console.warn('[nodeGroupSlice]', errorMsg);
          useToastStore.getState().addToast({
            type: 'warning',
            message: errorMsg,
            duration: 4000,
          });
          return state;
        }

        // Validate nodes exist
        const validNodeIds = nodeIds.filter((id) => scene.nodes.some((n) => n.id === id));

        // Show warning if some nodes were invalid
        if (validNodeIds.length < nodeIds.length) {
          const invalidCount = nodeIds.length - validNodeIds.length;
          useToastStore.getState().addToast({
            type: 'warning',
            message: `${invalidCount} invalid node(s) were skipped`,
            duration: 3000,
          });
        }
        const newChildIds = Array.from(new Set([...groupNode.childNodeIds, ...validNodeIds]));

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes: scene.nodes.map((n) =>
                n.id === groupId
                  ? ({ ...n, childNodeIds: newChildIds } as DraftSceneNode)
                  : n
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        } as Partial<GraphState>;
      },
      false,
      'addNodesToGroup'
    );
  },

  removeNodesFromGroup: (groupId, nodeIds) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;
        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const groupNode = scene.nodes.find((n) => n.id === groupId && n.type === 'node_group') as
          | NodeGroupData
          | undefined;
        if (!groupNode) return state;

        const newChildIds = groupNode.childNodeIds.filter((id) => !nodeIds.includes(id));

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes: scene.nodes.map((n) =>
                n.id === groupId
                  ? ({ ...n, childNodeIds: newChildIds } as DraftSceneNode)
                  : n
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        } as Partial<GraphState>;
      },
      false,
      'removeNodesFromGroup'
    );
  },

  deleteNodeGroup: (groupId, deleteChildren = false) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;
        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const groupNode = scene.nodes.find((n) => n.id === groupId && n.type === 'node_group') as
          | NodeGroupData
          | undefined;
        if (!groupNode) return state;

        let nodesToRemove = [groupId];
        if (deleteChildren) {
          nodesToRemove = [...nodesToRemove, ...groupNode.childNodeIds];
        }

        // If not deleting children, ensure children are cleaned up properly
        // Note: Children don't store parent references in DraftSceneNode, only in React Flow nodes
        // The parent relationship is rebuilt from group.childNodeIds during toFlowNodes conversion
        // When the group is deleted, children will automatically render without a parent on next render
        let updatedNodes = scene.nodes.filter((n) => !nodesToRemove.includes(n.id));

        // If keeping children, we don't need to modify them since:
        // 1. Positions are stored as absolute coordinates, not relative to parent
        // 2. parentNode is only set during React Flow conversion based on current groups
        // 3. Once the group is removed, children will render as top-level nodes

        if (!deleteChildren && groupNode.childNodeIds.length > 0) {
          logEvent('DEBUG', 'node_group_deleted_keeping_children', {
            groupId,
            childCount: groupNode.childNodeIds.length,
            childIds: groupNode.childNodeIds,
          });
        }

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes: updatedNodes,
              edges: scene.edges.filter(
                (e) => !nodesToRemove.includes(e.from) && !nodesToRemove.includes(e.to)
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        } as Partial<GraphState>;
      },
      false,
      'deleteNodeGroup'
    );
  },

  toggleGroupCollapsed: (groupId) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;
        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const groupNode = scene.nodes.find((n) => n.id === groupId && n.type === 'node_group') as
          | NodeGroupData
          | undefined;
        if (!groupNode) return state;

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes: scene.nodes.map((n) =>
                n.id === groupId
                  ? ({ ...n, collapsed: !groupNode.collapsed } as DraftSceneNode)
                  : n
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        } as Partial<GraphState>;
      },
      false,
      'toggleGroupCollapsed'
    );
  },

  getGroupChildren: (groupId) => {
    const state = get();
    if (!state.currentSceneId) return [];

    const scene = state.scenes[state.currentSceneId];
    if (!scene) return [];

    const groupNode = scene.nodes.find((n) => n.id === groupId && n.type === 'node_group') as
      | NodeGroupData
      | undefined;
    if (!groupNode) return [];

    return scene.nodes.filter((n) => groupNode.childNodeIds.includes(n.id));
  },

  getNodeGroup: (nodeId) => {
    const state = get();
    if (!state.currentSceneId) return null;

    const scene = state.scenes[state.currentSceneId];
    if (!scene) return null;

    const groupNode = scene.nodes.find(
      (n) => n.type === 'node_group' && (n as NodeGroupData).childNodeIds.includes(nodeId)
    ) as NodeGroupData | undefined;

    return groupNode || null;
  },

  listNodeGroups: () => {
    const state = get();
    if (!state.currentSceneId) return [];

    const scene = state.scenes[state.currentSceneId];
    if (!scene) return [];

    return scene.nodes.filter((n) => n.type === 'node_group') as NodeGroupData[];
  },
});
