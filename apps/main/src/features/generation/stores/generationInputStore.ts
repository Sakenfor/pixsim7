/**
 * Generation Input Store
 *
 * Manages per-operation input lists (formerly queues) for generation.
 * Inputs are scoped by operation type and persisted to localStorage.
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { hmrSingleton } from '@lib/utils';

import { fromAssetResponse, type AssetModel } from '@features/assets';
// Deep-import the event bus from its leaf module, not the barrel: the
// top-level `assetEvents.subscribeToUpdates(...)` registration below runs
// during this module's init, and entering the import graph from a non-app
// root (e.g. a test importing quickGenerateLogic) leaves the heavy
// `@features/assets` barrel mid-initialization, so `assetEvents` resolves to
// undefined. The leaf module has no cycle back into generation.
import { assetEvents } from '@features/assets/lib/assetEvents';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

export type PickStrategy = 'random' | 'sequential' | 'no_repeat';

export interface AssetSetSlotRef {
  setId: number;                                  // references AssetSet.id (backend int id)
  mode: 'random_each' | 'locked' | 'iterate';     // pick timing / iteration role
  lockedAssetId?: number;                         // for 'locked' mode — the pinned pick
  originalAssetId?: number;                       // asset that was in the slot before linking
  pickStrategy?: PickStrategy;                    // random_each: per-run pick; iterate: traversal order
  pickIndex?: number;                             // sequential counter (random_each)
  recentPicks?: number[];                         // no_repeat history (random_each)
}

export interface InputMaskLayer {
  id: string;
  assetUrl: string;     // 'asset:42' — references a saved mask asset
  label?: string;       // user-facing name (e.g. 'bra', 'panty')
  visible: boolean;     // toggle for composition
  opacity?: number;     // per-layer opacity (0-1, defaults to 1)
}

export interface InputItem {
  id: string;
  asset: AssetModel;
  queuedAt: string;
  slotIndex?: number;
  lockedTimestamp?: number; // Locked frame timestamp in seconds (for video assets)
  roleOverride?: string; // e.g. 'environment' or 'main_character'
  assetSetRef?: AssetSetSlotRef; // optional set linkage for variety picks
  maskUrl?: string; // DEPRECATED — kept for migration, prefer maskLayers
  maskLayers?: InputMaskLayer[]; // List of mask layers to composite at generation time
  skipped?: boolean; // Temporarily omit this input from generation
  /**
   * Per-input prompt value, REMEMBERED across un-pin so the toggle can restore
   * it. `promptPinned` decides whether it's currently ACTIVE; only when active
   * does this input generate with this prompt instead of the operation default.
   * Read the effective pinned prompt via `getPinnedPrompt(item)`.
   * Plan: `per-asset-prompt-pin`.
   */
  promptOverride?: string;
  /**
   * Whether `promptOverride` is currently active. Toggling off keeps the value
   * (so re-pinning restores it); toggling on with no remembered value snapshots
   * the current prompt. Set via `togglePinPrompt`. Plan: `per-asset-prompt-pin`.
   */
  promptPinned?: boolean;
  /**
   * Per-input dynamic-param overrides (the prompt pin, generalized to any scalar
   * setting). Each key present here overrides the shared operation-default param
   * for THIS input only (e.g. `{ duration: 8 }`); keys absent follow the shared
   * default, so editing a shared control still updates all un-bound inputs at
   * once. An empty/absent map = fully follows the shared defaults. Set via
   * `setInputParamOverride` (bind one key; pass undefined to un-bind). Resolved at
   * generation time alongside `promptOverride`. Plan: `per-input-param-override`.
   */
  paramOverrides?: Record<string, any>;
}

/**
 * The effective pinned prompt for an input: its remembered `promptOverride`
 * only when `promptPinned` is active and the value is non-empty, else undefined
 * (→ caller falls back to the operation-default prompt). Single source of truth
 * for pin resolution across the controller, PromptPanel, and insert actions.
 * Plan: `per-asset-prompt-pin`.
 */
