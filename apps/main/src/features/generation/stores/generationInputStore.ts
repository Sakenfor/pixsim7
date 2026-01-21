/**
 * Generation Input Store
 *
 * Manages per-operation input lists (formerly queues) for generation.
 * Inputs are scoped by operation type and persisted to localStorage.
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AssetModel } from '@features/assets';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

export interface InputItem {
  id: string;
  asset: AssetModel;
  queuedAt: string;
  lockedTimestamp?: number; // Locked frame timestamp in seconds (for video assets)
}

export interface OperationInputs {
  items: InputItem[];
  currentIndex: number; // 1-based
}

export interface AddInputOptions {
  asset: AssetModel;
  operationType: OperationType;
  slotIndex?: number;
}

export interface GenerationInputsState {
  inputsByOperation: Partial<Record<OperationType, OperationInputs>>;

  addInput: (options: AddInputOptions) => void;
  addInputs: (options: { assets: AssetModel[]; operationType: OperationType }) => void;
  removeInput: (operationType: OperationType, inputId: string) => void;
  removeAssetFromOperation: (operationType: OperationType, assetId: number) => void;
  removeAssetEverywhere: (assetId: number) => void;
  clearInputs: (operationType: OperationType) => void;
  clearAllInputs: () => void;
  updateLockedTimestamp: (operationType: OperationType, inputId: string, timestamp: number | undefined) => void;
  cycleInputs: (operationType: OperationType, direction?: 'next' | 'prev') => void;
  setInputIndex: (operationType: OperationType, index: number) => void;

  getCurrentInput: (operationType: OperationType) => InputItem | null;
  getInputs: (operationType: OperationType) => InputItem[];
  getAllInputs: () => InputItem[];
}

export type GenerationInputStoreHook = UseBoundStore<StoreApi<GenerationInputsState>>;

function createInputId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createInputItem(asset: AssetModel): InputItem {
  return {
    id: createInputId(),
    asset,
    queuedAt: new Date().toISOString(),
  };
}

function normalizeIndex(index: number, length: number): number {
  if (length <= 0) return 1;
  return Math.max(1, Math.min(index, length));
}

function getOperationInputs(
  inputsByOperation: Partial<Record<OperationType, OperationInputs>>,
  operationType: OperationType
): OperationInputs {
  return inputsByOperation[operationType] ?? { items: [], currentIndex: 1 };
}

function isSingleOperation(operationType: OperationType): boolean {
  return OPERATION_METADATA[operationType]?.multiAssetMode === 'single';
}

function allowDuplicates(operationType: OperationType): boolean {
  return operationType === 'video_transition';
}

export function createGenerationInputStore(storageKey: string): GenerationInputStoreHook {
  return create<GenerationInputsState>()(
    persist(
      (set, get) => ({
        inputsByOperation: {},

        addInput: ({ asset, operationType, slotIndex }) => {
          set((state) => {
            if (isSingleOperation(operationType)) {
              return {
                inputsByOperation: {
                  ...state.inputsByOperation,
                  [operationType]: {
                    items: [createInputItem(asset)],
                    currentIndex: 1,
                  },
                },
              };
            }

            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const shouldAllowDuplicates = allowDuplicates(operationType);
            const nextItem = createInputItem(asset);
            let nextItems = [...existing.items];
            let adjustedSlotIndex = slotIndex;

            if (!shouldAllowDuplicates) {
              const existingIndex = nextItems.findIndex((item) => item.asset.id === asset.id);
              if (slotIndex !== undefined && existingIndex === slotIndex) {
                return {
                  inputsByOperation: {
                    ...state.inputsByOperation,
                    [operationType]: {
                      items: nextItems,
                      currentIndex: normalizeIndex(slotIndex + 1, nextItems.length),
                    },
                  },
                };
              }

              if (existingIndex !== -1) {
                nextItems = nextItems.filter((item) => item.asset.id !== asset.id);
                if (slotIndex !== undefined && existingIndex < slotIndex) {
                  adjustedSlotIndex = slotIndex - 1;
                }
              }
            }

            if (slotIndex !== undefined) {
              const targetIndex = adjustedSlotIndex ?? slotIndex;
              if (targetIndex < nextItems.length) {
                nextItems[targetIndex] = nextItem;
              } else {
                nextItems.push(nextItem);
              }
              const nextIndex = normalizeIndex(targetIndex + 1, nextItems.length);
              return {
                inputsByOperation: {
                  ...state.inputsByOperation,
                  [operationType]: {
                    items: nextItems,
                    currentIndex: nextIndex,
                  },
                },
              };
            }

            if (!shouldAllowDuplicates) {
              nextItems = nextItems.filter((item) => item.asset.id !== asset.id);
            }

            nextItems = [...nextItems, nextItem];
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  items: nextItems,
                  currentIndex: normalizeIndex(nextItems.length, nextItems.length),
                },
              },
            };
          });
        },

        addInputs: ({ assets, operationType }) => {
          if (!assets || assets.length === 0) return;

          set((state) => {
            if (isSingleOperation(operationType)) {
              const lastAsset = assets[assets.length - 1];
              return {
                inputsByOperation: {
                  ...state.inputsByOperation,
                  [operationType]: {
                    items: [createInputItem(lastAsset)],
                    currentIndex: 1,
                  },
                },
              };
            }

            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const shouldAllowDuplicates = allowDuplicates(operationType);
            let nextItems = [...existing.items];

            assets.forEach((asset) => {
              if (!shouldAllowDuplicates) {
                nextItems = nextItems.filter((item) => item.asset.id !== asset.id);
              }
              nextItems.push(createInputItem(asset));
            });

            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  items: nextItems,
                  currentIndex: normalizeIndex(nextItems.length, nextItems.length),
                },
              },
            };
          });
        },

        removeInput: (operationType, inputId) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const nextItems = existing.items.filter((item) => item.id !== inputId);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  items: nextItems,
                  currentIndex: normalizeIndex(existing.currentIndex, nextItems.length),
                },
              },
            };
          });
        },

        removeAssetFromOperation: (operationType, assetId) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const nextItems = existing.items.filter((item) => item.asset.id !== assetId);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  items: nextItems,
                  currentIndex: normalizeIndex(existing.currentIndex, nextItems.length),
                },
              },
            };
          });
        },

        removeAssetEverywhere: (assetId) => {
          set((state) => {
            const nextMap: Partial<Record<OperationType, OperationInputs>> = {};
            (Object.keys(state.inputsByOperation) as OperationType[]).forEach((operationType) => {
              const existing = getOperationInputs(state.inputsByOperation, operationType);
              const nextItems = existing.items.filter((item) => item.asset.id !== assetId);
              nextMap[operationType] = {
                items: nextItems,
                currentIndex: normalizeIndex(existing.currentIndex, nextItems.length),
              };
            });

            return { inputsByOperation: nextMap };
          });
        },

        clearInputs: (operationType) => {
          set((state) => ({
            inputsByOperation: {
              ...state.inputsByOperation,
              [operationType]: { items: [], currentIndex: 1 },
            },
          }));
        },

        clearAllInputs: () => {
          set(() => ({ inputsByOperation: {} }));
        },

        updateLockedTimestamp: (operationType, inputId, timestamp) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId ? { ...item, lockedTimestamp: timestamp } : item
                  ),
                },
              },
            };
          });
        },

        cycleInputs: (operationType, direction = 'next') => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const length = existing.items.length;
            if (length <= 1) return {};

            let nextIndex = existing.currentIndex;
            if (direction === 'next') {
              nextIndex = nextIndex >= length ? 1 : nextIndex + 1;
            } else {
              nextIndex = nextIndex <= 1 ? length : nextIndex - 1;
            }

            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  currentIndex: nextIndex,
                },
              },
            };
          });
        },

        setInputIndex: (operationType, index) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const length = existing.items.length;
            if (length === 0) return {};

            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  currentIndex: normalizeIndex(index, length),
                },
              },
            };
          });
        },

        getCurrentInput: (operationType) => {
          const existing = getOperationInputs(get().inputsByOperation, operationType);
          if (existing.items.length === 0) return null;
          const index = normalizeIndex(existing.currentIndex, existing.items.length) - 1;
          return existing.items[index] ?? null;
        },

        getInputs: (operationType) => {
          return getOperationInputs(get().inputsByOperation, operationType).items;
        },

        getAllInputs: () => {
          const inputsByOperation = get().inputsByOperation;
          return (Object.keys(inputsByOperation) as OperationType[]).flatMap(
            (operationType) => inputsByOperation[operationType]?.items ?? []
          );
        },
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => localStorage),
        version: 1,
        partialize: (state) => ({
          inputsByOperation: state.inputsByOperation,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          const inputsByOperation = state.inputsByOperation ?? {};
          (Object.keys(inputsByOperation) as OperationType[]).forEach((operationType) => {
            const existing = inputsByOperation[operationType];
            if (!existing) return;
            const length = existing.items?.length ?? 0;
            existing.currentIndex = normalizeIndex(existing.currentIndex ?? 1, length);
          });
          state.inputsByOperation = inputsByOperation;
        },
      },
    ),
  );
}

export const useGenerationInputStore = createGenerationInputStore('generation_inputs_v1');

export function getInputsForOperation(operationType: OperationType): InputItem[] {
  const state = useGenerationInputStore.getState();
  return getOperationInputs(state.inputsByOperation, operationType).items;
}
