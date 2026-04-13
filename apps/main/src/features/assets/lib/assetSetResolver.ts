/**
 * Asset Set Resolver
 *
 * Pure async functions (no React) to resolve an AssetSet into concrete assets.
 * Used by generation strategies to expand set references into InputItem arrays.
 */

import { getAsset, listAssets } from '@lib/api/assets';

import type { InputItem } from '@features/generation/stores/generationInputStore';

import { fromAssetResponse, fromAssetResponses } from '../models/asset';
import type { AssetModel } from '../models/asset';
import type { AssetSet } from '../stores/assetSetStore';

import { isBackendAssetId } from './backendAssetId';

const DEFAULT_SMART_MAX_RESULTS = 100;

/**
 * Resolve an AssetSet to concrete AssetModel[].
 *
 * - Manual sets: fetches each asset by ID, silently drops missing/failed ones.
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
  const results = await Promise.allSettled(
    validIds.map((id) => getAsset(id)),
  );

  const assets: AssetModel[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      assets.push(fromAssetResponse(result.value));
    }
    // Silently skip failed/deleted assets
  }
  return assets;
}

async function resolveSmartSet(
  filters: Record<string, any>,
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
