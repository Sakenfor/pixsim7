/**
 * Generation Queue Store
 *
 * Manages queued assets for generation operations.
 * Facilitates communication between Gallery (MediaCard) and Control Center (QuickGenerateModule).
 *
 * Persisted to localStorage so queued assets survive reloads.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetSummary } from '@features/assets';

export interface QueuedAsset {
  asset: AssetSummary;
  operation?: 'image_to_image' | 'image_to_video' | 'video_extend' | 'add_to_transition';
  queuedAt: string;
  lockedTimestamp?: number; // Locked frame timestamp in seconds (for video assets)
}

export interface GenerationQueueState {
  // Queue for different operation types
  mainQueue: QueuedAsset[];           // Single-asset operations (video extend, etc.)
  multiAssetQueue: QueuedAsset[];     // Multi-asset operations (transition, fusion, image edit)

  // Current index tracking (1-based for display)
  mainQueueIndex: number;
  multiAssetQueueIndex: number;

  // Actions
  addToQueue: (asset: AssetSummary, operation?: 'image_to_image' | 'image_to_video' | 'video_extend') => void;
  addToMultiAssetQueue: (asset: AssetSummary) => void;
  addToQueueAtIndex: (asset: AssetSummary, index: number, operation?: 'image_to_image' | 'image_to_video' | 'video_extend') => void;
  addToMultiAssetQueueAtIndex: (asset: AssetSummary, index: number) => void;
  removeFromQueue: (assetId: number, queueType?: 'main' | 'multi') => void;
  clearQueue: (queueType?: 'main' | 'multi' | 'all') => void;
  getNextInQueue: (queueType?: 'main' | 'multi') => QueuedAsset | null;
  consumeFromQueue: (queueType?: 'main' | 'multi') => QueuedAsset | null;
  updateLockedTimestamp: (assetId: number, timestamp: number | undefined, queueType?: 'main' | 'multi') => void;
  /**
   * Cycle the queue forward/backward so that a different asset becomes the
   * "front" item. Useful for UI controls that let the user step through
   * queued assets without changing queue membership.
   */
  cycleQueue: (queueType?: 'main' | 'multi', direction?: 'next' | 'prev') => void;
}

// Helper to get queue key and index key from queue type
type QueueKeys = {
  queueKey: 'mainQueue' | 'multiAssetQueue';
  indexKey: 'mainQueueIndex' | 'multiAssetQueueIndex';
};

function getQueueKeys(queueType: 'main' | 'multi'): QueueKeys {
  return queueType === 'main'
    ? { queueKey: 'mainQueue', indexKey: 'mainQueueIndex' }
    : { queueKey: 'multiAssetQueue', indexKey: 'multiAssetQueueIndex' };
}

