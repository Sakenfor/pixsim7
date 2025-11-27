/**
 * Generation Queue Store
 *
 * Manages queued assets for generation operations.
 * Facilitates communication between Gallery (MediaCard) and Control Center (QuickGenerateModule).
 */

import { create } from 'zustand';
import type { AssetSummary } from '../hooks/useAssets';

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
}

export const useGenerationQueueStore = create<GenerationQueueState>((set, get) => ({
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
    set((state) => {
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
}));
