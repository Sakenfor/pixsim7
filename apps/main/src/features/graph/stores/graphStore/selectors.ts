/**
 * Graph Store Selectors
 *
 * Memoized selectors for efficient state access.
 * Using selectors prevents unnecessary re-renders when unrelated state changes.
 *
 * Usage with useShallow:
 * ```ts
 * import { useShallow } from 'zustand/react/shallow';
 * import { selectNodeActions } from './selectors';
 *
 * const actions = useGraphStore(useShallow(selectNodeActions));
 * ```
 */

import type { GraphState } from './types';

// ===== Scene Selectors =====

/** Select the current scene (derived from scenes + currentSceneId) */
export const selectCurrentScene = (state: GraphState) =>
  state.currentSceneId ? state.scenes[state.currentSceneId] ?? null : null;

/** Select current scene ID only */
export const selectCurrentSceneId = (state: GraphState) => state.currentSceneId;

/** Select all scenes */
export const selectScenes = (state: GraphState) => state.scenes;

/** Select scene count */
export const selectSceneCount = (state: GraphState) => Object.keys(state.scenes).length;

// ===== Node Selectors =====

/** Select nodes from current scene */
export const selectCurrentNodes = (state: GraphState) => {
  const scene = selectCurrentScene(state);
  return scene?.nodes ?? [];
};

/** Select edges from current scene */
export const selectCurrentEdges = (state: GraphState) => {
  const scene = selectCurrentScene(state);
  return scene?.edges ?? [];
};

/** Select node count in current scene */
export const selectNodeCount = (state: GraphState) => selectCurrentNodes(state).length;

/** Select edge count in current scene */
export const selectEdgeCount = (state: GraphState) => selectCurrentEdges(state).length;

// ===== Action Selectors (for useShallow) =====

/** Select node management actions */
export const selectNodeActions = (state: GraphState) => ({
  addNode: state.addNode,
  updateNode: state.updateNode,
  removeNode: state.removeNode,
  connectNodes: state.connectNodes,
  setStartNode: state.setStartNode,
});

/** Select scene management actions */
export const selectSceneActions = (state: GraphState) => ({
  createScene: state.createScene,
  deleteScene: state.deleteScene,
  duplicateScene: state.duplicateScene,
  loadScene: state.loadScene,
  renameScene: state.renameScene,
});

/** Select node group actions */
export const selectNodeGroupActions = (state: GraphState) => ({
  createNodeGroup: state.createNodeGroup,
  addNodesToGroup: state.addNodesToGroup,
  removeNodesFromGroup: state.removeNodesFromGroup,
  deleteNodeGroup: state.deleteNodeGroup,
  toggleGroupCollapsed: state.toggleGroupCollapsed,
  getGroupChildren: state.getGroupChildren,
  getNodeGroup: state.getNodeGroup,
});

/** Select navigation actions */
export const selectNavigationActions = (state: GraphState) => ({
  zoomIntoGroup: state.zoomIntoGroup,
  zoomOut: state.zoomOut,
  zoomToRoot: state.zoomToRoot,
  getCurrentZoomLevel: state.getCurrentZoomLevel,
  getNavigationBreadcrumbs: state.getNavigationBreadcrumbs,
});

// ===== Combined Selectors =====

/** Select stats for GraphCubeExpansion */
export const selectGraphStats = (state: GraphState) => {
  const scene = selectCurrentScene(state);
  const sceneCount = selectSceneCount(state);

  let edgeCount = 0;
  if (scene?.edges && scene.edges.length > 0) {
    edgeCount = scene.edges.length;
  } else if (scene?.nodes) {
    for (const node of scene.nodes) {
      const legacyNode = node as { connections?: string[] };
      if (Array.isArray(legacyNode.connections)) {
        edgeCount += legacyNode.connections.length;
      }
    }
  }

  return {
    sceneCount,
    nodeCount: scene?.nodes?.length ?? 0,
    edgeCount,
    title: scene?.title ?? 'Untitled Scene',
    currentSceneId: state.currentSceneId,
  };
};

// ===== Equality Functions =====

/**
 * Shallow compare for action objects.
 * Since actions are stable function references, we can use reference equality.
 */
export const actionsEqual = <T extends Record<string, unknown>>(a: T, b: T): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
};
