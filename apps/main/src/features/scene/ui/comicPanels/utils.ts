import { Ref, isAssetRef } from '@pixsim7/ref-core';
import type { AssetRef } from '@pixsim7/shared.types';

const NUMERIC_ID_PATTERN = /^\d+$/;
const ASSET_REF_PATTERN = /^asset:(\d+)$/;

/**
 * Ensure an asset identifier is returned as a canonical AssetRef.
 * Returns null if the identifier cannot be normalized.
 */
export function ensureAssetRef(assetId?: string | AssetRef | null): AssetRef | null {
  if (!assetId) {
    return null;
  }

  if (isAssetRef(assetId)) {
    return assetId;
  }

  if (NUMERIC_ID_PATTERN.test(assetId)) {
    return Ref.asset(Number(assetId));
  }

  const refMatch = ASSET_REF_PATTERN.exec(assetId);
  if (refMatch) {
    return Ref.asset(Number(refMatch[1]));
  }

  return null;
}

/**
 * Extract numeric asset ID suitable for API calls.
 * Supports both canonical AssetRef strings (asset:123) and legacy numeric IDs.
 */
export function extractNumericAssetId(assetId?: string | AssetRef | null): string | null {
  if (!assetId) {
    return null;
  }

  if (isAssetRef(assetId)) {
    const match = ASSET_REF_PATTERN.exec(assetId);
    return match ? match[1] : null;
  }

  if (NUMERIC_ID_PATTERN.test(assetId)) {
    return assetId;
  }

  const refMatch = ASSET_REF_PATTERN.exec(assetId);
  if (refMatch) {
    return refMatch[1];
  }

  return null;
}