export function getPinnedPrompt(item: InputItem | null | undefined): string | undefined {
  if (!item?.promptPinned) return undefined;
  const value = item.promptOverride;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface OperationInputs {
  items: InputItem[];
  currentIndex: number; // 1-based
}

/**
 * Which axis the input-slot prev/next navigation (chevrons, `[`/`]`, wheel)
 * walks.
 *   - `time`: created_at within media_type+operation_type (default).
 *   - `source`: walk siblings of the asset's source — adapts per asset:
 *       generated asset → same prompt_version_id cohort (the old `prompt`
 *       behavior); LocalAssetModel → same folder + directory; otherwise
 *       falls back to time. Legacy persisted `'prompt'` values are
 *       normalized to `'source'` at read time in `useInputSlotNavigation`.
 * Plan: `media-card-input-time-nav`.
 */
export type InputNavCohort = 'time' | 'source';

export interface AddInputOptions {
  asset: AssetModel;
  operationType: OperationType;
  slotIndex?: number;
}

export interface GenerationInputsState {
  inputsByOperation: Partial<Record<OperationType, OperationInputs>>;
  /** Saved inputs per provider+operation for restore on provider switch */
  inputsByProviderOp: Record<string, OperationInputs>;
  /**
   * Provider id currently associated with the items in `inputsByOperation[op]`.
   * The store owns this so `switchProviderInputs` can resolve the "old"
   * bucket without trusting a caller-supplied value that may have drifted
   * (e.g. from model-triggered `inferredProviderId` changes).
   */
  currentProviderByOp: Partial<Record<OperationType, string | undefined>>;
  armedSlotByOperation: Partial<Record<OperationType, number>>;
  inputModeByOperation: Partial<Record<OperationType, 'append' | 'replace'>>;
  /** Per-operation prev/next navigation cohort (defaults to 'time'). */
  navCohortByOperation: Partial<Record<OperationType, InputNavCohort>>;

  setInputMode: (operationType: OperationType, mode: 'append' | 'replace') => void;
  /** Set the prev/next navigation cohort for an operation. */
  setInputNavCohort: (operationType: OperationType, cohort: InputNavCohort) => void;
  addInput: (options: AddInputOptions) => void;
  addInputs: (options: { assets: AssetModel[]; operationType: OperationType }) => void;
  removeInput: (operationType: OperationType, inputId: string) => void;
  /**
   * Swap the AssetModel on an existing input in-place, preserving slotIndex
   * and all per-input metadata (lockedTimestamp, maskLayers, roleOverride,
   * assetSetRef, skipped). Used by input-slot time-axis navigation
   * (`media-card-input-time-nav` plan). Honors the fresh-asset-ref rule —
   * the new asset must be a new AssetModel reference.
   */
  replaceInputAsset: (operationType: OperationType, inputId: string, asset: AssetModel) => void;
  removeAssetFromOperation: (operationType: OperationType, assetId: number) => void;
  removeAssetEverywhere: (assetId: number) => void;
  clearInputs: (operationType: OperationType) => void;
  clearAllInputs: () => void;
  updateLockedTimestamp: (operationType: OperationType, inputId: string, timestamp: number | undefined) => void;
  updateRoleOverride: (operationType: OperationType, inputId: string, role: string | undefined) => void;
  /**
   * Set a per-input prompt VALUE (the remembered `promptOverride`). Used while
   * editing a pinned input, or by insert. Pass `{ pin: true }` to also activate
   * the pin (insert), or `{ pin: false }` to deactivate; omit to leave the
   * active flag untouched. Plan: `per-asset-prompt-pin`.
   */
  setInputPrompt: (
    operationType: OperationType,
    inputId: string,
    prompt: string | undefined,
    options?: { pin?: boolean },
  ) => void;
  /**
   * Toggle a per-input prompt pin. Off keeps the remembered `promptOverride` so
   * re-pinning restores it; on with no remembered value snapshots `fallbackPrompt`
   * (the current operation prompt, supplied by the caller). Plan: `per-asset-prompt-pin`.
   */
  togglePinPrompt: (operationType: OperationType, inputId: string, fallbackPrompt: string) => void;
  /**
   * Bind (or un-bind) a single dynamic param for one input — the prompt pin
   * generalized. Pass a value to override `key` for THIS input only; pass
   * undefined to un-bind that key (falls back to the shared operation default).
   * When un-binding empties the map, `paramOverrides` is cleared to undefined so a
   * hollow map can't shadow the shared defaults. Plan: `per-input-param-override`.
   */
  setInputParamOverride: (operationType: OperationType, inputId: string, key: string, value: any | undefined) => void;
  cycleInputs: (operationType: OperationType, direction?: 'next' | 'prev') => void;
  setInputIndex: (operationType: OperationType, index: number) => void;
  setArmedSlot: (operationType: OperationType, slotIndex?: number | null) => void;
  reorderInput: (operationType: OperationType, fromSlotIndex: number, toSlotIndex: number) => void;
  updateAssetModel: (assetId: number, updatedAsset: AssetModel) => void;
  setAssetSetRef: (operationType: OperationType, inputId: string, ref: AssetSetSlotRef | undefined) => void;
  updateAssetSetMode: (operationType: OperationType, inputId: string, mode: AssetSetSlotRef['mode']) => void;
  lockAssetSetPick: (operationType: OperationType, inputId: string, assetId: number) => void;
  /**
   * Atomic "pin to this set member": flips `assetSetRef.mode` to `'locked'`,
   * sets `lockedAssetId` AND updates the slot's display `asset` in a single
   * store update. Used by set-cohort chevron/grid commits so the user's
   * pick can't desync from the displayed representative. Plan:
   * `set-slot-walk-and-grid`. No-op when the input lacks an `assetSetRef`.
   */
  pinAssetSetMember: (operationType: OperationType, inputId: string, member: AssetModel) => void;
  updatePickStrategy: (operationType: OperationType, inputId: string, strategy: PickStrategy) => void;
  updatePickState: (operationType: OperationType, inputId: string, patch: { pickIndex?: number; recentPicks?: number[] }) => void;
  setInputMask: (operationType: OperationType, inputId: string, maskUrl: string | undefined) => void;
  addMaskLayer: (operationType: OperationType, inputId: string, layer: InputMaskLayer) => void;
  removeMaskLayer: (operationType: OperationType, inputId: string, layerId: string) => void;
  updateMaskLayer: (operationType: OperationType, inputId: string, layerId: string, patch: Partial<InputMaskLayer>) => void;
  setMaskLayers: (operationType: OperationType, inputId: string, layers: InputMaskLayer[]) => void;
  toggleSkip: (operationType: OperationType, inputId: string) => void;

  /**
   * Seed the store's view of "which provider owns the current items for this
   * op" without performing a swap.  Call this once when the panel mounts or
   * when the per-provider-inputs feature is first enabled so that the first
   * `switchProviderInputs` call saves to the correct bucket.
   */
  setCurrentProviderForOp: (operationType: OperationType, providerId: string | undefined) => void;

  /**
   * Save current inputs under the store-tracked provider, restore from the
   * newProviderId bucket.  The "old" provider is read from `currentProviderByOp`
   * so callers cannot corrupt it by passing a stale inferred value.
   */
  switchProviderInputs: (operationType: OperationType, newProviderId: string | undefined) => void;

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

function allowDuplicates(operationType: OperationType): boolean {
  return OPERATION_METADATA[operationType]?.allowDuplicateInputs ?? false;
}

/**
 * QuotaExceededError-tolerant wrapper around localStorage.
 *
 * When a `generation_inputs:<scope>` write trips the ~5MB browser quota,
 * we drop OTHER scopes' input entries (keep the one we're writing) and
 * retry once. A second failure is logged and swallowed so the user-facing
 * store update still applies in-memory — the next mutation gets another
 * chance once the prune frees space.
 */
function createQuotaTolerantLocalStorage(activeKey: string): Storage {
  return new Proxy(localStorage, {
    get(target, prop) {
      if (prop !== 'setItem') {
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (key: string, value: string) => {
        try {
          target.setItem(key, value);
        } catch (err) {
          if (!isQuotaExceededError(err)) throw err;
          const freed = dropOtherGenerationInputKeys(activeKey);
           
          console.warn(
            `[generationInputStore] localStorage quota hit on ${key} — dropped ${freed} other scope input(s), retrying`,
          );
          try {
            target.setItem(key, value);
          } catch (retryErr) {
             
            console.error(
              `[generationInputStore] localStorage still over quota after prune — write to ${key} dropped`,
              retryErr,
            );
          }
        }
      };
    },
  });
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  // DOMException names vary by browser; Firefox uses NS_ERROR_DOM_QUOTA_REACHED.
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (err as { code?: number }).code === 22 ||
    (err as { code?: number }).code === 1014
  );
}

function dropOtherGenerationInputKeys(keepKey: string): number {
  let dropped = 0;
  // Snapshot keys first — mutating during iteration is unsafe.
  for (const k of Object.keys(localStorage)) {
    if (k === keepKey) continue;
    if (!k.startsWith('generation_inputs:') && !k.startsWith('generation_inputs_v1')) continue;
    try {
      localStorage.removeItem(k);
      dropped++;
    } catch {
      // best-effort
    }
  }
  return dropped;
}

export function createGenerationInputStore(storageKey: string): GenerationInputStoreHook {
  return create<GenerationInputsState>()(
    persist(
      (set, get) => ({
        inputsByOperation: {},
        inputsByProviderOp: {},
        currentProviderByOp: {},
        armedSlotByOperation: {},
        inputModeByOperation: {},
        navCohortByOperation: {},

        setInputMode: (operationType, mode) => {
          set((state) => ({
            inputModeByOperation: {
              ...state.inputModeByOperation,
              [operationType]: mode,
            },
          }));
        },

        setInputNavCohort: (operationType, cohort) => {
          set((state) => ({
            navCohortByOperation: {
              ...state.navCohortByOperation,
              [operationType]: cohort,
            },
          }));
        },

        addInput: ({ asset, operationType, slotIndex }) => {
          set((state) => {
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
              if (currentIdx >= existing.items.length) {
                // On virtual empty slot — append instead of replace
                targetSlotIndex = getNextSlotIndex(nextItems);
              } else {
                const currentItem = existing.items[currentIdx];
                targetSlotIndex = currentItem ? getSlotIndex(currentItem, 0) : getNextSlotIndex(nextItems);
              }
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

          // Single asset: delegate to addInput so armed slot / replace logic applies
          if (assets.length === 1) {
            get().addInput({ asset: assets[0], operationType });
            return;
          }

          set((state) => {
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

        replaceInputAsset: (operationType, inputId, asset) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            // No-op if the slot already holds this exact asset id; avoids a
            // spurious re-render when the user clicks the same chevron twice
            // after a fetch returned the same neighbor.
            const target = existing.items.find((item) => item.id === inputId);
            if (!target) return state;
            if (target.asset.id === asset.id && target.asset === asset) return state;
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId ? { ...item, asset } : item
                  ),
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

        updateRoleOverride: (operationType, inputId, role) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId ? { ...item, roleOverride: role } : item
                  ),
                },
              },
            };
          });
        },

        setInputPrompt: (operationType, inputId, prompt, options) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            // Normalize empty/whitespace-only to "no value" so a blank prompt
            // can't shadow the operation default.
            const normalized =
              typeof prompt === 'string' && prompt.trim().length > 0 ? prompt : undefined;
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId
                      ? {
                          ...item,
                          promptOverride: normalized,
                          ...(options && 'pin' in options ? { promptPinned: options.pin } : {}),
                        }
                      : item
                  ),
                },
              },
            };
          });
        },

        togglePinPrompt: (operationType, inputId, fallbackPrompt) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) => {
                    if (item.id !== inputId) return item;
                    if (item.promptPinned) {
                      // Un-pin: keep promptOverride so re-pinning restores it.
                      return { ...item, promptPinned: false };
                    }
                    // Pin: reuse the remembered value, else snapshot the fallback.
                    const remembered =
                      typeof item.promptOverride === 'string' && item.promptOverride.length > 0
                        ? item.promptOverride
                        : undefined;
                    const seeded =
                      remembered ??
                      (fallbackPrompt.trim().length > 0 ? fallbackPrompt : undefined);
                    return { ...item, promptPinned: true, promptOverride: seeded };
                  }),
                },
              },
            };
          });
        },

        setInputParamOverride: (operationType, inputId, key, value) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) => {
                    if (item.id !== inputId) return item;
                    const nextOverrides: Record<string, any> = { ...(item.paramOverrides ?? {}) };
                    if (value === undefined) {
                      delete nextOverrides[key];
                    } else {
                      nextOverrides[key] = value;
                    }
                    // Empty map normalizes to undefined so a hollow override can't
                    // shadow the shared operation default (mirrors setInputPrompt).
                    const normalized =
                      Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined;
                    return { ...item, paramOverrides: normalized };
                  }),
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

            // Allow index = length + 1 for virtual empty slot in carousel mode.
            // The UI layer is responsible for only setting this when appropriate.
            const clamped = Math.max(1, Math.min(index, length + 1));

            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  currentIndex: clamped,
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

        updateAssetModel: (assetId, updatedAsset) => {
          set((state) => {
            let changed = false;
            const nextMap: Partial<Record<OperationType, OperationInputs>> = {};

            (Object.keys(state.inputsByOperation) as OperationType[]).forEach((opType) => {
              const existing = state.inputsByOperation[opType];
              if (!existing) return;

              const hasMatch = existing.items.some((item) => item.asset.id === assetId);
              if (!hasMatch) {
                nextMap[opType] = existing;
                return;
              }

              changed = true;
              nextMap[opType] = {
                ...existing,
                items: existing.items.map((item) =>
                  item.asset.id === assetId ? { ...item, asset: updatedAsset } : item
                ),
              };
            });

            return changed ? { inputsByOperation: nextMap } : {};
          });
        },

        setAssetSetRef: (operationType, inputId, ref) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId ? { ...item, assetSetRef: ref } : item
                  ),
                },
              },
            };
          });
        },

        updateAssetSetMode: (operationType, inputId, mode) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) => {
                    if (item.id !== inputId || !item.assetSetRef) return item;
                    return {
                      ...item,
                      assetSetRef: { ...item.assetSetRef, mode },
                    };
                  }),
                },
              },
            };
          });
        },

        lockAssetSetPick: (operationType, inputId, assetId) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) => {
                    if (item.id !== inputId || !item.assetSetRef) return item;
                    return {
                      ...item,
                      assetSetRef: {
                        ...item.assetSetRef,
                        mode: 'locked' as const,
                        lockedAssetId: assetId,
                      },
                    };
                  }),
                },
              },
            };
          });
        },

        pinAssetSetMember: (operationType, inputId, member) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) => {
                    if (item.id !== inputId || !item.assetSetRef) return item;
                    return {
                      ...item,
                      asset: member,
                      assetSetRef: {
                        ...item.assetSetRef,
                        mode: 'locked' as const,
                        lockedAssetId: member.id,
                      },
                    };
                  }),
                },
              },
            };
          });
        },

        updatePickStrategy: (operationType, inputId, strategy) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) => {
                    if (item.id !== inputId || !item.assetSetRef) return item;
                    return {
                      ...item,
                      assetSetRef: {
                        ...item.assetSetRef,
                        pickStrategy: strategy,
                        pickIndex: undefined,
                        recentPicks: undefined,
                      },
                    };
                  }),
                },
              },
            };
          });
        },

        updatePickState: (operationType, inputId, patch) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) => {
                    if (item.id !== inputId || !item.assetSetRef) return item;
                    return {
                      ...item,
                      assetSetRef: {
                        ...item.assetSetRef,
                        ...(patch.pickIndex !== undefined ? { pickIndex: patch.pickIndex } : {}),
                        ...(patch.recentPicks !== undefined ? { recentPicks: patch.recentPicks } : {}),
                      },
                    };
                  }),
                },
              },
            };
          });
        },

        setInputMask: (operationType, inputId, maskUrl) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId ? { ...item, maskUrl } : item
                  ),
                },
              },
            };
          });
        },

        addMaskLayer: (operationType, inputId, layer) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId
                      ? { ...item, maskLayers: [...(item.maskLayers ?? []), layer] }
                      : item
                  ),
                },
              },
            };
          });
        },

        removeMaskLayer: (operationType, inputId, layerId) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId
                      ? { ...item, maskLayers: (item.maskLayers ?? []).filter((l) => l.id !== layerId) }
                      : item
                  ),
                },
              },
            };
          });
        },

        updateMaskLayer: (operationType, inputId, layerId, patch) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId
                      ? {
                          ...item,
                          maskLayers: (item.maskLayers ?? []).map((l) =>
                            l.id === layerId ? { ...l, ...patch } : l
                          ),
                        }
                      : item
                  ),
                },
              },
            };
          });
        },

        setMaskLayers: (operationType, inputId, layers) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId ? { ...item, maskLayers: layers } : item
                  ),
                },
              },
            };
          });
        },

        toggleSkip: (operationType, inputId) => {
          set((state) => {
            const existing = getOperationInputs(state.inputsByOperation, operationType);
            return {
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  ...existing,
                  items: existing.items.map((item) =>
                    item.id === inputId ? { ...item, skipped: !item.skipped } : item
                  ),
                },
              },
            };
          });
        },

        setCurrentProviderForOp: (operationType, providerId) => {
          set((state) => {
            if (state.currentProviderByOp[operationType] === providerId) return state;
            return {
              currentProviderByOp: {
                ...state.currentProviderByOp,
                [operationType]: providerId,
              },
            };
          });
        },

        switchProviderInputs: (operationType, newProviderId) => {
          set((state) => {
            const opKey = (pid: string | undefined) => `${pid ?? '_auto'}::${operationType}`;
            const oldProviderId = state.currentProviderByOp[operationType];
            const current = getOperationInputs(state.inputsByOperation, operationType);

            // Save current inputs under the tracked old-provider key.  Copy the
            // items array so later mutations in inputsByOperation do not bleed
            // into the saved snapshot.
            const updatedByProviderOp = {
              ...state.inputsByProviderOp,
              [opKey(oldProviderId)]: {
                items: [...current.items],
                currentIndex: current.currentIndex,
              },
            };

            // Restore inputs for new provider (or empty)
            const restored = updatedByProviderOp[opKey(newProviderId)];
            const newItems = restored ? normalizeInputItems(restored.items ?? []) : [];
            const newIndex = restored
              ? normalizeIndex(restored.currentIndex ?? 1, newItems.length)
              : 1;

            return {
              inputsByProviderOp: updatedByProviderOp,
              inputsByOperation: {
                ...state.inputsByOperation,
                [operationType]: {
                  items: newItems,
                  currentIndex: newIndex,
                },
              },
              currentProviderByOp: {
                ...state.currentProviderByOp,
                [operationType]: newProviderId,
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
        storage: createJSONStorage(() => createQuotaTolerantLocalStorage(storageKey)),
        version: 1,
        // NOTE: `inputsByProviderOp` is intentionally NOT persisted.
        // Each entry stores a full OperationInputs snapshot (with full
        // AssetModel per item), so the map grows past the ~5MB localStorage
        // quota during normal QuickGen probing (every provider swap saves
        // another snapshot). The cross-provider restore still works
        // in-session via the in-memory state; we just don't rehydrate it
        // across reloads. See plan `generation-input-persistence-slim`
        // for the proper {id}-reference + cache-rehydrate fix.
        partialize: (state) => ({
          inputsByOperation: state.inputsByOperation,
          currentProviderByOp: state.currentProviderByOp,
          navCohortByOperation: state.navCohortByOperation,
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


export const useGenerationInputStore: GenerationInputStoreHook =
  hmrSingleton('generationInputStore', () => createGenerationInputStore('generation_inputs_v1'));

// Keep asset snapshots fresh: any surface that updates an asset (gallery upload,
// gesture swipe, compact card button, etc.) emits assetUpdated — patch in place.
// hmrSingleton guard prevents duplicate subscriptions across HMR re-evaluations.
hmrSingleton('generationInputStore:subscription', () => {
  assetEvents.subscribeToUpdates((response) => {
    useGenerationInputStore.getState().updateAssetModel(response.id, fromAssetResponse(response));
  });
  return true; // sentinel value — hmrSingleton needs a return
});

export function getInputsForOperation(operationType: OperationType): InputItem[] {
  const state = useGenerationInputStore.getState();
  return getOperationInputs(state.inputsByOperation, operationType).items;
}
