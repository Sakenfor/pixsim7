/**
 * Asset Context Resolver
 *
 * Type-safe convenience wrapper for asset context menu registration.
 * Uses Pattern B (component-level hook) since assets are fetched via API
 * and not stored in a global store with getById.
 *
 * Usage:
 * ```tsx
 * function AssetCard({ asset }) {
 *   const ctxProps = useAssetContextMenu(asset);
 *   return <div {...ctxProps}>...</div>;
 * }
 * ```
 *
 * For direct use of the generic pattern:
 * ```tsx
 * import { useContextMenuItem } from '@lib/dockview/contextMenu';
 *
 * const ctxProps = useContextMenuItem('asset', asset.id, { ... }, [deps]);
 * return <div {...ctxProps}>...</div>;
 * ```
 */

import { useContextMenuItem, type ContextMenuAttrs } from '@lib/dockview/contextMenu';
import type { AssetResponse } from './api';

/**
 * Hook for asset context menu: registers data + returns attrs.
 * Type-safe wrapper around useContextMenuItem for assets.
 *
 * Dependencies include all fields used in the data object to ensure
 * context menu always has fresh data.
 *
 * @returns Props to spread on the element
 */
export function useAssetContextMenu(
  asset: AssetResponse | null | undefined,
): ContextMenuAttrs | Record<string, never> {
  const isLocalOnly = asset
    ? asset.provider_status === 'local_only' || !asset.remote_url
    : false;

  return useContextMenuItem(
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
      : { name: undefined },
    // Include all fields that affect the data object
    [
      asset?.id,
      asset?.description,
      asset?.provider_asset_id,
      asset?.media_type,
      asset?.provider_id,
      asset?.thumbnail_url,
      asset?.provider_status,
      asset?.remote_url,
    ],
  );
}

/** @deprecated Use useAssetContextMenu instead */
export const useRegisterAssetContext = useAssetContextMenu;
