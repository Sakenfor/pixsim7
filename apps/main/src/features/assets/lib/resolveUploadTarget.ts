import { providerCapabilityRegistry } from '@features/providers/lib/core/capabilityRegistry';

import type { AssetModel } from '../models/asset';

/**
 * Get all providers that support the `asset_upload` feature.
 */
export function getUploadCapableProviders(): Array<{ providerId: string; name: string }> {
  return providerCapabilityRegistry
    .getAllCapabilities()
    .filter((cap) => cap.features?.asset_upload)
    .map((cap) => ({ providerId: cap.provider_id, name: cap.name ?? cap.provider_id }));
}

/**
 * Check whether an asset needs to be uploaded to a target provider before it can
 * be used for generation.
 *
 * Returns `true` when:
 * 1. `targetProviderId` is defined
 * 2. The target provider supports asset uploads (`asset_upload` feature)
 * 3. The asset is not already on that provider (not native and no cross-upload recorded)
 */
export function needsUploadToProvider(
  asset: AssetModel,
  targetProviderId: string | undefined,
): boolean {
  if (!targetProviderId) return false;
  if (!providerCapabilityRegistry.hasFeature(targetProviderId, 'asset_upload')) return false;
  if (asset.providerId === targetProviderId) return false;
  if (asset.providerUploads?.[targetProviderId]) return false;
  return true;
}

/**
 * Resolve the best upload target provider.
 *
 * Priority:
 * 1. The preferred provider (if it supports upload)
 * 2. The only available provider (if exactly one supports upload)
 * 3. null (caller should prompt the user)
 */
export function resolveUploadTarget(
  preferredProviderId: string | null,
): { providerId: string; name: string } | null {
  const capable = getUploadCapableProviders();
  if (capable.length === 0) return null;

  if (preferredProviderId) {
    const match = capable.find((p) => p.providerId === preferredProviderId);
    if (match) return match;
  }

  if (capable.length === 1) return capable[0];

  return null;
}
