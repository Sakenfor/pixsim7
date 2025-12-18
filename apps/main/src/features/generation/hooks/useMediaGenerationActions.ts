import { useCallback, useMemo } from 'react';
import type { AssetResponse } from '@features/assets';
import { useGenerationQueueStore } from '../stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import type { OperationType } from '@/types/operations';

/**
 * Hook: useMediaGenerationActions
 *
 * Centralizes gallery → generation actions so MediaCard and widgets
 * can queue work and open the Control Center consistently.
 *
 * Uses the centralized `enqueueAsset` API for automatic queue routing
 * based on operation metadata and user preferences.
 *
 * When assets are added via quick actions:
 * - The asset is added to the appropriate generation queue (auto-routed)
 * - The asset is selected in the asset selection store
 * - The Control Center operation type is set to match
 * - The Quick Generate module is opened
 */
export function useMediaGenerationActions() {
  const enqueueAsset = useGenerationQueueStore((s) => s.enqueueAsset);

  const setActiveModule = useControlCenterStore((s) => s.setActiveModule);
  const setOpen = useControlCenterStore((s) => s.setOpen);
  const setOperationType = useControlCenterStore((s) => s.setOperationType);
  const currentOperationType = useControlCenterStore((s) => s.operationType);

  const selectAsset = useAssetSelectionStore((s) => s.selectAsset);

  const openQuickGenerate = useCallback(() => {
    setActiveModule('quickGenerate');
    setOpen(true);
  }, [setActiveModule, setOpen]);

  // Helper to select asset in selection store
  const selectAssetFromSummary = useCallback((asset: AssetResponse) => {
    selectAsset({
      id: asset.id,
      key: `asset-${asset.id}`,
      name: asset.original_filename || `Asset ${asset.id}`,
      type: asset.media_type === 'video' ? 'video' : 'image',
      url: asset.remote_url,
      source: 'gallery',
    });
  }, [selectAsset]);

  // Smart queue action - automatically routes to main or multi-asset queue via enqueueAsset
  const createQueueAction = useCallback(
    (operationType: OperationType) => (asset: AssetResponse) => {
      // Use centralized enqueueAsset which handles queue routing automatically
      enqueueAsset({ asset, operationType });

      selectAssetFromSummary(asset);

      // Only set operation type if it's different to avoid resetting settings
      if (currentOperationType !== operationType) {
        setOperationType(operationType);
      }

      openQuickGenerate();
    },
    [enqueueAsset, selectAssetFromSummary, setOperationType, currentOperationType, openQuickGenerate],
  );

  // Memoize individual actions for stable references
  const queueImageToImage = useMemo(() => createQueueAction('image_to_image'), [createQueueAction]);
  const queueImageToVideo = useMemo(() => createQueueAction('image_to_video'), [createQueueAction]);
  const queueVideoExtend = useMemo(() => createQueueAction('video_extend'), [createQueueAction]);
  const queueAddToTransition = useMemo(() => createQueueAction('video_transition'), [createQueueAction]);

  const queueAutoGenerate = useCallback(
    (asset: AssetResponse) => {
      // Auto-generate uses current operation type for routing
      enqueueAsset({ asset, operationType: currentOperationType });
      selectAssetFromSummary(asset);
      openQuickGenerate();
    },
    [enqueueAsset, currentOperationType, selectAssetFromSummary, openQuickGenerate],
  );

  // Silent add - just adds to queue without opening control center
  const queueSilentAdd = useCallback(
    (asset: AssetResponse) => {
      // Silent add uses current operation type for routing
      enqueueAsset({ asset, operationType: currentOperationType });
      selectAssetFromSummary(asset);
      // Don't open control center - just queue it
    },
    [enqueueAsset, currentOperationType, selectAssetFromSummary],
  );

  return {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    queueSilentAdd,
  };
}
