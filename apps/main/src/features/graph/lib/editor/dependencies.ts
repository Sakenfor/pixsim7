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

import type { ArcGraph } from '@features/graph/domain/arcGraph';
import type { SceneCollection } from '@domain/sceneCollection';
import type { Campaign } from '@domain/campaign';
import type { DraftScene } from '@domain/sceneBuilder';

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

/**
 * Complete dependency index across all graph layers
 *
 * Provides bidirectional lookup between all layers:
 * - Scene → Arc nodes
 * - Scene → Collections
 * - Collection → Scenes
 * - Arc → Collections
 * - Collection → Arcs
 * - Arc → Campaigns
 * - Campaign → Arcs
 * - Collection → Campaigns
 * - Campaign → Collections
 */
export interface CompleteDependencyIndex {
  // Existing arc → scene dependencies
  sceneToArcNodes: Map<string, Set<string>>;
  arcNodeToScene: Map<string, string>;

  // New collection → scene dependencies
  sceneToCollections: Map<string, Set<string>>;
  collectionToScenes: Map<string, Set<string>>;

  // New collection → arc dependencies
  arcToCollections: Map<string, Set<string>>;
  collectionToArcs: Map<string, Set<string>>;

  // New campaign → arc dependencies
  arcToCampaigns: Map<string, Set<string>>;
  campaignToArcs: Map<string, Set<string>>;

  // Collection → campaign dependencies
  collectionToCampaigns: Map<string, Set<string>>;
  campaignToCollections: Map<string, Set<string>>;
}

/**
 * Build complete dependency index from all graph layers.
 *
 * This is a pure function that computes the complete dependency index from
 * the current state of all graphs, collections, and campaigns.
 *
 * @param scenes - Record of all draft scenes
 * @param arcGraphs - Record of all arc graphs
 * @param collections - Record of all scene collections
 * @param campaigns - Record of all campaigns
 * @returns Complete bidirectional dependency index
 */
export function buildCompleteDependencyIndex(
  scenes: Record<string, DraftScene>,
  arcGraphs: Record<string, ArcGraph>,
  collections: Record<string, SceneCollection>,
  campaigns: Record<string, Campaign>
): CompleteDependencyIndex {
  const sceneToArcNodes = new Map<string, Set<string>>();
  const arcNodeToScene = new Map<string, string>();
  const sceneToCollections = new Map<string, Set<string>>();
  const collectionToScenes = new Map<string, Set<string>>();
  const arcToCollections = new Map<string, Set<string>>();
  const collectionToArcs = new Map<string, Set<string>>();
  const arcToCampaigns = new Map<string, Set<string>>();
  const campaignToArcs = new Map<string, Set<string>>();
  const collectionToCampaigns = new Map<string, Set<string>>();
  const campaignToCollections = new Map<string, Set<string>>();

  // Build arc → scene dependencies
  for (const graph of Object.values(arcGraphs)) {
    for (const node of graph.nodes) {
      if (node.type !== 'arc_group' && node.sceneId) {
        if (!sceneToArcNodes.has(node.sceneId)) {
          sceneToArcNodes.set(node.sceneId, new Set());
        }
        sceneToArcNodes.get(node.sceneId)!.add(node.id);
        arcNodeToScene.set(node.id, node.sceneId);
      }
    }
  }

  // Build collection → scene dependencies
  for (const collection of Object.values(collections)) {
    for (const scene of collection.scenes) {
      // Scene → Collections
      if (!sceneToCollections.has(scene.sceneId)) {
        sceneToCollections.set(scene.sceneId, new Set());
      }
      sceneToCollections.get(scene.sceneId)!.add(collection.id);

      // Collection → Scenes
      if (!collectionToScenes.has(collection.id)) {
        collectionToScenes.set(collection.id, new Set());
      }
      collectionToScenes.get(collection.id)!.add(scene.sceneId);
    }

    // Collection → Arc dependencies
    if (collection.arcGraphId) {
      if (!arcToCollections.has(collection.arcGraphId)) {
        arcToCollections.set(collection.arcGraphId, new Set());
      }
      arcToCollections.get(collection.arcGraphId)!.add(collection.id);

      if (!collectionToArcs.has(collection.id)) {
        collectionToArcs.set(collection.id, new Set());
      }
      collectionToArcs.get(collection.id)!.add(collection.arcGraphId);
    }

    // Collection → Campaign dependencies
    if (collection.campaignId) {
      if (!collectionToCampaigns.has(collection.id)) {
        collectionToCampaigns.set(collection.id, new Set());
      }
      collectionToCampaigns.get(collection.id)!.add(collection.campaignId);

      if (!campaignToCollections.has(collection.campaignId)) {
        campaignToCollections.set(collection.campaignId, new Set());
      }
      campaignToCollections.get(collection.campaignId)!.add(collection.id);
    }
  }

  // Build campaign → arc dependencies
  for (const campaign of Object.values(campaigns)) {
    for (const arc of campaign.arcs) {
      // Arc → Campaigns
      if (!arcToCampaigns.has(arc.arcGraphId)) {
        arcToCampaigns.set(arc.arcGraphId, new Set());
      }
      arcToCampaigns.get(arc.arcGraphId)!.add(campaign.id);

      // Campaign → Arcs
      if (!campaignToArcs.has(campaign.id)) {
        campaignToArcs.set(campaign.id, new Set());
      }
      campaignToArcs.get(campaign.id)!.add(arc.arcGraphId);
    }

    // Campaign → Collections via collectionIds
    if (campaign.collectionIds) {
      for (const collectionId of campaign.collectionIds) {
        if (!campaignToCollections.has(campaign.id)) {
          campaignToCollections.set(campaign.id, new Set());
        }
        campaignToCollections.get(campaign.id)!.add(collectionId);

        if (!collectionToCampaigns.has(collectionId)) {
          collectionToCampaigns.set(collectionId, new Set());
        }
        collectionToCampaigns.get(collectionId)!.add(campaign.id);
      }
    }
  }

  return {
    sceneToArcNodes,
    arcNodeToScene,
    sceneToCollections,
    collectionToScenes,
    arcToCollections,
    collectionToArcs,
    arcToCampaigns,
    campaignToArcs,
    collectionToCampaigns,
    campaignToCollections,
  };
}

