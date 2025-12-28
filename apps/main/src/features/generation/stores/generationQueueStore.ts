/**
 * Generation Queue Store
 *
 * Manages queued assets for generation operations.
 * Facilitates communication between Gallery (MediaCard) and Generation Widgets.
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
 *
 * ## Scoping
 *
 * Queue stores can be scoped per generation widget instance:
 * - Use `createGenerationQueueStore(storageKey)` to create a scoped store
 * - Use `useGenerationQueueStore` for the global singleton (backward compatibility)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AssetModel } from '@features/assets';
import { OPERATION_METADATA, type OperationType } from '@/types/operations';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type InputMode = 'single' | 'multi';

export interface QueuedAsset {
  asset: AssetModel;
  operation?: OperationType;
  queuedAt: string;
  lockedTimestamp?: number; // Locked frame timestamp in seconds (for video assets)
}

export interface EnqueueOptions {
  asset: AssetModel;
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
  addToQueue: (asset: AssetModel, operation?: OperationType) => void;
  /** @deprecated Use enqueueAsset() instead */
  addToMultiAssetQueue: (asset: AssetModel) => void;
  /** @deprecated Use enqueueAsset() instead */
  addToQueueAtIndex: (asset: AssetModel, index: number, operation?: OperationType) => void;
  /** @deprecated Use enqueueAsset() instead */
  addToMultiAssetQueueAtIndex: (asset: AssetModel, index: number) => void;

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

// ─────────────────────────────────────────────────────────────────────────────
// Store Hook Type
// ─────────────────────────────────────────────────────────────────────────────

export type GenerationQueueStoreHook = <T>(
  selector: (state: GenerationQueueState) => T
) => T;

// Helper to get queue key and index key from queue type
type QueueKeys = {
  queueKey: 'mainQueue' | 'multiAssetQueue';
  indexKey: 'mainQueueIndex' | 'multiAssetQueueIndex';
};

function normalizeQueuedAsset(asset: any): AssetModel {
  if (!asset || typeof asset !== 'object') {
    return {
      id: 0,
      createdAt: new Date().toISOString(),
      description: null,
      durationSec: null,
      fileSizeBytes: null,
      fileUrl: null,
      height: null,
      isArchived: false,
      lastUploadStatusByProvider: null,
      localPath: null,
      mediaType: 'image',
      mimeType: null,
      previewKey: null,
      previewUrl: null,
      providerAssetId: 'unknown',
      providerId: 'unknown',
      providerStatus: null,
      remoteUrl: null,
      sourceGenerationId: null,
      storedKey: null,
      syncStatus: 'remote',
      tags: undefined,
      thumbnailKey: null,
      thumbnailUrl: null,
      userId: 0,
      width: null,
    };
  }

  if (asset.mediaType) {
    return asset as AssetModel;
  }

  const mediaType =
    asset.media_type ||
    asset.type ||
    asset.mediaType ||
    'image';

  return {
    id: asset.id,
    createdAt: asset.createdAt || asset.created_at || new Date().toISOString(),
    description: asset.description ?? null,
    durationSec: asset.durationSec ?? asset.duration_sec ?? null,
    fileSizeBytes: asset.fileSizeBytes ?? asset.file_size_bytes ?? null,
    fileUrl: asset.fileUrl ?? asset.file_url ?? null,
    height: asset.height ?? null,
    isArchived: asset.isArchived ?? asset.is_archived ?? false,
    lastUploadStatusByProvider:
      asset.lastUploadStatusByProvider ?? asset.last_upload_status_by_provider ?? null,
    localPath: asset.localPath ?? asset.local_path ?? null,
    mediaType,
    mimeType: asset.mimeType ?? asset.mime_type ?? null,
    previewKey: asset.previewKey ?? asset.preview_key ?? null,
    previewUrl: asset.previewUrl ?? asset.preview_url ?? null,
    providerAssetId: asset.providerAssetId ?? asset.provider_asset_id ?? String(asset.id),
    providerId: asset.providerId ?? asset.provider_id ?? 'unknown',
    providerStatus: asset.providerStatus ?? asset.provider_status ?? null,
    remoteUrl: asset.remoteUrl ?? asset.remote_url ?? null,
    sourceGenerationId: asset.sourceGenerationId ?? asset.source_generation_id ?? null,
    storedKey: asset.storedKey ?? asset.stored_key ?? null,
    syncStatus: asset.syncStatus ?? asset.sync_status ?? 'remote',
    tags: asset.tags ?? undefined,
    thumbnailKey: asset.thumbnailKey ?? asset.thumbnail_key ?? null,
    thumbnailUrl: asset.thumbnailUrl ?? asset.thumbnail_url ?? null,
    userId: asset.userId ?? asset.user_id ?? 0,
    width: asset.width ?? null,
  };
}

function getQueueKeys(queueType: 'main' | 'multi'): QueueKeys {
  return queueType === 'main'
    ? { queueKey: 'mainQueue', indexKey: 'mainQueueIndex' }
    : { queueKey: 'multiAssetQueue', indexKey: 'multiAssetQueueIndex' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a scoped generation queue store.
 * Use this to create queue stores for specific generation widget instances.
 */
export function createGenerationQueueStore(storageKey: string): GenerationQueueStoreHook {
  return create<GenerationQueueState>()(
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
              `[GenerationQueueStore:${storageKey}] resolveQueueType("${operationType}", forceMulti=${forceMulti}) → "${result}" (${reason})`
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
          asset: AssetModel,
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
          asset: AssetModel,
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
        name: storageKey,
        storage: createJSONStorage(() => localStorage),
        version: 2,
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

          if (version < 1) {
            return {
              ...state,
              operationInputModePrefs: state.operationInputModePrefs ?? {},
            };
          }

          if (version < 2) {
            const normalizeQueue = (queue?: QueuedAsset[]) =>
              (queue ?? []).map((item) =>
                item && item.asset
                  ? { ...item, asset: normalizeQueuedAsset(item.asset) }
                  : item
              );

            return {
              ...state,
              mainQueue: normalizeQueue(state.mainQueue),
              multiAssetQueue: normalizeQueue(state.multiAssetQueue),
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Singleton (backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global generation queue store.
 * Use this for backward compatibility or when a global queue is needed.
 * For scoped queues, use `useGenerationScopeStores().useQueueStore` instead.
 */
export const useGenerationQueueStore = createGenerationQueueStore('generation_queue_v4');

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
