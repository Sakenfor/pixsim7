import { useCallback, useMemo } from 'react';
import type { AssetSummary } from '@features/assets';
import { useGenerationQueueStore } from '../stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import type { OperationType } from '@/types/operations';

type QueueableOperation = 'image_to_image' | 'image_to_video' | 'video_extend';

/**
 * Hook: useMediaGenerationActions
 *
 * Centralizes gallery → generation actions so MediaCard and widgets
 * can queue work and open the Control Center consistently.
 *
 * When assets are added via quick actions, the Control Center operation type
 * is automatically set to match the requested operation.
 */
export function useMediaGenerationActions() {
  const addToQueue = useGenerationQueueStore((s) => s.addToQueue);
  const addToTransitionQueue = useGenerationQueueStore((s) => s.addToTransitionQueue);

  const setActiveModule = useControlCenterStore((s) => s.setActiveModule);
  const setOpen = useControlCenterStore((s) => s.setOpen);
  const setOperationType = useControlCenterStore((s) => s.setOperationType);

  const openQuickGenerate = useCallback(() => {
    setActiveModule('quickGenerate');
    setOpen(true);
  }, [setActiveModule, setOpen]);

  // Factory for queue actions that set operation type and open Quick Generate
  const createQueueAction = useCallback(
    (operation: QueueableOperation) => (asset: AssetSummary) => {
      addToQueue(asset, operation);
      setOperationType(operation as OperationType);
      openQuickGenerate();
    },
    [addToQueue, setOperationType, openQuickGenerate],
  );

  // Memoize individual actions for stable references
  const queueImageToImage = useMemo(() => createQueueAction('image_to_image'), [createQueueAction]);
  const queueImageToVideo = useMemo(() => createQueueAction('image_to_video'), [createQueueAction]);
  const queueVideoExtend = useMemo(() => createQueueAction('video_extend'), [createQueueAction]);

  const queueAddToTransition = useCallback(
    (asset: AssetSummary) => {
      addToTransitionQueue(asset);
      setOperationType('video_transition');
      openQuickGenerate();
    },
    [addToTransitionQueue, setOperationType, openQuickGenerate],
  );

  const queueAutoGenerate = useCallback(
    (asset: AssetSummary) => {
      addToQueue(asset);
      openQuickGenerate();
    },
    [addToQueue, openQuickGenerate],
  );

  return {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
  };
}