/**
 * Check if a scene has any dependencies across all layers.
 *
 * This checks:
 * - Arc node references
 * - Scene collection memberships
 *
 * @param index - Complete dependency index
 * @param sceneId - Scene ID to check
 * @returns Object with dependency information
 */
export function sceneHasAnyDependencies(
  index: CompleteDependencyIndex,
  sceneId: string
): {
  hasArcDeps: boolean;
  hasCollectionDeps: boolean;
  totalDeps: number;
} {
  const arcDeps = index.sceneToArcNodes.get(sceneId)?.size ?? 0;
  const collectionDeps = index.sceneToCollections.get(sceneId)?.size ?? 0;

  return {
    hasArcDeps: arcDeps > 0,
    hasCollectionDeps: collectionDeps > 0,
    totalDeps: arcDeps + collectionDeps,
  };
}

/**
 * Check if an arc graph has campaign dependencies.
 *
 * @param index - Complete dependency index
 * @param arcGraphId - Arc graph ID to check
 * @returns True if any campaigns reference this arc graph
 */
export function arcHasCampaignDependencies(
  index: CompleteDependencyIndex,
  arcGraphId: string
): boolean {
  return (index.arcToCampaigns.get(arcGraphId)?.size ?? 0) > 0;
}

/**
 * Check if a collection has any dependencies.
 *
 * @param index - Complete dependency index
 * @param collectionId - Collection ID to check
 * @returns Object with dependency information
 */
export function collectionHasDependencies(
  index: CompleteDependencyIndex,
  collectionId: string
): {
  hasArcDeps: boolean;
  hasCampaignDeps: boolean;
  totalDeps: number;
} {
  const arcDeps = index.collectionToArcs.get(collectionId)?.size ?? 0;
  const campaignDeps = index.collectionToCampaigns.get(collectionId)?.size ?? 0;

  return {
    hasArcDeps: arcDeps > 0,
    hasCampaignDeps: campaignDeps > 0,
    totalDeps: arcDeps + campaignDeps,
  };
}

/**
 * Get all collections that reference a specific scene.
 *
 * @param index - Complete dependency index
 * @param sceneId - Scene ID to look up
 * @returns Array of collection IDs
 */
export function getCollectionsForScene(
  index: CompleteDependencyIndex,
  sceneId: string
): string[] {
  return Array.from(index.sceneToCollections.get(sceneId) || []);
}

/**
 * Get all campaigns that reference a specific arc graph.
 *
 * @param index - Complete dependency index
 * @param arcGraphId - Arc graph ID to look up
 * @returns Array of campaign IDs
 */
export function getCampaignsForArc(
  index: CompleteDependencyIndex,
  arcGraphId: string
): string[] {
  return Array.from(index.arcToCampaigns.get(arcGraphId) || []);
}
