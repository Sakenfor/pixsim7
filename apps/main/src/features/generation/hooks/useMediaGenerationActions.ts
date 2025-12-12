import { useCallback } from 'react';
import type { AssetSummary } from '@features/assets';
import { useGenerationQueueStore } from '../stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';

/**
 * Hook: useMediaGenerationActions
 *
 * Centralizes gallery → generation actions so MediaCard and widgets
 * can queue work and open the Control Center consistently.
 */
export function useMediaGenerationActions() {
  const addToQueue = useGenerationQueueStore((s) => s.addToQueue);
  const addToTransitionQueue = useGenerationQueueStore((s) => s.addToTransitionQueue);

  const setActiveModule = useControlCenterStore((s) => s.setActiveModule);
  const setOpen = useControlCenterStore((s) => s.setOpen);

  const openQuickGenerate = useCallback(() => {
    setActiveModule('quickGenerate');
    setOpen(true);
  }, [setActiveModule, setOpen]);

  const queueImageToVideo = useCallback(
    (asset: AssetSummary) => {
      addToQueue(asset, 'image_to_video');
      openQuickGenerate();
    },
    [addToQueue, openQuickGenerate],
  );

  const queueVideoExtend = useCallback(
    (asset: AssetSummary) => {
      addToQueue(asset, 'video_extend');
      openQuickGenerate();
    },
    [addToQueue, openQuickGenerate],
  );

  const queueAddToTransition = useCallback(
    (asset: AssetSummary) => {
      addToTransitionQueue(asset);
      openQuickGenerate();
    },
    [addToTransitionQueue, openQuickGenerate],
  );

  const queueAutoGenerate = useCallback(
    (asset: AssetSummary) => {
      addToQueue(asset);
      openQuickGenerate();
    },
    [addToQueue, openQuickGenerate],
  );

  return {
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
  };
}

