import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react';
import { useAssetSelectionStore, type SelectedAsset } from '@features/assets/stores/assetSelectionStore';
import {
  useGenerationQueueStore,
  type GenerationQueueState,
  type QueuedAsset,
} from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { useCubeSettingsStore } from '@features/cubes';
import type { OperationType } from '@/types/operations';

// Re-export for backwards compatibility
export type { OperationType };

export interface QuickGenerateBindings {
  lastSelectedAsset?: SelectedAsset;
  mainQueue: QueuedAsset[];
  mainQueueIndex: number;
  multiAssetQueue: QueuedAsset[];
  multiAssetQueueIndex: number;
  dynamicParams: Record<string, any>;
  setDynamicParams: Dispatch<SetStateAction<Record<string, any>>>;
  prompts: string[];
  setPrompts: Dispatch<SetStateAction<string[]>>;
  transitionDurations: number[];
  setTransitionDurations: Dispatch<SetStateAction<number[]>>;
  consumeFromQueue: GenerationQueueState['consumeFromQueue'];
  removeFromQueue: GenerationQueueState['removeFromQueue'];
  clearMultiAssetQueue: () => void;
  cycleQueue: (queueType?: 'main' | 'multi', direction?: 'next' | 'prev') => void;
  /**
   * Explicitly set source_asset_id from the active asset.
   * This is for manual "Use This Asset" actions - inference happens automatically in logic.
   */
  useActiveAsset: () => void;
}

/**
 * Hook: useQuickGenerateBindings
 *
 * Exposes queue and selection state to QuickGenerateModule.
 *
 * IMPORTANT: This hook does NOT auto-fill source_asset_id into dynamicParams.
 * Asset ID inference happens in buildGenerationRequest (quickGenerateLogic.ts)
 * which has access to mainQueueCurrent and activeAsset via context.
 *
 * This hook manages:
 * - State exposure (queues, selection, dynamicParams)
 * - Operation type auto-switching when items added to queue
 * - source_asset_ids array sync for video_transition
 * - prompts/durations arrays for video_transition
 */
export function useQuickGenerateBindings(
  operationType: OperationType,
  setOperationType: (operation: OperationType) => void,
): QuickGenerateBindings {
  // Active asset support
  const lastSelectedAsset = useAssetSelectionStore(s => s.lastSelectedAsset);

  // Generation queue support
  const mainQueue = useGenerationQueueStore(s => s.mainQueue);
  const mainQueueIndex = useGenerationQueueStore(s => s.mainQueueIndex);
  const multiAssetQueue = useGenerationQueueStore(s => s.multiAssetQueue);
  const multiAssetQueueIndex = useGenerationQueueStore(s => s.multiAssetQueueIndex);
  const consumeFromQueue = useGenerationQueueStore(s => s.consumeFromQueue);
  const removeFromQueue = useGenerationQueueStore(s => s.removeFromQueue);
  const clearQueue = useGenerationQueueStore(s => s.clearQueue);
  const cycleQueue = useGenerationQueueStore(s => s.cycleQueue);

  // Settings for auto-selection behavior
  const autoSelectOperationType = useCubeSettingsStore(s => s.autoSelectOperationType);

  const { useSettingsStore } = useGenerationScopeStores();

  // Dynamic params from operation_specs (scoped store)
  const dynamicParams = useSettingsStore((s) => s.params);
  const setDynamicParams = useSettingsStore((s) => s.setDynamicParams);

  // Operation-specific array fields for video_transition
  const [prompts, setPrompts] = useState<string[]>([]);
  const [transitionDurations, setTransitionDurations] = useState<number[]>([]);

  // Track previous queue state to detect adds
  const prevMainQueueLengthRef = useRef<number | null>(null);
  const prevTransitionQueueLengthRef = useRef<number | null>(null);

  /**
   * Explicitly set source_asset_id from active asset.
   * Use this for "Use This Asset" button actions.
   * Note: Inference from activeAsset also happens in logic, so this is optional.
   */
  const useActiveAsset = () => {
    if (!lastSelectedAsset) return;

    if (
      (operationType === 'image_to_video' || operationType === 'image_to_image') &&
      lastSelectedAsset.type === 'image'
    ) {
      setDynamicParams((prev) => ({
        ...prev,
        source_asset_id: lastSelectedAsset.id,
      }));
    } else if (operationType === 'video_extend' && lastSelectedAsset.type === 'video') {
      setDynamicParams((prev) => ({
        ...prev,
        source_asset_id: lastSelectedAsset.id,
      }));
    }
  };

  // Auto-switch operation type when items added to main queue
  // NOTE: We no longer set source_asset_id here - logic infers it from mainQueueCurrent
  useEffect(() => {
    const prevLength = prevMainQueueLengthRef.current;
    const currentLength = mainQueue.length;

    // Update ref for next render
    prevMainQueueLengthRef.current = currentLength;

    if (currentLength === 0) return;

    // Get current item based on index (1-based index, convert to 0-based)
    const currentIdx = Math.max(0, Math.min(mainQueueIndex - 1, currentLength - 1));
    const currentItem = mainQueue[currentIdx];
    if (!currentItem) return;

    const { asset, operation } = currentItem;

    // Only auto-switch operation type when items are added (not on cycle/initial load)
    const itemsWereAdded = prevLength !== null && currentLength > prevLength;

    if (itemsWereAdded) {
      // Set operation type if explicitly specified in queue item
      if (operation) {
        setOperationType(operation);
      } else if (autoSelectOperationType) {
        // Auto-select operation type based on asset type
        if (asset.mediaType === 'image') {
          setOperationType('image_to_video');
        } else if (asset.mediaType === 'video') {
          setOperationType('video_extend');
        }
      }
    }
  }, [mainQueue, mainQueueIndex, setOperationType, autoSelectOperationType]);

  // Sync source_asset_ids and prompts/durations arrays for video_transition
  useEffect(() => {
    const prevLength = prevTransitionQueueLengthRef.current;
    const currentLength = multiAssetQueue.length;

    // Update ref for next render
    prevTransitionQueueLengthRef.current = currentLength;

    if (currentLength === 0) {
      setPrompts([]);
      setTransitionDurations([]);
      setDynamicParams((prev) => {
        const { source_asset_ids, ...rest } = prev;
        return rest;
      });
      return;
    }

    // Sync source_asset_ids array from multiAssetQueue
    // This IS needed here because it's an array that must stay in sync with the queue
    setDynamicParams((prev) => ({
      ...prev,
      source_asset_ids: multiAssetQueue.map((item) => item.asset.id),
    }));

    // Initialize prompts array with N-1 elements (one per transition between images)
    const numTransitions = Math.max(0, multiAssetQueue.length - 1);
    setPrompts(prev => {
      const newPrompts = [...prev];
      while (newPrompts.length < numTransitions) {
        newPrompts.push('');
      }
      return newPrompts.slice(0, numTransitions);
    });
    setTransitionDurations(prev => {
      const next = [...prev];
      while (next.length < numTransitions) {
        next.push(5);
      }
      return next.slice(0, numTransitions);
    });
  }, [multiAssetQueue, setDynamicParams]);

  const clearMultiAssetQueue = () => {
    clearQueue('multi');
  };

  return {
    lastSelectedAsset,
    mainQueue,
    mainQueueIndex,
    multiAssetQueue,
    multiAssetQueueIndex,
    dynamicParams,
    setDynamicParams,
    prompts,
    setPrompts,
    transitionDurations,
    setTransitionDurations,
    consumeFromQueue,
    removeFromQueue,
    clearMultiAssetQueue,
    cycleQueue,
    useActiveAsset,
  };
}
