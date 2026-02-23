import { getAsset } from '@lib/api/assets';

import { fromAssetResponse, type AssetModel } from '../models/asset';

export interface HydrateAssetModelOptions {
  cache?: Map<number, AssetModel>;
  forceRefresh?: boolean;
  onError?: (error: unknown) => void;
}

/**
 * Returns true when an AssetModel looks like a placeholder/stub and should be
 * hydrated from API before using it as generation input.
 */
export function isStubAssetModel(asset: AssetModel): boolean {
  return (
    !asset.providerId
    || !asset.providerAssetId
    // Selected-asset fallback models use providerId='local' with null status.
    // Treat them as stubs so we can hydrate real provider metadata.
    || (asset.providerId === 'local' && asset.providerStatus == null)
  );
}

/**
 * Ensure we have a full AssetModel before adding to generation inputs.
 * - Uses in-memory cache when provided.
 * - Fetches from API only when needed (or when forceRefresh=true).
 * - Falls back to the original asset on fetch failure.
 */
export async function hydrateAssetModel(
  asset: AssetModel,
  { cache, forceRefresh = false, onError }: HydrateAssetModelOptions = {},
): Promise<AssetModel> {
  if (!forceRefresh) {
    const cached = cache?.get(asset.id);
    if (cached) {
      return cached;
    }

    if (!isStubAssetModel(asset)) {
      cache?.set(asset.id, asset);
      return asset;
    }
  }

  try {
    const hydrated = fromAssetResponse(await getAsset(asset.id));
    cache?.set(asset.id, hydrated);
    return hydrated;
  } catch (error) {
    // Cache fallback to avoid repeat fetch attempts for non-API assets.
    cache?.set(asset.id, asset);
    onError?.(error);
    return asset;
  }
}
