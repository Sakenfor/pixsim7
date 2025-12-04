import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useAssetSelectionStore, type SelectedAsset } from '../stores/assetSelectionStore';
import {
  useGenerationQueueStore,
  type GenerationQueueState,
  type QueuedAsset,
} from '../stores/generationQueueStore';
import type { ControlCenterState } from '../stores/controlCenterStore';
import { useGenerationSettingsStore } from '../stores/generationSettingsStore';

export type OperationType = ControlCenterState['operationType'];

export interface QuickGenerateBindings {
  lastSelectedAsset?: SelectedAsset;
  mainQueue: QueuedAsset[];
  transitionQueue: QueuedAsset[];
  dynamicParams: Record<string, any>;
  setDynamicParams: Dispatch<SetStateAction<Record<string, any>>>;
  imageUrls: string[];
  setImageUrls: Dispatch<SetStateAction<string[]>>;
  prompts: string[];
  setPrompts: Dispatch<SetStateAction<string[]>>;
  consumeFromQueue: GenerationQueueState['consumeFromQueue'];
  removeFromQueue: GenerationQueueState['removeFromQueue'];
  clearTransitionQueue: () => void;
  cycleQueue: (queueType?: 'main' | 'transition', direction?: 'next' | 'prev') => void;
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
  const transitionQueue = useGenerationQueueStore(s => s.transitionQueue);
  const consumeFromQueue = useGenerationQueueStore(s => s.consumeFromQueue);
  const removeFromQueue = useGenerationQueueStore(s => s.removeFromQueue);
  const clearQueue = useGenerationQueueStore(s => s.clearQueue);
  const cycleQueue = useGenerationQueueStore(s => s.cycleQueue);

  // Dynamic params from operation_specs (shared across UIs via store)
  const dynamicParams = useGenerationSettingsStore(s => s.params);
  const setDynamicParams = useGenerationSettingsStore(s => s.setDynamicParams);

  // Operation-specific array fields for video_transition
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);

  // Function to use active asset explicitly (e.g., "Use Asset" button)
  const useActiveAsset = () => {
    if (!lastSelectedAsset) return;

    if (operationType === 'image_to_video' && lastSelectedAsset.type === 'image') {
      setDynamicParams(prev => ({ ...prev, image_url: lastSelectedAsset.url }));
    } else if (operationType === 'video_extend' && lastSelectedAsset.type === 'video') {
      setDynamicParams(prev => ({ ...prev, video_url: lastSelectedAsset.url }));
    }
  };

  // Auto-fill when active asset changes (if compatible with operation)
  useEffect(() => {
    if (!lastSelectedAsset) return;

    if (operationType === 'image_to_video' && lastSelectedAsset.type === 'image' && !dynamicParams.image_url) {
      setDynamicParams(prev => ({ ...prev, image_url: lastSelectedAsset.url }));
    } else if (operationType === 'video_extend' && lastSelectedAsset.type === 'video' && !dynamicParams.video_url) {
      setDynamicParams(prev => ({ ...prev, video_url: lastSelectedAsset.url }));
    }
  }, [lastSelectedAsset, operationType]);

  // Auto-fill from main generation queue
  useEffect(() => {
    const nextInQueue = mainQueue[0];
    if (!nextInQueue) return;

    const { asset, operation } = nextInQueue;

    // Set operation type if specified
    if (operation) {
      setOperationType(operation);
    }

    // Auto-fill based on operation and asset type
    if ((operation === 'image_to_video' || !operation) && asset.media_type === 'image') {
      setDynamicParams(prev => ({ ...prev, image_url: asset.remote_url }));
      if (!operation) setOperationType('image_to_video');
    } else if ((operation === 'video_extend' || !operation) && asset.media_type === 'video') {
      setDynamicParams(prev => ({ ...prev, video_url: asset.remote_url }));
      if (!operation) setOperationType('video_extend');
    }
  }, [mainQueue, setOperationType]);

  // Auto-fill transition queue
  useEffect(() => {
    if (transitionQueue.length === 0) return;

    // Set operation to video_transition
    setOperationType('video_transition');

    // Fill image URLs from transition queue
    const urls = transitionQueue.map(item => item.asset.remote_url);
    setImageUrls(urls);

    // Initialize prompts array with N-1 elements (one per transition between images)
    // For N images, we have N-1 transitions
    const numTransitions = Math.max(0, urls.length - 1);
    setPrompts(prev => {
      const newPrompts = [...prev];
      while (newPrompts.length < numTransitions) {
        newPrompts.push('');
      }
      // Trim if we have more prompts than transitions
      return newPrompts.slice(0, numTransitions);
    });
  }, [transitionQueue, setOperationType]);

  const clearTransitionQueue = () => {
    clearQueue('transition');
  };

  return {
    lastSelectedAsset,
    mainQueue,
    transitionQueue,
    dynamicParams,
    setDynamicParams,
    imageUrls,
    setImageUrls,
    prompts,
    setPrompts,
    consumeFromQueue,
    removeFromQueue,
    clearTransitionQueue,
    cycleQueue,
    useActiveAsset,
  };
}
