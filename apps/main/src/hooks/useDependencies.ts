/**
 * Dependency Tracking Hooks
 *
 * Provides React hooks for accessing dependency information across
 * all graph layers (scenes, arcs, collections, campaigns).
 *
 * These hooks compute dependencies on-demand and update automatically
 * when the underlying stores change.
 *
 * Usage:
 * ```tsx
 * function SceneCard({ sceneId }: { sceneId: string }) {
 *   const deps = useDependencies('scene', sceneId);
 *
 *   return (
 *     <div>
 *       <h3>Scene</h3>
 *       {deps.total > 0 && (
 *         <p>Used by {deps.total} items</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */

import { useMemo } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { useArcGraphStore } from '../stores/arcGraphStore';
import { useSceneCollectionStore } from '@domain/sceneCollection';
import { useCampaignStore } from '@domain/campaign';
import {
  buildCompleteDependencyIndex,
  getArcNodesForScene,
  getCollectionsForScene,
  getCampaignsForArc,
  type CompleteDependencyIndex,
} from '../lib/graph/dependencies';

/**
 * Dependency information for a single entity
 */
export interface DependencyInfo {
  /** Arc node IDs that reference this entity */
  arcNodes: string[];
  /** Collection IDs that reference this entity */
  collections: string[];
  /** Campaign IDs that reference this entity */
  campaigns: string[];
  /** Total number of dependencies */
  total: number;
}

/**
 * Hook to get the complete dependency index across all layers
 *
 * This hook builds the dependency index from all stores and
 * updates automatically when any store changes.
 *
 * @returns Complete dependency index
 */
export function useCompleteDependencyIndex(): CompleteDependencyIndex {
  const scenes = useGraphStore((state) => state.scenes);
  const arcGraphs = useArcGraphStore((state) => state.arcGraphs);
  const collections = useSceneCollectionStore((state) => state.collections);
  const campaigns = useCampaignStore((state) => state.campaigns);

  return useMemo(
    () => buildCompleteDependencyIndex(scenes, arcGraphs, collections, campaigns),
    [scenes, arcGraphs, collections, campaigns]
  );
}

/**
 * Hook to get dependency information for a specific entity
 *
 * This hook computes all dependencies for a given entity type and ID.
 * It updates automatically when dependencies change.
 *
 * @param type - Entity type (scene, arc, collection, campaign)
 * @param id - Entity ID
 * @returns Dependency information with breakdowns
 */
export function useDependencies(
  type: 'scene' | 'arc' | 'collection' | 'campaign',
  id: string
): DependencyInfo {
  const index = useCompleteDependencyIndex();

  return useMemo(() => {
    const result: DependencyInfo = {
      arcNodes: [],
      collections: [],
      campaigns: [],
      total: 0,
    };

    if (type === 'scene') {
      // Find arc nodes referencing this scene
      result.arcNodes = Array.from(index.sceneToArcNodes.get(id) || []);

      // Find collections containing this scene
      result.collections = Array.from(index.sceneToCollections.get(id) || []);
    }

    if (type === 'arc') {
      // Find collections using this arc
      result.collections = Array.from(index.arcToCollections.get(id) || []);

      // Find campaigns containing this arc
      result.campaigns = Array.from(index.arcToCampaigns.get(id) || []);
    }

    if (type === 'collection') {
      // Find campaigns using this collection
      result.campaigns = Array.from(index.collectionToCampaigns.get(id) || []);
    }

    // campaign has no dependencies to check (it's the top layer)

    result.total =
      result.arcNodes.length + result.collections.length + result.campaigns.length;
    return result;
  }, [type, id, index]);
}

/**
 * Hook to check if a scene has any dependencies
 *
 * This is a lightweight version of useDependencies that only
 * returns a boolean, useful for conditional rendering.
 *
 * @param sceneId - Scene ID to check
 * @returns True if scene has any dependencies
 */
export function useSceneHasDependencies(sceneId: string): boolean {
  const index = useCompleteDependencyIndex();

  return useMemo(() => {
    const arcDeps = index.sceneToArcNodes.get(sceneId)?.size ?? 0;
    const collectionDeps = index.sceneToCollections.get(sceneId)?.size ?? 0;
    return arcDeps + collectionDeps > 0;
  }, [sceneId, index]);
}

/**
 * Hook to check if an arc has any dependencies
 *
 * @param arcId - Arc graph ID to check
 * @returns True if arc has any dependencies
 */
export function useArcHasDependencies(arcId: string): boolean {
  const index = useCompleteDependencyIndex();

  return useMemo(() => {
    const collectionDeps = index.arcToCollections.get(arcId)?.size ?? 0;
    const campaignDeps = index.arcToCampaigns.get(arcId)?.size ?? 0;
    return collectionDeps + campaignDeps > 0;
  }, [arcId, index]);
}

/**
 * Hook to check if a collection has any dependencies
 *
 * @param collectionId - Collection ID to check
 * @returns True if collection has any dependencies
 */
export function useCollectionHasDependencies(collectionId: string): boolean {
  const index = useCompleteDependencyIndex();

  return useMemo(() => {
    const campaignDeps = index.collectionToCampaigns.get(collectionId)?.size ?? 0;
    return campaignDeps > 0;
  }, [collectionId, index]);
}

/**
 * Hook to get dependency count for an entity
 *
 * This is useful for displaying counts like "Used by 3 items"
 * without needing the full dependency breakdown.
 *
 * @param type - Entity type
 * @param id - Entity ID
 * @returns Total number of dependencies
 */
export function useDependencyCount(
  type: 'scene' | 'arc' | 'collection' | 'campaign',
  id: string
): number {
  const deps = useDependencies(type, id);
  return deps.total;
}

/**
 * Hook to get all arc nodes that reference a scene
 *
 * @param sceneId - Scene ID
 * @returns Array of arc node IDs
 */
export function useArcNodesForScene(sceneId: string): string[] {
  const index = useCompleteDependencyIndex();

  return useMemo(() => {
    return Array.from(index.sceneToArcNodes.get(sceneId) || []);
  }, [sceneId, index]);
}

/**
 * Hook to get all collections that contain a scene
 *
 * @param sceneId - Scene ID
 * @returns Array of collection IDs
 */
export function useCollectionsForScene(sceneId: string): string[] {
  const index = useCompleteDependencyIndex();

  return useMemo(() => {
    return Array.from(index.sceneToCollections.get(sceneId) || []);
  }, [sceneId, index]);
}

/**
 * Hook to get all campaigns that contain an arc
 *
 * @param arcId - Arc graph ID
 * @returns Array of campaign IDs
 */
export function useCampaignsForArc(arcId: string): string[] {
  const index = useCompleteDependencyIndex();

  return useMemo(() => {
    return Array.from(index.arcToCampaigns.get(arcId) || []);
  }, [arcId, index]);
}
