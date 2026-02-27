/**
 * useGalleryAssetPicker
 *
 * Clean wrapper around `useAssetPickerStore` that opens a floating gallery
 * panel, enters selection mode, and returns a `PickedAsset` via callback.
 *
 * Usage:
 *   const { pick, cancel, isActive } = useGalleryAssetPicker();
 *   pick((asset) => setMyField(asset.id));
 */

import { useCallback } from 'react';

import { useWorkspaceStore } from '@features/workspace';

import { useAssetPickerStore } from '../../stores/assetPickerStore';

import type { PickedAsset } from './types';

export interface GalleryAssetPickerOptions {
  /** Open the floating gallery panel automatically (default true). */
  openGalleryPanel?: boolean;
}

export function useGalleryAssetPicker(options?: GalleryAssetPickerOptions) {
  const { openGalleryPanel = true } = options ?? {};

  const enterSelectionMode = useAssetPickerStore((s) => s.enterSelectionMode);
  const exitSelectionMode = useAssetPickerStore((s) => s.exitSelectionMode);
  const isActive = useAssetPickerStore((s) => s.isSelectionMode);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  const pick = useCallback(
    (onPicked: (asset: PickedAsset) => void) => {
      if (openGalleryPanel) {
        openFloatingPanel('gallery', { x: 100, y: 100, width: 800, height: 600 });
      }
      enterSelectionMode((raw) => {
        onPicked({
          id: typeof raw.id === 'string' ? Number(raw.id) : (raw.id as number),
          mediaType: raw.mediaType,
          thumbnailUrl: raw.thumbnailUrl,
          url: raw.remoteUrl,
        });
      });
    },
    [enterSelectionMode, openFloatingPanel, openGalleryPanel],
  );

  const cancel = useCallback(() => {
    exitSelectionMode();
  }, [exitSelectionMode]);

  return { pick, cancel, isActive } as const;
}
