/**
 * Asset Set Resolver
 *
 * Pure async functions (no React) to resolve an AssetSet into concrete assets.
 * Used by generation strategies to expand set references into InputItem arrays.
 */

import { listAssets } from '@lib/api/assets';

import type { InputItem } from '@features/generation/stores/generationInputStore';

import { fromAssetResponses } from '../models/asset';
import type { AssetModel } from '../models/asset';
import type { AssetSet } from '../stores/assetSetStore';

import { isBackendAssetId } from './backendAssetId';

const DEFAULT_SMART_MAX_RESULTS = 100;
const MANUAL_SET_BATCH_SIZE = 100;

/**
 * Resolve an AssetSet to concrete AssetModel[].
 *
 * - Manual sets: batch-fetches asset IDs, preserves set order, drops missing ones.
 * - Smart sets: calls listAssets with the stored filters, capped at maxResults.
 */
export async function resolveAssetSet(set: AssetSet): Promise<AssetModel[]> {
  if (set.kind === 'manual') {
    return resolveManualSet(set.assetIds);
  }
  return resolveSmartSet(set.filters, set.maxResults);
}

async function resolveManualSet(assetIds: number[]): Promise<AssetModel[]> {
  const validIds = assetIds.filter(isBackendAssetId);
  if (validIds.length === 0) return [];

  const uniqueIds = Array.from(new Set(validIds));
  const byId = new Map<number, AssetModel>();
  const batches: number[][] = [];
  for (let i = 0; i < uniqueIds.length; i += MANUAL_SET_BATCH_SIZE) {
    batches.push(uniqueIds.slice(i, i + MANUAL_SET_BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batchIds) => {
      const response = await listAssets({
        asset_ids: batchIds,
        limit: batchIds.length,
        include_archived: true,
        include_total: false,
        searchable: null,
        filters: { asset_kind: null },
      });
      for (const asset of fromAssetResponses(response.assets)) {
        byId.set(asset.id, asset);
      }
    }),
  );

  // /assets/search returns in backend sort order, not manual-set member order.
  // Rebuild from the stored ids and silently drop deleted/inaccessible assets.
  return validIds
    .map((id) => byId.get(id))
    .filter((asset): asset is AssetModel => Boolean(asset));
}

async function resolveSmartSet(
  filters: Record<string, unknown>,
  maxResults?: number,
): Promise<AssetModel[]> {
  const limit = maxResults ?? DEFAULT_SMART_MAX_RESULTS;
  const response = await listAssets({ ...filters, limit });
  return fromAssetResponses(response.assets);
}

/**
 * Convert resolved AssetModels into InputItem shells for the combination system.
 */
export function assetModelsToInputItems(assets: AssetModel[]): InputItem[] {
  return assets.map((asset) => ({
    id: `set-${asset.id}-${Date.now()}`,
    asset,
    queuedAt: new Date().toISOString(),
  }));
}
