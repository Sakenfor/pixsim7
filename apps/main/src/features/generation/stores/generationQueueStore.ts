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
import type { AssetSummary } from '@/hooks/useAssets';

export interface QueuedAsset {
  asset: AssetSummary;
  operation?: 'image_to_video' | 'video_extend' | 'add_to_transition';
  queuedAt: string;
  lockedTimestamp?: number; // Locked frame timestamp in seconds (for video assets)
}

export interface GenerationQueueState {
  // Queue for different operation types
  mainQueue: QueuedAsset[];           // General generation queue
  transitionQueue: QueuedAsset[];     // Assets queued for video transition

  // Actions
  addToQueue: (asset: AssetSummary, operation?: 'image_to_video' | 'video_extend') => void;
  addToTransitionQueue: (asset: AssetSummary) => void;
  removeFromQueue: (assetId: number, queueType?: 'main' | 'transition') => void;
  clearQueue: (queueType?: 'main' | 'transition' | 'all') => void;
  getNextInQueue: (queueType?: 'main' | 'transition') => QueuedAsset | null;
  consumeFromQueue: (queueType?: 'main' | 'transition') => QueuedAsset | null;
  updateLockedTimestamp: (assetId: number, timestamp: number | undefined, queueType?: 'main' | 'transition') => void;
  /**
   * Cycle the queue forward/backward so that a different asset becomes the
   * "front" item. Useful for UI controls that let the user step through
   * queued assets without changing queue membership.
   */
  cycleQueue: (queueType?: 'main' | 'transition', direction?: 'next' | 'prev') => void;
}

export const useGenerationQueueStore = create<GenerationQueueState>()(
  persist(
    (set, get) => ({
      mainQueue: [],
      transitionQueue: [],

      addToQueue: (asset, operation) => {
        set((state) => ({
          mainQueue: [
            ...state.mainQueue,
            {
              asset,
              operation,
              queuedAt: new Date().toISOString(),
            },
          ],
        }));
      },

      addToTransitionQueue: (asset) => {
        set((state) => ({
          transitionQueue: [
            ...state.transitionQueue,
            {
              asset,
              operation: 'add_to_transition' as const,
              queuedAt: new Date().toISOString(),
            },
          ],
        }));
      },

      removeFromQueue: (assetId, queueType = 'main') => {
        set((state) => {
          if (queueType === 'main') {
            return {
              mainQueue: state.mainQueue.filter((item) => item.asset.id !== assetId),
            };
          } else {
            return {
              transitionQueue: state.transitionQueue.filter((item) => item.asset.id !== assetId),
            };
          }
        });
      },

      clearQueue: (queueType = 'all') => {
        set(() => {
          if (queueType === 'all') {
            return { mainQueue: [], transitionQueue: [] };
          } else if (queueType === 'main') {
            return { mainQueue: [] };
          } else {
            return { transitionQueue: [] };
          }
        });
      },

      getNextInQueue: (queueType = 'main') => {
        const state = get();
        const queue = queueType === 'main' ? state.mainQueue : state.transitionQueue;
        return queue.length > 0 ? queue[0] : null;
      },

      consumeFromQueue: (queueType = 'main') => {
        const state = get();
        const queue = queueType === 'main' ? state.mainQueue : state.transitionQueue;

        if (queue.length === 0) return null;

        const item = queue[0];

        set((state) => {
          if (queueType === 'main') {
            return {
              mainQueue: state.mainQueue.slice(1),
            };
          } else {
            return {
              transitionQueue: state.transitionQueue.slice(1),
            };
          }
        });

        return item;
      },

      updateLockedTimestamp: (assetId, timestamp, queueType = 'main') => {
        set((state) => {
          if (queueType === 'main') {
            return {
              mainQueue: state.mainQueue.map((item) =>
                item.asset.id === assetId
                  ? { ...item, lockedTimestamp: timestamp }
                  : item
              ),
            };
          } else {
            return {
              transitionQueue: state.transitionQueue.map((item) =>
                item.asset.id === assetId
                  ? { ...item, lockedTimestamp: timestamp }
                  : item
              ),
            };
          }
        });
      },

      cycleQueue: (queueType = 'main', direction = 'next') => {
        set((state) => {
          const key = queueType === 'main' ? 'mainQueue' : 'transitionQueue';
          const queue = state[key];
          if (!queue || queue.length <= 1) {
            return {};
          }

          let nextQueue: QueuedAsset[];
          if (direction === 'next') {
            nextQueue = [...queue.slice(1), queue[0]];
          } else {
            nextQueue = [queue[queue.length - 1], ...queue.slice(0, queue.length - 1)];
          }

          return {
            [key]: nextQueue,
          } as any;
        });
      },
    }),
    {
      name: 'generation_queue_v1',
      // Only queues need to be persisted; methods are recreated.
      partialize: (state) => ({
        mainQueue: state.mainQueue,
        transitionQueue: state.transitionQueue,
      }),
    },
  ),
);
