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
  slotIndex?: number;
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
  armedSlotByOperation: Partial<Record<OperationType, number>>;
  inputModeByOperation: Partial<Record<OperationType, 'append' | 'replace'>>;

  setInputMode: (operationType: OperationType, mode: 'append' | 'replace') => void;
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
  setArmedSlot: (operationType: OperationType, slotIndex?: number | null) => void;
  reorderInput: (operationType: OperationType, fromSlotIndex: number, toSlotIndex: number) => void;

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

function createInputItem(asset: AssetModel, slotIndex: number): InputItem {
  return {
    id: createInputId(),
    asset,
    queuedAt: new Date().toISOString(),
    slotIndex,
  };
}

function normalizeIndex(index: number, length: number): number {
  if (length <= 0) return 1;
  return Math.max(1, Math.min(index, length));
}

function getSlotIndex(item: InputItem, fallback: number): number {
  if (typeof item.slotIndex === 'number' && Number.isFinite(item.slotIndex)) {
    return Math.max(0, Math.floor(item.slotIndex));
  }
  return fallback;
}

function normalizeInputItems(items: InputItem[]): InputItem[] {
  if (!items || items.length === 0) return [];
  const used = new Set<number>();
  let nextIndex = 0;

  const normalized = items.map((item, idx) => {
    let slotIndex = getSlotIndex(item, idx);
    if (used.has(slotIndex)) {
      while (used.has(nextIndex)) {
        nextIndex += 1;
      }
      slotIndex = nextIndex;
    }
    used.add(slotIndex);
    if (item.slotIndex === slotIndex) {
      return item;
    }
    return { ...item, slotIndex };
  });

  return normalized.sort((a, b) => getSlotIndex(a, 0) - getSlotIndex(b, 0));
}

