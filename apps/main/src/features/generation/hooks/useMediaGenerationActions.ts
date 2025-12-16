import { useCallback, useMemo } from 'react';
import type { AssetSummary } from '@features/assets';
import { useGenerationQueueStore } from '../stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { isMultiAssetOperation, type OperationType } from '@/types/operations';

type QueueableOperation = 'image_to_image' | 'image_to_video' | 'video_extend' | 'video_transition';

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
  const currentOperationType = useControlCenterStore((s) => s.operationType);

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

  // Smart queue action - automatically routes to main or multi-asset queue
  const createQueueAction = useCallback(
    (operation: QueueableOperation) => (asset: AssetSummary) => {
      // Smart routing: use appropriate queue based on operation type
      if (isMultiAssetOperation(operation as OperationType)) {
        addToMultiAssetQueue(asset);
      } else {
        addToQueue(asset, operation);
      }

      selectAssetFromSummary(asset);

      // Only set operation type if it's different to avoid resetting settings
      if (currentOperationType !== operation) {
        setOperationType(operation as OperationType);
      }

      openQuickGenerate();
    },
    [addToQueue, addToMultiAssetQueue, selectAssetFromSummary, setOperationType, currentOperationType, openQuickGenerate],
  );

  // Memoize individual actions for stable references
  const queueImageToImage = useMemo(() => createQueueAction('image_to_image'), [createQueueAction]);
  const queueImageToVideo = useMemo(() => createQueueAction('image_to_video'), [createQueueAction]);
  const queueVideoExtend = useMemo(() => createQueueAction('video_extend'), [createQueueAction]);
  const queueAddToTransition = useMemo(() => createQueueAction('video_transition' as QueueableOperation), [createQueueAction]);

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

