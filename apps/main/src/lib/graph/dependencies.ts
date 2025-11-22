/**
 * Graph Dependency Tracking
 *
 * Provides pure functions for tracking dependencies between graph layers.
 * This module implements derived views rather than stored state to maintain
 * a single source of truth.
 *
 * Key design principles:
 * - Dependencies are computed on-demand, not stored
 * - Pure functions with no side effects
 * - Easy to test and reason about
 * - No sync burden (always reflects current state)
 *
 * Primary use case: Track which arc nodes reference which scenes,
 * enabling dependency-aware delete operations and usage indicators.
 */

import type { ArcGraph } from '../../modules/arc-graph';

/**
 * Arc-Scene dependency index
 *
 * Provides bidirectional lookup between arc nodes and scenes:
 * - sceneToArcNodes: Find all arc nodes that reference a scene
 * - arcNodeToScene: Find the scene referenced by an arc node
 */
export interface ArcSceneDependencyIndex {
  /** Map of sceneId → set of arc node IDs that reference it */
  sceneToArcNodes: Map<string, Set<string>>;
  /** Map of arc node ID → scene ID it references */
  arcNodeToScene: Map<string, string>;
}

/**
 * Build dependency index from all arc graphs.
 *
 * This is a pure function that computes the dependency index from
 * the current state of all arc graphs. It does not mutate any state.
 *
 * Time complexity: O(n) where n is total number of arc nodes across all graphs
 * Space complexity: O(m) where m is number of arc nodes with scene references
 *
 * @param arcGraphs - Record of all arc graphs (from arcGraphStore)
 * @returns Bidirectional dependency index
 */
export function buildArcSceneDependencyIndex(
  arcGraphs: Record<string, ArcGraph>
): ArcSceneDependencyIndex {
  const sceneToArcNodes = new Map<string, Set<string>>();
  const arcNodeToScene = new Map<string, string>();

  for (const graph of Object.values(arcGraphs)) {
    for (const node of graph.nodes) {
      // Only non-arc_group nodes can have scene references
      if (node.type !== 'arc_group' && node.sceneId) {
        // sceneId → arc nodes
        if (!sceneToArcNodes.has(node.sceneId)) {
          sceneToArcNodes.set(node.sceneId, new Set());
        }
        sceneToArcNodes.get(node.sceneId)!.add(node.id);

        // arc node → sceneId
        arcNodeToScene.set(node.id, node.sceneId);
      }
    }
  }

  return { sceneToArcNodes, arcNodeToScene };
}

/**
 * Get all arc nodes that reference a specific scene.
 *
 * This is useful for:
 * - Showing "used by N arcs" indicators in scene UI
 * - Warning before deleting a scene with dependencies
 * - Displaying dependency lists in modals
 *
 * @param index - Dependency index from buildArcSceneDependencyIndex
 * @param sceneId - Scene ID to look up
 * @returns Array of arc node IDs that reference the scene
 */
export function getArcNodesForScene(
  index: ArcSceneDependencyIndex,
  sceneId: string
): string[] {
  return Array.from(index.sceneToArcNodes.get(sceneId) || []);
}

/**
 * Get the scene referenced by an arc node.
 *
 * This is useful for:
 * - Displaying scene info in arc node tooltips
 * - Validating scene references
 * - Navigation from arc nodes to scenes
 *
 * @param index - Dependency index from buildArcSceneDependencyIndex
 * @param arcNodeId - Arc node ID to look up
 * @returns Scene ID referenced by the arc node, or undefined
 */
export function getSceneForArcNode(
  index: ArcSceneDependencyIndex,
  arcNodeId: string
): string | undefined {
  return index.arcNodeToScene.get(arcNodeId);
}

/**
 * Check if a scene has any arc node dependencies.
 *
 * This is useful for:
 * - Showing delete warnings ("This scene is used by 3 arcs")
 * - Enabling/disabling delete buttons
 * - Quick dependency checks without fetching full lists
 *
 * @param index - Dependency index from buildArcSceneDependencyIndex
 * @param sceneId - Scene ID to check
 * @returns True if any arc nodes reference this scene
 */
export function sceneHasDependencies(
  index: ArcSceneDependencyIndex,
  sceneId: string
): boolean {
  return (index.sceneToArcNodes.get(sceneId)?.size ?? 0) > 0;
}

/**
 * Get dependency count for a scene.
 *
 * This is useful for displaying exact counts in UI
 * (e.g., "Used by 3 arc nodes").
 *
 * @param index - Dependency index from buildArcSceneDependencyIndex
 * @param sceneId - Scene ID to check
 * @returns Number of arc nodes that reference this scene
 */
export function getDependencyCount(
  index: ArcSceneDependencyIndex,
  sceneId: string
): number {
  return index.sceneToArcNodes.get(sceneId)?.size ?? 0;
}
