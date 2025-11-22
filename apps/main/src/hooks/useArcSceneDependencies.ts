/**
 * Arc-Scene Dependency Hooks
 *
 * React hooks for tracking dependencies between arc nodes and scenes.
 * These hooks use memoization to ensure efficient recomputation only
 * when the underlying arc graph state changes.
 *
 * Usage:
 * - useArcSceneDependencyIndex(): Get full dependency index
 * - useSceneArcDependencies(sceneId): Get arc nodes that reference a scene
 * - useArcSceneDependency(arcNodeId): Get scene referenced by an arc node
 * - useSceneHasDependencies(sceneId): Check if scene has dependencies
 * - useSceneDependencyCount(sceneId): Get count of dependencies
 */

import { useMemo } from 'react';
import { useArcGraphStore } from '../stores/arcGraphStore';
import {
  buildArcSceneDependencyIndex,
  getArcNodesForScene,
  getSceneForArcNode,
  sceneHasDependencies,
  getDependencyCount,
  type ArcSceneDependencyIndex,
} from '../lib/graph/dependencies';

/**
 * Hook to get the full dependency index.
 *
 * The index is memoized based on arc graph store state, so it only
 * recomputes when arc graphs change. This is efficient for scenarios
 * where you need to look up multiple dependencies.
 *
 * @returns Bidirectional dependency index
 */
export function useArcSceneDependencyIndex(): ArcSceneDependencyIndex {
  const arcGraphs = useArcGraphStore(s => s.arcGraphs);

  return useMemo(
    () => buildArcSceneDependencyIndex(arcGraphs),
    [arcGraphs]
  );
}

/**
 * Get all arc nodes that reference a specific scene.
 *
 * This hook is useful for:
 * - Displaying "Used by N arcs" in scene toolbars
 * - Showing dependency lists in delete confirmation modals
 * - Highlighting dependent arc nodes
 *
 * @param sceneId - Scene ID to look up
 * @returns Array of arc node IDs that reference the scene
 */
export function useSceneArcDependencies(sceneId: string): string[] {
  const index = useArcSceneDependencyIndex();

  return useMemo(
    () => getArcNodesForScene(index, sceneId),
    [index, sceneId]
  );
}

/**
 * Get the scene referenced by an arc node.
 *
 * This hook is useful for:
 * - Displaying scene info in arc node tooltips
 * - Navigation from arc nodes to scenes
 * - Validating scene references in UI
 *
 * @param arcNodeId - Arc node ID to look up
 * @returns Scene ID referenced by the arc node, or undefined
 */
export function useArcSceneDependency(arcNodeId: string): string | undefined {
  const index = useArcSceneDependencyIndex();

  return useMemo(
    () => getSceneForArcNode(index, arcNodeId),
    [index, arcNodeId]
  );
}

/**
 * Check if a scene has any dependencies (for delete warnings).
 *
 * This hook is useful for:
 * - Enabling/disabling delete buttons
 * - Showing warning badges
 * - Quick dependency checks without fetching full lists
 *
 * @param sceneId - Scene ID to check
 * @returns True if any arc nodes reference this scene
 */
export function useSceneHasDependencies(sceneId: string): boolean {
  const index = useArcSceneDependencyIndex();

  return useMemo(
    () => sceneHasDependencies(index, sceneId),
    [index, sceneId]
  );
}

/**
 * Get the count of arc nodes that reference a scene.
 *
 * This hook is useful for:
 * - Displaying exact counts in UI ("Used by 3 arc nodes")
 * - Sorting scenes by usage
 * - Analytics and reporting
 *
 * @param sceneId - Scene ID to check
 * @returns Number of arc nodes that reference this scene
 */
export function useSceneDependencyCount(sceneId: string): number {
  const index = useArcSceneDependencyIndex();

  return useMemo(
    () => getDependencyCount(index, sceneId),
    [index, sceneId]
  );
}