function getNextSlotIndex(items: InputItem[]): number {
  if (!items || items.length === 0) return 0;
  const maxIndex = items.reduce((max, item, idx) => {
    const slotIndex = getSlotIndex(item, idx);
    return Math.max(max, slotIndex);
  }, -1);
  return maxIndex + 1;
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
        armedSlotByOperation: {},
        inputModeByOperation: {},

        setInputMode: (operationType, mode) => {
          set((state) => ({
            inputModeByOperation: {
              ...state.inputModeByOperation,
              [operationType]: mode,
            },
          }));
        },

        addInput: ({ asset, operationType, slotIndex }) => {
          set((state) => {
            if (isSingleOperation(operationType)) {
              const existing = getOperationInputs(state.inputsByOperation, operationType);
              const preferredSlot = state.armedSlotByOperation?.[operationType];
              const hasExplicitSlot =
                (typeof slotIndex === 'number' && Number.isFinite(slotIndex)) ||
                (typeof preferredSlot === 'number' && Number.isFinite(preferredSlot));

              let nextItems = [...existing.items];
              // Deduplicate — if asset already queued, remove old entry
              nextItems = nextItems.filter((item) => item.asset.id !== asset.id);

              // Determine target slot: explicit slot from picker, or slot 0 (replace primary)
              let targetSlot: number;
              if (typeof slotIndex === 'number' && Number.isFinite(slotIndex)) {
                targetSlot = Math.max(0, Math.floor(slotIndex));
              } else if (typeof preferredSlot === 'number' && Number.isFinite(preferredSlot)) {
                targetSlot = Math.max(0, Math.floor(preferredSlot));
              } else {
                targetSlot = 0;
              }

              // Replace any existing item at the target slot
              nextItems = nextItems.filter((item) => getSlotIndex(item, 0) !== targetSlot);
              const newItem = createInputItem(asset, targetSlot);
              nextItems.push(newItem);
              nextItems = normalizeInputItems(nextItems);

              const nextIndex = normalizeIndex(
                nextItems.findIndex((item) => item.id === newItem.id) + 1,
                nextItems.length
              );
              return {
                inputsByOperation: {
                  ...state.inputsByOperation,
                  [operationType]: {
                    items: nextItems,
                    currentIndex: nextIndex,
                  },
                },
                ...(hasExplicitSlot
                  ? {
                      armedSlotByOperation: {
                        ...state.armedSlotByOperation,
                        [operationType]: undefined,
                      },
                    }
                  : {}),
              };
            }

            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const shouldAllowDuplicates = allowDuplicates(operationType);
            let nextItems = normalizeInputItems([...existing.items]);
            const preferredSlot = state.armedSlotByOperation?.[operationType];
            const inputMode = state.inputModeByOperation?.[operationType];
            let targetSlotIndex: number;
            if (typeof slotIndex === 'number' && Number.isFinite(slotIndex)) {
              targetSlotIndex = Math.max(0, Math.floor(slotIndex));
            } else if (typeof preferredSlot === 'number' && Number.isFinite(preferredSlot)) {
              targetSlotIndex = Math.max(0, Math.floor(preferredSlot));
            } else if (inputMode === 'replace' && existing.items.length > 0) {
              const currentIdx = Math.max(0, existing.currentIndex - 1);
              const currentItem = existing.items[currentIdx];
              targetSlotIndex = currentItem ? getSlotIndex(currentItem, 0) : getNextSlotIndex(nextItems);
            } else {
              targetSlotIndex = getNextSlotIndex(nextItems);
            }

            const nextItem = createInputItem(asset, targetSlotIndex);

            if (!shouldAllowDuplicates) {
              const existingIndex = nextItems.findIndex((item) => item.asset.id === asset.id);
              if (existingIndex !== -1) {
                nextItems = nextItems.filter((item) => item.asset.id !== asset.id);
              }
            }

            nextItems = nextItems.filter((item) => getSlotIndex(item, 0) !== targetSlotIndex);
            nextItems = normalizeInputItems([...nextItems, nextItem]);
            const nextIndex = normalizeIndex(
              nextItems.findIndex((item) => item.id === nextItem.id) + 1,
              nextItems.length
            );
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  items: nextItems,
                  currentIndex: nextIndex,
                },
              },
              armedSlotByOperation:
                typeof preferredSlot === 'number' ||
                (typeof slotIndex === 'number' && Number.isFinite(slotIndex))
                  ? {
                      ...state.armedSlotByOperation,
                      [operationType]: undefined,
                    }
                  : state.armedSlotByOperation,
            };
          });
        },

        addInputs: ({ assets, operationType }) => {
          if (!assets || assets.length === 0) return;

          // In replace mode with a single asset, delegate to addInput for replace logic
          const inputMode = get().inputModeByOperation?.[operationType];
          if (inputMode === 'replace' && assets.length === 1) {
            get().addInput({ asset: assets[0], operationType });
            return;
          }

          set((state) => {
            if (isSingleOperation(operationType)) {
              const lastAsset = assets[assets.length - 1];
              return {
                inputsByOperation: {
                  ...state.inputsByOperation,
                  [operationType]: {
                    items: [createInputItem(lastAsset, 0)],
                    currentIndex: 1,
                  },
                },
              };
            }

            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const shouldAllowDuplicates = allowDuplicates(operationType);
            let nextItems = normalizeInputItems([...existing.items]);
            let nextSlotIndex = getNextSlotIndex(nextItems);
            let lastAddedId: string | null = null;

            assets.forEach((asset) => {
              if (!shouldAllowDuplicates) {
                nextItems = nextItems.filter((item) => item.asset.id !== asset.id);
              }
              const nextItem = createInputItem(asset, nextSlotIndex);
              nextSlotIndex += 1;
              nextItems.push(nextItem);
              lastAddedId = nextItem.id;
            });

            nextItems = normalizeInputItems(nextItems);
            const lastIndex = lastAddedId
              ? nextItems.findIndex((item) => item.id === lastAddedId)
              : -1;
            const nextIndex = normalizeIndex(
              lastIndex >= 0 ? lastIndex + 1 : nextItems.length,
              nextItems.length
            );
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  items: nextItems,
                  currentIndex: nextIndex,
                },
              },
              armedSlotByOperation: state.armedSlotByOperation?.[operationType] !== undefined
                ? {
                    ...state.armedSlotByOperation,
                    [operationType]: undefined,
                  }
                : state.armedSlotByOperation,
            };
          });
        },

        removeInput: (operationType, inputId) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            const nextItems = normalizeInputItems(
              existing.items.filter((item) => item.id !== inputId)
            );
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
            const nextItems = normalizeInputItems(
              existing.items.filter((item) => item.asset.id !== assetId)
            );
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
              const nextItems = normalizeInputItems(
                existing.items.filter((item) => item.asset.id !== assetId)
              );
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
            armedSlotByOperation: {
              ...state.armedSlotByOperation,
              [operationType]: undefined,
            },
          }));
        },

        clearAllInputs: () => {
          set(() => ({ inputsByOperation: {}, armedSlotByOperation: {} }));
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

        setArmedSlot: (operationType, slotIndex) => {
          set((state) => {
            const nextIndex =
              typeof slotIndex === 'number' && Number.isFinite(slotIndex)
                ? Math.max(0, Math.floor(slotIndex))
                : undefined;
            return {
              armedSlotByOperation: {
                ...state.armedSlotByOperation,
                [operationType]: nextIndex,
              },
            };
          });
        },

        reorderInput: (operationType, fromSlotIndex, toSlotIndex) => {
          if (fromSlotIndex === toSlotIndex) return;
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            if (existing.items.length === 0) return {};

            const nextItems = existing.items.map((item) => {
              const slot = getSlotIndex(item, 0);
              if (slot === fromSlotIndex) return { ...item, slotIndex: toSlotIndex };
              if (slot === toSlotIndex) return { ...item, slotIndex: fromSlotIndex };
              return item;
            });

            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: normalizeInputItems(nextItems),
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
            existing.items = normalizeInputItems(existing.items ?? []);
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