export const useGenerationQueueStore = create<GenerationQueueState>()(
  persist(
    (set, get) => {
      // Shared helper: add asset to end of queue
      const addToQueueHelper = (
        queueType: 'main' | 'multi',
        asset: AssetSummary,
        operation?: QueuedAsset['operation']
      ) => {
        set((state) => {
          const { queueKey, indexKey } = getQueueKeys(queueType);
          const currentQueue = state[queueKey];
          const newQueue = [
            ...currentQueue,
            {
              asset,
              operation: operation || (queueType === 'multi' ? 'add_to_transition' as const : undefined),
              queuedAt: new Date().toISOString(),
            },
          ];
          return {
            [queueKey]: newQueue,
            [indexKey]: newQueue.length, // 1-indexed
          } as Partial<GenerationQueueState>;
        });
      };

      // Shared helper: add/replace asset at specific index
      const addToQueueAtIndexHelper = (
        queueType: 'main' | 'multi',
        asset: AssetSummary,
        index: number,
        operation?: QueuedAsset['operation']
      ) => {
        set((state) => {
          const { queueKey, indexKey } = getQueueKeys(queueType);
          const newQueue = [...state[queueKey]];
          const queuedAsset: QueuedAsset = {
            asset,
            operation: operation || (queueType === 'multi' ? 'add_to_transition' as const : undefined),
            queuedAt: new Date().toISOString(),
          };

          // If index is within current queue, replace; otherwise append
          if (index < newQueue.length) {
            newQueue[index] = queuedAsset;
          } else {
            newQueue.push(queuedAsset);
          }

          return {
            [queueKey]: newQueue,
            [indexKey]: index + 1, // 1-indexed
          } as Partial<GenerationQueueState>;
        });
      };

      return {
        mainQueue: [],
        multiAssetQueue: [],
        mainQueueIndex: 1,
        multiAssetQueueIndex: 1,

        addToQueue: (asset, operation) => addToQueueHelper('main', asset, operation),
        addToMultiAssetQueue: (asset) => addToQueueHelper('multi', asset),
        addToQueueAtIndex: (asset, index, operation) => addToQueueAtIndexHelper('main', asset, index, operation),
        addToMultiAssetQueueAtIndex: (asset, index) => addToQueueAtIndexHelper('multi', asset, index),

      removeFromQueue: (assetId, queueType = 'main') => {
        set((state) => {
          const { queueKey } = getQueueKeys(queueType);
          return {
            [queueKey]: state[queueKey].filter((item) => item.asset.id !== assetId),
          } as Partial<GenerationQueueState>;
        });
      },

      clearQueue: (queueType = 'all') => {
        set(() => {
          if (queueType === 'all') {
            return { mainQueue: [], multiAssetQueue: [], mainQueueIndex: 1, multiAssetQueueIndex: 1 };
          }
          const { queueKey, indexKey } = getQueueKeys(queueType);
          return {
            [queueKey]: [],
            [indexKey]: 1,
          } as Partial<GenerationQueueState>;
        });
      },

      getNextInQueue: (queueType = 'main') => {
        const state = get();
        const { queueKey } = getQueueKeys(queueType);
        const queue = state[queueKey];
        return queue.length > 0 ? queue[0] : null;
      },

      consumeFromQueue: (queueType = 'main') => {
        const state = get();
        const { queueKey } = getQueueKeys(queueType);
        const queue = state[queueKey];

        if (queue.length === 0) return null;

        const item = queue[0];

        set((state) => {
          const { queueKey } = getQueueKeys(queueType);
          return {
            [queueKey]: state[queueKey].slice(1),
          } as Partial<GenerationQueueState>;
        });

        return item;
      },

      updateLockedTimestamp: (assetId, timestamp, queueType = 'main') => {
        set((state) => {
          const { queueKey } = getQueueKeys(queueType);
          return {
            [queueKey]: state[queueKey].map((item) =>
              item.asset.id === assetId
                ? { ...item, lockedTimestamp: timestamp }
                : item
            ),
          } as Partial<GenerationQueueState>;
        });
      },

      cycleQueue: (queueType = 'main', direction = 'next') => {
        set((state) => {
          const { queueKey, indexKey } = getQueueKeys(queueType);
          const queue = state[queueKey];
          const currentIndex = state[indexKey];
          const length = queue?.length || 0;

          if (!queue || length <= 1) {
            return {};
          }

          let nextQueue: QueuedAsset[];
          let nextIndex: number;

          if (direction === 'next') {
            nextQueue = [...queue.slice(1), queue[0]];
            nextIndex = currentIndex >= length ? 1 : currentIndex + 1;
          } else {
            nextQueue = [queue[queue.length - 1], ...queue.slice(0, queue.length - 1)];
            nextIndex = currentIndex <= 1 ? length : currentIndex - 1;
          }

          return {
            [queueKey]: nextQueue,
            [indexKey]: nextIndex,
          } as Partial<GenerationQueueState>;
        });
      },
    };
  },
    {
      name: 'generation_queue_v3',
      // Queues and indices need to be persisted; methods are recreated.
      partialize: (state) => ({
        mainQueue: state.mainQueue,
        multiAssetQueue: state.multiAssetQueue,
        mainQueueIndex: state.mainQueueIndex,
        multiAssetQueueIndex: state.multiAssetQueueIndex,
      }),
    },
  ),
);
