/**
 * Asset Input
 *
 * Compact asset picker for the Gizmo Playground.
 * Uses the shared InlineAssetSearchPicker from the assets/pickers module.
 */

import { useCallback, useMemo } from 'react';

import {
  InlineAssetSearchPicker,
  type PickedAsset,
} from '@features/assets/components/pickers';

import { useGizmoLabStore } from '../../stores/gizmoLabStore';

export function AssetInput() {
  const assetId = useGizmoLabStore((s) => s.assetId);
  const assetUrl = useGizmoLabStore((s) => s.assetUrl);
  const assetMediaType = useGizmoLabStore((s) => s.assetMediaType);
  const setAsset = useGizmoLabStore((s) => s.setAsset);
  const clearAsset = useGizmoLabStore((s) => s.clearAsset);

  const value = useMemo<PickedAsset | null>(() => {
    if (!assetId || !assetUrl) return null;
    return {
      id: assetId,
      mediaType: assetMediaType ?? 'image',
      url: assetUrl,
      name: `Asset #${assetId}`,
    };
  }, [assetId, assetUrl, assetMediaType]);

  const handleSelect = useCallback(
    (asset: PickedAsset) => {
      if (asset.url) {
        setAsset(
          asset.id,
          asset.url,
          asset.mediaType === 'video' ? 'video' : 'image',
        );
      }
    },
    [setAsset],
  );

  const handleClear = useCallback(() => {
    clearAsset();
  }, [clearAsset]);

  return (
    <InlineAssetSearchPicker
      value={value}
      onSelect={handleSelect}
      onClear={handleClear}
      mediaTypes={['image', 'video']}
    />
  );
}
