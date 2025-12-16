import { useCallback, useMemo } from 'react';
import type { AssetSummary } from '@features/assets';
import { useGenerationQueueStore } from '../stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import type { OperationType } from '@/types/operations';

type QueueableOperation = 'image_to_image' | 'image_to_video' | 'video_extend';

/**
 * Hook: useMediaGenerationActions
 *
 * Centralizes gallery → generation actions so MediaCard and widgets
 * can queue work and open the Control Center consistently.
 *
 * When assets are added via quick actions:
 * - The asset is added to the generation queue
 * - The asset is selected in the asset selection store
 * - The Control Center operation type is set to match
 * - The Quick Generate module is opened
 */
export function useMediaGenerationActions() {
  const addToQueue = useGenerationQueueStore((s) => s.addToQueue);
  const addToMultiAssetQueue = useGenerationQueueStore((s) => s.addToMultiAssetQueue);

  const setActiveModule = useControlCenterStore((s) => s.setActiveModule);
  const setOpen = useControlCenterStore((s) => s.setOpen);
  const setOperationType = useControlCenterStore((s) => s.setOperationType);

  const selectAsset = useAssetSelectionStore((s) => s.selectAsset);

  const openQuickGenerate = useCallback(() => {
    setActiveModule('quickGenerate');
    setOpen(true);
  }, [setActiveModule, setOpen]);

  // Helper to select asset in selection store
  const selectAssetFromSummary = useCallback((asset: AssetSummary) => {
    selectAsset({
      id: asset.id,
      key: `asset-${asset.id}`,
      name: asset.original_filename || `Asset ${asset.id}`,
      type: asset.media_type === 'video' ? 'video' : 'image',
      url: asset.remote_url,
      source: 'gallery',
    });
  }, [selectAsset]);

  // Factory for queue actions that set operation type and open Quick Generate
  const createQueueAction = useCallback(
    (operation: QueueableOperation) => (asset: AssetSummary) => {
      addToQueue(asset, operation);
      selectAssetFromSummary(asset);
      setOperationType(operation as OperationType);
      openQuickGenerate();
    },
    [addToQueue, selectAssetFromSummary, setOperationType, openQuickGenerate],
  );

  // Memoize individual actions for stable references
  const queueImageToImage = useMemo(() => createQueueAction('image_to_image'), [createQueueAction]);
  const queueImageToVideo = useMemo(() => createQueueAction('image_to_video'), [createQueueAction]);
  const queueVideoExtend = useMemo(() => createQueueAction('video_extend'), [createQueueAction]);

  const queueAddToTransition = useCallback(
    (asset: AssetSummary) => {
      addToMultiAssetQueue(asset);
      selectAssetFromSummary(asset);
      setOperationType('video_transition');
      openQuickGenerate();
    },
    [addToMultiAssetQueue, selectAssetFromSummary, setOperationType, openQuickGenerate],
  );

  const queueAutoGenerate = useCallback(
    (asset: AssetSummary) => {
      addToQueue(asset);
      selectAssetFromSummary(asset);
      openQuickGenerate();
    },
    [addToQueue, selectAssetFromSummary, openQuickGenerate],
  );

  // Silent add - just adds to queue without opening control center
  const queueSilentAdd = useCallback(
    (asset: AssetSummary) => {
      addToQueue(asset);
      selectAssetFromSummary(asset);
      // Don't open control center - just queue it
    },
    [addToQueue, selectAssetFromSummary],
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

