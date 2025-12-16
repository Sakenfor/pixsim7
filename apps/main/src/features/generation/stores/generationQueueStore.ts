/**
 * Generation Queue Store
 *
 * Manages queued assets for generation operations.
 * Facilitates communication between Gallery (MediaCard) and Control Center (QuickGenerateModule).
 *
 * Persisted to localStorage so queued assets survive reloads.
 *
 * ## Queue Routing
 *
 * Assets are routed to either `mainQueue` or `multiAssetQueue` based on operation metadata:
 * - `multiAssetMode: 'single'` → always mainQueue
 * - `multiAssetMode: 'required'` → always multiAssetQueue
 * - `multiAssetMode: 'optional'` → user preference (defaults to mainQueue)
 *
 * Use the `enqueueAsset()` method for all asset queuing - it handles routing automatically.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetSummary } from '@features/assets';
import { OPERATION_METADATA, type OperationType } from '@/types/operations';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type InputMode = 'single' | 'multi';

export interface QueuedAsset {
  asset: AssetSummary;
  operation?: OperationType;
  queuedAt: string;
  lockedTimestamp?: number; // Locked frame timestamp in seconds (for video assets)
}

export interface EnqueueOptions {
  asset: AssetSummary;
  operationType: OperationType;
  slotIndex?: number;        // If provided, replace at this index
  forceMulti?: boolean;      // Force multi-asset queue for optional operations
}

export interface GenerationQueueState {
  // Queue for single-asset operations (video extend, image-to-video single, etc.)
  mainQueue: QueuedAsset[];
  mainQueueIndex: number;

  // Queue for multi-asset operations (transition, fusion, image multi)
  // Note: Currently shared across operation types. Assets are cleared when switching
  // to a different operation type if needed.
  multiAssetQueue: QueuedAsset[];
  multiAssetQueueIndex: number;

  // Per-operation input mode preferences (for 'optional' multiAssetMode operations)
  operationInputModePrefs: Partial<Record<OperationType, InputMode>>;

  // ─────────────────────────────────────────────────────────────────────────
  // Canonical Queue API - use these instead of direct queue manipulation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enqueue an asset with automatic queue routing based on operation metadata.
   * This is the preferred method for all asset queuing operations.
   */
  enqueueAsset: (options: EnqueueOptions) => void;

  /**
   * Get the effective input mode for an operation, considering metadata and user preferences.
   */
  getInputModeForOperation: (operationType: OperationType) => InputMode;

  /**
   * Set user preference for input mode on optional multi-asset operations.
   * Only affects operations where multiAssetMode === 'optional'.
   *
   * UI toggle location TBD: could be on the asset card, in generation settings,
   * or in the Control Center's input mode selector.
   */
  setOperationInputMode: (operationType: OperationType, mode: InputMode) => void;

  /**
   * Resolve which queue type should be used for an operation.
   * Considers operation metadata, user preferences, and forceMulti flag.
   */
  resolveQueueType: (operationType: OperationType, forceMulti?: boolean) => 'main' | 'multi';

  // ─────────────────────────────────────────────────────────────────────────
  // Legacy Actions (kept for backward compatibility, prefer enqueueAsset)
  // ─────────────────────────────────────────────────────────────────────────

  /** @deprecated Use enqueueAsset() instead */
  addToQueue: (asset: AssetSummary, operation?: OperationType) => void;
  /** @deprecated Use enqueueAsset() instead */
  addToMultiAssetQueue: (asset: AssetSummary) => void;
  /** @deprecated Use enqueueAsset() instead */
  addToQueueAtIndex: (asset: AssetSummary, index: number, operation?: OperationType) => void;
  /** @deprecated Use enqueueAsset() instead */
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
  /**
   * Directly set the queue index (1-indexed). Useful for grid popup selection.
   */
  setQueueIndex: (queueType: 'main' | 'multi', index: number) => void;
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
      // ─────────────────────────────────────────────────────────────────────
      // Queue Routing Logic
      // ─────────────────────────────────────────────────────────────────────

      /**
       * Resolve which queue type should be used for an operation.
       * This is the single source of truth for queue routing decisions.
       *
       * Routing rules:
       * - multiAssetMode === 'required' → always 'multi'
       * - multiAssetMode === 'single' → always 'main'
       * - multiAssetMode === 'optional' → check forceMulti, then user preference (default: 'single')
       */
      const resolveQueueTypeImpl = (operationType: OperationType, forceMulti?: boolean): 'main' | 'multi' => {
        const metadata = OPERATION_METADATA[operationType];
        if (!metadata) {
          console.warn(`[GenerationQueueStore] Unknown operation type: ${operationType}, defaulting to main queue`);
          return 'main';
        }

        const { multiAssetMode } = metadata;
        let result: 'main' | 'multi';
        let reason: string;

        // Required operations always use multi-asset queue
        if (multiAssetMode === 'required') {
          result = 'multi';
          reason = 'required';
        }
        // Single operations always use main queue
        else if (multiAssetMode === 'single') {
          result = 'main';
          reason = 'single';
        }
        // Optional operations: check forceMulti flag first, then user preference
        else if (forceMulti) {
          result = 'multi';
          reason = 'forceMulti';
        }
        else {
          const prefs = get().operationInputModePrefs;
          const userPref = prefs[operationType] ?? 'single';
          result = userPref === 'multi' ? 'multi' : 'main';
          reason = `user-pref:${userPref}`;
        }

        // Debug assertion: log routing decisions in development
        if (process.env.NODE_ENV === 'development') {
          console.debug(
            `[GenerationQueueStore] resolveQueueType("${operationType}", forceMulti=${forceMulti}) → "${result}" (${reason})`
          );
        }

        return result;
      };

      /**
       * Get the effective input mode for an operation.
       */
      const getInputModeForOperationImpl = (operationType: OperationType): InputMode => {
        const metadata = OPERATION_METADATA[operationType];
        if (!metadata) return 'single';

        const { multiAssetMode } = metadata;

        if (multiAssetMode === 'required') return 'multi';
        if (multiAssetMode === 'single') return 'single';

        // Optional: check user preference
        const prefs = get().operationInputModePrefs;
        return prefs[operationType] ?? 'single';
      };

      // ─────────────────────────────────────────────────────────────────────
      // Internal Queue Helpers
      // ─────────────────────────────────────────────────────────────────────

      // Shared helper: add asset to end of queue
      // For mainQueue: prevents duplicates (moves existing to end instead)
      // For multiAssetQueue: allows duplicates (same asset in multiple slots)
      const addToQueueHelper = (
        queueType: 'main' | 'multi',
        asset: AssetSummary,
        operation?: QueuedAsset['operation']
      ) => {
        set((state) => {
          const { queueKey, indexKey } = getQueueKeys(queueType);
          let currentQueue = state[queueKey];

          // For mainQueue, prevent duplicates - remove existing and re-add at end
          if (queueType === 'main') {
            const existingIndex = currentQueue.findIndex(item => item.asset.id === asset.id);
            if (existingIndex !== -1) {
              currentQueue = currentQueue.filter(item => item.asset.id !== asset.id);
            }
          }

          const newQueue = [
            ...currentQueue,
            {
              asset,
              operation,
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
            operation,
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
        operationInputModePrefs: {},

        // ─────────────────────────────────────────────────────────────────────
        // Canonical Queue API
        // ─────────────────────────────────────────────────────────────────────

        enqueueAsset: ({ asset, operationType, slotIndex, forceMulti }) => {
          const queueType = resolveQueueTypeImpl(operationType, forceMulti);

          if (slotIndex !== undefined) {
            addToQueueAtIndexHelper(queueType, asset, slotIndex, operationType);
          } else {
            addToQueueHelper(queueType, asset, operationType);
          }
        },

        getInputModeForOperation: getInputModeForOperationImpl,

        setOperationInputMode: (operationType, mode) => {
          const metadata = OPERATION_METADATA[operationType];
          if (!metadata || metadata.multiAssetMode !== 'optional') {
            console.warn(
              `[GenerationQueueStore] setOperationInputMode: operation "${operationType}" is not optional, ignoring preference`
            );
            return;
          }

          set((state) => ({
            operationInputModePrefs: {
              ...state.operationInputModePrefs,
              [operationType]: mode,
            },
          }));
        },

        resolveQueueType: resolveQueueTypeImpl,

        // ─────────────────────────────────────────────────────────────────────
        // Legacy Actions (kept for backward compatibility)
        // ─────────────────────────────────────────────────────────────────────

        addToQueue: (asset, operation) => addToQueueHelper('main', asset, operation),
        addToMultiAssetQueue: (asset) => addToQueueHelper('multi', asset),
        addToQueueAtIndex: (asset, index, operation) => addToQueueAtIndexHelper('main', asset, index, operation),
        addToMultiAssetQueueAtIndex: (asset, index) => addToQueueAtIndexHelper('multi', asset, index),

      removeFromQueue: (assetId, queueType = 'main') => {
        set((state) => {
          const { queueKey, indexKey } = getQueueKeys(queueType);
          const newQueue = state[queueKey].filter((item) => item.asset.id !== assetId);
          const currentIndex = state[indexKey];
          // Clamp index to new queue bounds (1-indexed)
          const newIndex = newQueue.length === 0 ? 1 : Math.max(1, Math.min(currentIndex, newQueue.length));
          return {
            [queueKey]: newQueue,
            [indexKey]: newIndex,
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

          // Just cycle the index, don't rotate the queue array
          // Queue stays static - index moves through it
          let nextIndex: number;

          if (direction === 'next') {
            nextIndex = currentIndex >= length ? 1 : currentIndex + 1;
          } else {
            nextIndex = currentIndex <= 1 ? length : currentIndex - 1;
          }

          return {
            [indexKey]: nextIndex,
          } as Partial<GenerationQueueState>;
        });
      },

      setQueueIndex: (queueType, index) => {
        set((state) => {
          const { queueKey, indexKey } = getQueueKeys(queueType);
          const queue = state[queueKey];
          const length = queue?.length || 0;

          if (!queue || length === 0) {
            return {};
          }

          // Clamp index to valid range (1-indexed)
          const clampedIndex = Math.max(1, Math.min(index, length));

          return {
            [indexKey]: clampedIndex,
          } as Partial<GenerationQueueState>;
        });
      },
    };
  },
    {
      name: 'generation_queue_v4',
      version: 1,
      // Queues, indices, and preferences need to be persisted; methods are recreated.
      partialize: (state) => ({
        mainQueue: state.mainQueue,
        multiAssetQueue: state.multiAssetQueue,
        mainQueueIndex: state.mainQueueIndex,
        multiAssetQueueIndex: state.multiAssetQueueIndex,
        operationInputModePrefs: state.operationInputModePrefs,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<GenerationQueueState>;

        // Migration from v3 (no version) to v4 with version 1
        // Just ensure operationInputModePrefs exists
        if (version < 1) {
          return {
            ...state,
            operationInputModePrefs: state.operationInputModePrefs ?? {},
          };
        }

        return state;
      },
      onRehydrateStorage: () => (state) => {
        // Validate and clamp indices to be within queue bounds
        if (state) {
          const mainLength = state.mainQueue?.length || 0;
          const multiLength = state.multiAssetQueue?.length || 0;

          // Clamp mainQueueIndex (1-indexed, so valid range is 1 to length, or 1 if empty)
          if (mainLength === 0) {
            state.mainQueueIndex = 1;
          } else if (state.mainQueueIndex < 1 || state.mainQueueIndex > mainLength) {
            state.mainQueueIndex = Math.max(1, Math.min(state.mainQueueIndex, mainLength));
          }

          // Clamp multiAssetQueueIndex
          if (multiLength === 0) {
            state.multiAssetQueueIndex = 1;
          } else if (state.multiAssetQueueIndex < 1 || state.multiAssetQueueIndex > multiLength) {
            state.multiAssetQueueIndex = Math.max(1, Math.min(state.multiAssetQueueIndex, multiLength));
          }
        }
      },
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// Selector Helpers (for use outside React components)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the effective queue for an operation type.
 * This is a static helper for use outside of React components.
 */
export function getQueueForOperation(operationType: OperationType): QueuedAsset[] {
  const state = useGenerationQueueStore.getState();
  const queueType = state.resolveQueueType(operationType);
  return queueType === 'main' ? state.mainQueue : state.multiAssetQueue;
}
