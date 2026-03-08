import type { AssetModel } from '../hooks/useAssets';

/**
 * Cluster-by dimension — which asset field to cluster on.
 */
export type ClusterByDimension = 'prompt' | 'generation' | 'sibling';

export const CLUSTER_BY_OPTIONS: { value: ClusterByDimension; label: string }[] = [
  { value: 'prompt', label: 'Prompt' },
  { value: 'generation', label: 'Generation' },
  { value: 'sibling', label: 'Sibling hash' },
];

/**
 * A cluster of 2+ assets that share a key.
 */
export interface AssetCluster {
  kind: 'cluster';
  /** The shared key value */
  key: string;
  /** Human-readable label for the cluster */
  label: string;
  /** All assets in this cluster */
  assets: AssetModel[];
  /** Index of the first asset in the original list (used for ordering) */
  firstIndex: number;
}

export type ClusterItem = AssetModel | AssetCluster;

export function isCluster(item: ClusterItem): item is AssetCluster {
  return (item as AssetCluster).kind === 'cluster';
}

/**
 * Extract the cluster key from an asset based on the chosen dimension.
 */
function extractClusterKey(asset: AssetModel, dimension: ClusterByDimension): string | null {
  switch (dimension) {
    case 'prompt':
      return asset.prompt?.trim() || null;
    case 'generation':
      return asset.sourceGenerationId != null ? String(asset.sourceGenerationId) : null;
    case 'sibling':
      return asset.reproducibleHash?.trim() || null;
    default:
      return null;
  }
}

/**
 * Build a display label for a cluster.
 */
function buildClusterLabel(key: string, dimension: ClusterByDimension, count: number): string {
  switch (dimension) {
    case 'prompt':
      return key.length > 60 ? `${key.slice(0, 57)}...` : key;
    case 'generation':
      return `Generation #${key}`;
    case 'sibling':
      return `Sibling ${key.slice(0, 8)}`;
    default:
      return `${count} items`;
  }
}

/**
 * Cluster a flat list of assets by a shared dimension.
 *
 * Assets that share the same key are grouped into an AssetCluster.
 * Assets with no key or a unique key stay as standalone AssetModel items.
 * The output preserves the original order: each cluster appears at the
 * position of its first member, and singletons stay in place.
 */
export function clusterAssets(
  assets: AssetModel[],
  dimension: ClusterByDimension,
): ClusterItem[] {
  // 1. Group assets by key, tracking the index of the first occurrence.
  const groups = new Map<string, { assets: AssetModel[]; firstIndex: number }>();
  const ungrouped: { asset: AssetModel; index: number }[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const key = extractClusterKey(asset, dimension);
    if (!key) {
      ungrouped.push({ asset, index: i });
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.assets.push(asset);
    } else {
      groups.set(key, { assets: [asset], firstIndex: i });
    }
  }

  // 2. Build output entries: clusters for groups of 2+, singles for the rest.
  type OutputEntry = { item: ClusterItem; index: number };
  const entries: OutputEntry[] = [];

  for (const [key, group] of groups) {
    if (group.assets.length >= 2) {
      entries.push({
        item: {
          kind: 'cluster',
          key,
          label: buildClusterLabel(key, dimension, group.assets.length),
          assets: group.assets,
          firstIndex: group.firstIndex,
        },
        index: group.firstIndex,
      });
    } else {
      // Singleton — keep as regular asset at its original index.
      entries.push({ item: group.assets[0], index: group.firstIndex });
    }
  }

  // Add ungrouped (no key) items.
  for (const { asset, index } of ungrouped) {
    entries.push({ item: asset, index });
  }

  // 3. Sort by original position to preserve visual order.
  entries.sort((a, b) => a.index - b.index);

  return entries.map((e) => e.item);
}
