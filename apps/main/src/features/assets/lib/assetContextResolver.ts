/**
 * Asset Context Resolver
 *
 * Type-safe convenience wrappers for asset context menu registration.
 * Uses the generic useRegisterContextData() infrastructure.
 *
 * Usage:
 * ```tsx
 * function AssetCard({ asset }) {
 *   useRegisterAssetContext(asset);
 *   return <div {...contextMenuAttrs('asset', asset.id, asset.name)}>...</div>;
 * }
 * ```
 *
 * For direct use of the generic pattern:
 * ```tsx
 * import { useRegisterContextData, contextMenuAttrs } from '@lib/dockview/contextMenu';
 *
 * useRegisterContextData('asset', asset.id, { ... }, [asset.id, asset.updated_at]);
 * ```
 */

import { useRegisterContextData } from '@lib/dockview/contextMenu';
import type { AssetResponse } from './api';

/**
 * Hook to register an asset in the context cache.
 * Type-safe wrapper around useRegisterContextData for assets.
 *
 * Dependencies are limited to stable fields (id, updated_at) to avoid
 * re-registration thrash when the asset object reference changes.
 */
export function useRegisterAssetContext(asset: AssetResponse | null | undefined): void {
  const isLocalOnly = asset
    ? asset.provider_status === 'local_only' || !asset.remote_url
    : false;

  useRegisterContextData(
    'asset',
    asset?.id,
    asset
      ? {
          id: asset.id,
          name: asset.description || asset.provider_asset_id || `Asset ${asset.id}`,
          type: asset.media_type,
          asset, // full object for actions
          provider: asset.provider_id,
          providerAssetId: asset.provider_asset_id,
          thumbnailUrl: asset.thumbnail_url,
          isLocalOnly,
        }
      : {},
    [asset?.id, asset?.updated_at],
  );
}
