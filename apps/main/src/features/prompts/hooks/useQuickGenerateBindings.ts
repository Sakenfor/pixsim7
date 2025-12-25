import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react';
import { useAssetSelectionStore, type SelectedAsset } from '@features/assets/stores/assetSelectionStore';
import {
  useGenerationQueueStore,
  type GenerationQueueState,
  type QueuedAsset,
} from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { useCubeSettingsStore } from '@features/controlCenter/stores/cubeSettingsStore';
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
   * Apply the currently active asset (if compatible) to dynamic parameters.
   */
  useActiveAsset: () => void;
}

/**
 * Hook: useQuickGenerateBindings
 *
 * Encapsulates how QuickGenerateModule binds to:
 * - Active asset selection
 * - Main and transition generation queues
 * - Dynamic parameter / array field state
 *
 * This keeps the React component mostly focused on layout and rendering.
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

  // Track previous queue state to detect adds vs cycles vs initial hydration
  const prevMainQueueLengthRef = useRef<number | null>(null);
  const prevTransitionQueueLengthRef = useRef<number | null>(null);
  const prevMainQueueItemIdRef = useRef<number | null>(null);

  // Function to use active asset explicitly (e.g., "Use Asset" button)
  const useActiveAsset = () => {
    if (!lastSelectedAsset) return;

    if (operationType === 'image_to_video' && lastSelectedAsset.type === 'image') {
      setDynamicParams((prev) => {
        const { image_url, ...rest } = prev;
        return {
          ...rest,
          source_asset_id: lastSelectedAsset.id,
        };
      });
    } else if (operationType === 'video_extend' && lastSelectedAsset.type === 'video') {
      setDynamicParams((prev) => {
        const { video_url, ...rest } = prev;
        return {
          ...rest,
          source_asset_id: lastSelectedAsset.id,
        };
      });
    }
  };

  // Auto-fill when active asset changes (if compatible with operation)
  // NOTE: No longer checking for legacy params - always use source_asset_id
  useEffect(() => {
    if (!lastSelectedAsset) return;

    if (operationType === 'image_to_video' && lastSelectedAsset.type === 'image') {
      setDynamicParams((prev) => {
        const { image_url, ...rest } = prev;
        return {
          ...rest,
          source_asset_id: lastSelectedAsset.id,
        };
      });
    } else if (operationType === 'video_extend' && lastSelectedAsset.type === 'video') {
      setDynamicParams((prev) => {
        const { video_url, ...rest } = prev;
        return {
          ...rest,
          source_asset_id: lastSelectedAsset.id,
        };
      });
    }
  }, [lastSelectedAsset, operationType]);

  // Track previous index to detect cycling
  const prevMainQueueIndexRef = useRef<number | null>(null);

  // Auto-fill from main generation queue based on current index
  useEffect(() => {
    const prevLength = prevMainQueueLengthRef.current;
    const prevIndex = prevMainQueueIndexRef.current;
    const currentLength = mainQueue.length;

    // Update refs for next render
    prevMainQueueLengthRef.current = currentLength;
    prevMainQueueIndexRef.current = mainQueueIndex;

    if (currentLength === 0) {
      prevMainQueueItemIdRef.current = null;
      return;
    }

    // Get current item based on index (1-based index, convert to 0-based)
    const currentIdx = Math.max(0, Math.min(mainQueueIndex - 1, currentLength - 1));
    const currentItem = mainQueue[currentIdx];
    if (!currentItem) {
      prevMainQueueItemIdRef.current = null;
      return;
    }
    const currentItemId = currentItem.asset?.id ?? null;
    const prevItemId = prevMainQueueItemIdRef.current;

    const { asset, operation } = currentItem;

    // Detect different scenarios:
    // - itemsWereAdded: new items added to queue (switch operation + fill params)
    // - indexChanged: user cycled through queue (update params to current item)
    // - itemChanged: queue mutated while index stayed the same
    // - initialHydration: first render with data (fill only if empty)
    const itemsWereAdded = prevLength !== null && currentLength > prevLength;
    const indexChanged = prevIndex !== null && prevIndex !== mainQueueIndex;
    const itemChanged = prevItemId !== null && currentItemId !== null && prevItemId !== currentItemId;

    if (itemsWereAdded) {
      // Set operation type if explicitly specified in queue item
      if (operation) {
        setOperationType(operation);
      }

      // Auto-fill based on operation and asset type
      if ((operation === 'image_to_video' || !operation) && asset.mediaType === 'image') {
        setDynamicParams((prev) => {
          const { image_url, ...rest } = prev;
          return {
            ...rest,
            source_asset_id: asset.id,
          };
        });
        // Only auto-select operation type if setting is enabled
        if (!operation && autoSelectOperationType) {
          setOperationType('image_to_video');
        }
      } else if ((operation === 'video_extend' || !operation) && asset.mediaType === 'video') {
        setDynamicParams((prev) => {
          const { video_url, ...rest } = prev;
          return {
            ...rest,
            source_asset_id: asset.id,
          };
        });
        // Only auto-select operation type if setting is enabled
        if (!operation && autoSelectOperationType) {
          setOperationType('video_extend');
        }
      }
    } else if (indexChanged || itemChanged) {
      // Index changed (user cycled) - update params to reflect the current item
      if (asset.mediaType === 'image') {
        setDynamicParams((prev) => {
          const { image_url, ...rest } = prev;
          return {
            ...rest,
            source_asset_id: asset.id,
          };
        });
      } else if (asset.mediaType === 'video') {
        setDynamicParams((prev) => {
          const { video_url, ...rest } = prev;
          return {
            ...rest,
            source_asset_id: asset.id,
          };
        });
      }
    } else {
      // On initial load, only fill params if source_asset_id not already set
      // NOTE: No longer checking for legacy params - only check source_asset_id
      if (!dynamicParams.source_asset_id) {
        if (asset.mediaType === 'image') {
          setDynamicParams((prev) => {
            const { image_url, ...rest } = prev;
            return {
              ...rest,
              source_asset_id: asset.id,
            };
          });
        } else if (asset.mediaType === 'video') {
          setDynamicParams((prev) => {
            const { video_url, ...rest } = prev;
            return {
              ...rest,
              source_asset_id: asset.id,
            };
          });
        }
      }
    }
    prevMainQueueItemIdRef.current = currentItemId;
  }, [mainQueue, mainQueueIndex, setOperationType, autoSelectOperationType]);

  // Auto-fill transition queue data (but don't auto-switch operation type on load)
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

    // NOTE: Removed auto-switch to video_transition here.
    // The slot picker now handles this via setOperationInputMode() for optional multi-asset operations.
    // Operation type should be explicitly controlled by the user, not auto-switched when adding to queue.

    setDynamicParams((prev) => ({
      ...prev,
      source_asset_ids: multiAssetQueue.map((item) => item.asset.id),
    }));

    // Initialize prompts array with N-1 elements (one per transition between images)
    // For N images, we have N-1 transitions
    const numTransitions = Math.max(0, multiAssetQueue.length - 1);
    setPrompts(prev => {
      const newPrompts = [...prev];
      while (newPrompts.length < numTransitions) {
        newPrompts.push('');
      }
      // Trim if we have more prompts than transitions
      return newPrompts.slice(0, numTransitions);
    });
    setTransitionDurations(prev => {
      const next = [...prev];
      while (next.length < numTransitions) {
        next.push(5);
      }
      return next.slice(0, numTransitions);
    });
  }, [multiAssetQueue, setOperationType]);

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
