/**
 * useAssetPanelState – All non-JSX logic for AssetPanel.
 * Store subscriptions, computed values, callbacks, widget builders.
 *
 * `.tsx` because `buildFusionRoleOverlay` returns JSX.
 */
import { resolveMediaTypes } from '@pixsim7/shared.assets.core';
import { Ref } from '@pixsim7/shared.ref.core';
import type { AssetRef } from '@pixsim7/shared.types';
import { useDragReorder } from '@pixsim7/shared.ui';
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';

import { useDockviewId } from '@lib/dockview';
import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';
import { createBadgeWidget } from '@lib/ui/overlay';

import { uploadAssetToProvider, type AssetModel } from '@features/assets';
import { hydrateAssetModel, isStubAssetModel } from '@features/assets/lib/hydrateAssetModel';
import { notifyGalleryOfUpdatedAsset } from '@features/assets/lib/uploadActions';
import {
  CAP_ASSET_INPUT,
  useProvideCapability,
  type AssetInputContext,
} from '@features/contextHub';
import {
  type InputItem,
  useGenerationScopeStores,
  useGenerationWorkbench,
  resolveDisplayAssets,
} from '@features/generation';
import {
  QUICKGEN_ASSET_COMPONENT_ID,
  QUICKGEN_ASSET_DEFAULTS,
} from '@features/generation/lib/quickGenerateComponentSettings';
import { useResolveComponentSettings, getInstanceId, useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId, usePanelInstanceSettingsStore, GENERATION_SCOPE_ID } from '@features/panels';
import { useQuickGenerateController } from '@features/prompts';
import { useProviderIdForModel } from '@features/providers';

import {
  COMPACT_TOP_RIGHT_BADGE_OFFSET,
  TOP_RIGHT_BADGE_STACK_GROUP,
} from '@/components/media/assetCardLocalWidgets';
import { OPERATION_METADATA } from '@/types/operations';

import { useGenerationHistoryStore } from '../stores/generationHistoryStore';

import { FLEXIBLE_OPERATIONS, EMPTY_INPUTS, type QuickGenPanelProps } from './quickGenPanelTypes';

export function useAssetPanelState(props: QuickGenPanelProps) {
  const ctx = props.context;
  const allowAnySelected = !ctx;
  const controller = useQuickGenerateController();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-asset';
  const scopeInstanceId = useScopeInstanceId(GENERATION_SCOPE_ID);
  const dockviewId = useDockviewId();
  const instanceId = scopeInstanceId ?? getInstanceId(dockviewId, panelInstanceId);
  const capabilityScope = resolveCapabilityScopeFromScopeInstanceId(scopeInstanceId);

  // Subscribe to scoped input store for live input data
  const { useInputStore, useSessionStore, useSettingsStore } = useGenerationScopeStores();

  // Resolve effective provider ID (same pattern as GenerationButtonGroupContent)
  const scopedProviderId = useSessionStore((s) => s.providerId);
  const activeModel = useSettingsStore((s) => s.params?.model as string | undefined);
  const inferredProviderId = useProviderIdForModel(activeModel);
  const effectiveProviderId = scopedProviderId ?? inferredProviderId;

  // Track per-asset upload state and locally completed uploads
  const [uploadingAssetIds, setUploadingAssetIds] = useState<Set<number>>(() => new Set());
  const [uploadedAssetIds, setUploadedAssetIds] = useState<Set<number>>(() => new Set());
  const hydratedDisplayAssetCacheRef = useRef<Map<number, AssetModel>>(new Map());
  const [hydratedDisplayAssetsById, setHydratedDisplayAssetsById] = useState<Map<number, AssetModel>>(
    () => new Map(),
  );

  const handleUploadToProvider = useCallback(async (assetId: number) => {
    if (!effectiveProviderId) return;
    setUploadingAssetIds((prev) => new Set(prev).add(assetId));
    try {
      await uploadAssetToProvider(assetId, effectiveProviderId);
      setUploadedAssetIds((prev) => new Set(prev).add(assetId));
      // Notify gallery so the updated asset reflects the new upload status
      try { await notifyGalleryOfUpdatedAsset(assetId); } catch { /* best-effort */ }
    } finally {
      setUploadingAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  }, [effectiveProviderId]);

  // Reset uploaded tracking when provider changes
  useEffect(() => {
    setUploadedAssetIds(new Set());
  }, [effectiveProviderId]);

  const {
    removeInput: ctxRemoveInput,
    updateLockedTimestamp: ctxUpdateLockedTimestamp,
  } = ctx || {};

  const operationType = ctx?.operationType ?? controller.operationType;
  const isFlexibleOperation = ctx?.isFlexibleOperation ?? FLEXIBLE_OPERATIONS.has(operationType);
  const operationMeta = OPERATION_METADATA[operationType];
  const removeInput = ctxRemoveInput ?? controller.removeInput;
  const workbench = useGenerationWorkbench({ operationType });
  const model = ctx?.model ?? (workbench.dynamicParams?.model as string | undefined);
  const paramSpecs = (ctx?.paramSpecs ?? workbench.allParamSpecs) as ParamSpec[];
  const storeUpdateLockedTimestamp = useInputStore(s => s.updateLockedTimestamp);
  const storeUpdateRoleOverride = useInputStore(s => s.updateRoleOverride);
  const updateLockedTimestamp = ctxUpdateLockedTimestamp ?? storeUpdateLockedTimestamp;
  const storeInputs = useInputStore(s => s.inputsByOperation[operationType]?.items ?? EMPTY_INPUTS);
  const storeInputIndex = useInputStore(s => s.inputsByOperation[operationType]?.currentIndex ?? 1);
  const storeSetInputIndex = useInputStore(s => s.setInputIndex);
  const storeCycleInputs = useInputStore(s => s.cycleInputs);
  const armedSlotIndex = useInputStore(s => s.armedSlotByOperation?.[operationType]);
  const setArmedSlot = useInputStore(s => s.setArmedSlot);
  const setInputMode = useInputStore(s => s.setInputMode);
  const storeReorderInput = useInputStore(s => s.reorderInput);
  const reorderInput = ctx?.reorderInput ?? storeReorderInput;

  // Drag-and-drop for slot reordering (shared hook)
  const { draggedIndex: draggedSlotIndex, dragOverIndex: dragOverSlotIndex, getDragItemProps, getDropTargetProps } =
    useDragReorder({
      onReorder: useCallback(
        (from: number, to: number) => reorderInput(operationType, from, to),
        [reorderInput, operationType],
      ),
    });

  // History store subscriptions
  const historyMode = useGenerationHistoryStore((s) => s.historyMode);
  const historySortMode = useGenerationHistoryStore((s) => s.historySortMode);
  const hideIncompatibleAssets = useGenerationHistoryStore((s) => s.hideIncompatibleAssets);
  const historyByOperation = useGenerationHistoryStore((s) => s.historyByOperation);
  const historyKey = historyMode === 'global' ? '_global' : operationType;
  const historyEntries = historyByOperation[historyKey] ?? [];

  // Sort history: pinned first (by useCount), then unpinned (by lastUsedAt)
  const sortedHistory = useMemo(() => {
    if (!historyEntries || historyEntries.length === 0) return [];
    if (historySortMode === 'recent-first') {
      return [...historyEntries].sort(
        (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
      );
    }
    const pinned = historyEntries.filter((e) => e.pinned);
    const unpinned = historyEntries.filter((e) => !e.pinned);
    pinned.sort((a, b) => b.useCount - a.useCount);
    unpinned.sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
    return [...pinned, ...unpinned];
  }, [historyEntries, historySortMode]);

  const compatibleHistory = useMemo(() => {
    const acceptsInput = operationMeta?.acceptsInput ?? [];
    if (!hideIncompatibleAssets) {
      return sortedHistory;
    }
    if (acceptsInput.length === 0) {
      return [];
    }
    return sortedHistory.filter((entry) => acceptsInput.includes(entry.mediaType));
  }, [sortedHistory, hideIncompatibleAssets, operationMeta?.acceptsInput]);

  const resolvedAssetSettings = useResolveComponentSettings<typeof QUICKGEN_ASSET_DEFAULTS>(
    QUICKGEN_ASSET_COMPONENT_ID,
    instanceId,
    "generation",
  );

  const setComponentSetting = usePanelInstanceSettingsStore((s) => s.setComponentSetting);
  const clearComponentSettingField = usePanelInstanceSettingsStore((s) => s.clearComponentSettingField);
  const clearComponentSettings = usePanelInstanceSettingsStore((s) => s.clearComponentSettings);

  const {
    settings: assetSettings,
    globalSettings: assetGlobalSettings,
    instanceOverrides: assetInstanceOverrides,
    hasInstanceOverrides: assetHasInstanceOverrides,
  } = resolvedAssetSettings;

  const {
    enableHoverPreview = QUICKGEN_ASSET_DEFAULTS.enableHoverPreview,
    showPlayOverlay = QUICKGEN_ASSET_DEFAULTS.showPlayOverlay,
    clickToPlay = QUICKGEN_ASSET_DEFAULTS.clickToPlay,
    displayMode = QUICKGEN_ASSET_DEFAULTS.displayMode,
    gridColumns = QUICKGEN_ASSET_DEFAULTS.gridColumns,
  } = assetSettings ?? {};

  const resolvedDisplayMode = displayMode ?? QUICKGEN_ASSET_DEFAULTS.displayMode;
  const resolvedGridColumns = Math.max(2, Math.min(6, Number(gridColumns ?? QUICKGEN_ASSET_DEFAULTS.gridColumns)));

  // Sync input mode: carousel replaces current item, other modes append
  useEffect(() => {
    setInputMode(operationType, resolvedDisplayMode === 'carousel' ? 'replace' : 'append');
  }, [resolvedDisplayMode, operationType, setInputMode]);

  const globalDisplayMode =
    (assetGlobalSettings?.displayMode as string | undefined) ?? QUICKGEN_ASSET_DEFAULTS.displayMode;
  const globalGridColumns =
    Number(assetGlobalSettings?.gridColumns ?? QUICKGEN_ASSET_DEFAULTS.gridColumns);

  const handleComponentSetting = useCallback(
    (fieldId: string, value: string | number | undefined) => {
      if (value === '__global__' || value === undefined) {
        clearComponentSettingField(instanceId, QUICKGEN_ASSET_COMPONENT_ID, fieldId);
        return;
      }
      setComponentSetting(instanceId, props.panelId as any, QUICKGEN_ASSET_COMPONENT_ID, fieldId, value);
    },
    [clearComponentSettingField, instanceId, props.panelId, setComponentSetting],
  );

  const handleClearInstanceOverrides = useCallback(() => {
    clearComponentSettings(instanceId, QUICKGEN_ASSET_COMPONENT_ID);
  }, [clearComponentSettings, instanceId]);

  const rawDisplayAssets = useMemo(() => {
    if (ctx?.displayAssets) return ctx.displayAssets;
    return resolveDisplayAssets({
      operationType,
      inputs: controller.operationInputs,
      currentIndex: controller.operationInputIndex,
      lastSelectedAsset: controller.lastSelectedAsset,
      allowAnySelected,
    });
  }, [
    ctx?.displayAssets,
    operationType,
    controller.operationInputs,
    controller.operationInputIndex,
    controller.lastSelectedAsset,
    allowAnySelected,
  ]);

  useEffect(() => {
    const stubAssets = rawDisplayAssets.filter(isStubAssetModel);
    if (stubAssets.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const hydratedAssets = await Promise.all(
        stubAssets.map((asset) =>
          hydrateAssetModel(asset, { cache: hydratedDisplayAssetCacheRef.current }),
        ),
      );

      if (cancelled) return;

      setHydratedDisplayAssetsById((prev) => {
        let changed = false;
        const next = new Map(prev);

        hydratedAssets.forEach((asset) => {
          const existing = next.get(asset.id);
          if (existing !== asset) {
            next.set(asset.id, asset);
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [rawDisplayAssets]);

  const displayAssets = useMemo(
    () => rawDisplayAssets.map((asset) => hydratedDisplayAssetsById.get(asset.id) ?? asset),
    [rawDisplayAssets, hydratedDisplayAssetsById],
  );

  const multiAssetParamName = useMemo(() => {
    if (operationType === 'video_transition') return 'composition_assets';
    if (operationType === 'image_to_image' || operationType === 'fusion') return 'composition_assets';
    return null;
  }, [operationType]);

  const multiAssetLimits = useMemo(() => {
    if (!multiAssetParamName || !paramSpecs?.length) return null;
    return getArrayParamLimits(paramSpecs, multiAssetParamName, model);
  }, [multiAssetParamName, paramSpecs, model]);

  const maxAssetItems =
    typeof multiAssetLimits?.max === 'number' && Number.isFinite(multiAssetLimits.max)
      ? Math.max(1, Math.floor(multiAssetLimits.max))
      : null;

  useProvideCapability<AssetInputContext>(
    CAP_ASSET_INPUT,
    {
      id: `quickgen-asset:${panelInstanceId}`,
      label: 'Asset Input',
      priority: 50,
      getValue: () => {
        const refs = (displayAssets ?? [])
          .map((asset) => {
            const id = Number(asset?.id);
            return Number.isFinite(id) ? Ref.asset(id) : null;
          })
          .filter((ref): ref is AssetRef => !!ref);
        const supportsMulti = true;
        const minCount = operationMeta?.multiAssetMode === 'required'
          ? 2
          : isFlexibleOperation
          ? 0
          : 1;
        const isMultiAsset = (displayAssets?.length ?? 0) > 1;
        const maxCount = isMultiAsset
          ? (maxAssetItems ?? Math.max(refs.length, 1))
          : 1;
        const types = resolveMediaTypes(displayAssets ?? []).filter(
          (type): type is "image" | "video" => type === "image" || type === "video",
        );

        return {
          assets: displayAssets ?? [],
          supportsMulti,
          ref: refs[0] ?? null,
          refs,
          selection: {
            count: refs.length,
            min: minCount,
            max: maxCount,
            mode: isMultiAsset ? "multi" : "single",
          },
          constraints: {
            types: types.length > 0 ? types : undefined,
            canMixTypes: types.length > 1,
          },
          status:
            refs.length >= minCount
              ? { ready: true }
              : { ready: false, reason: "Select an asset to continue." },
        };
      },
    },
    [displayAssets, isFlexibleOperation, operationType, panelInstanceId],
    { scope: capabilityScope },
  );

  // Use store values directly for input operations
  const operationInputs = ctx?.operationInputs ?? storeInputs;
  const operationInputIndex = ctx?.operationInputIndex ?? storeInputIndex;
  const cycleInputs = ctx?.cycleInputs ?? storeCycleInputs;
  const setOperationInputIndex = ctx?.setOperationInputIndex ?? ((idx: number) => storeSetInputIndex(operationType, idx));


  const orderedInputs = useMemo(() => {
    if (!operationInputs.length) return [];
    return [...operationInputs].sort((a, b) => {
      const aSlot = typeof a.slotIndex === 'number' ? a.slotIndex : 0;
      const bSlot = typeof b.slotIndex === 'number' ? b.slotIndex : 0;
      return aSlot - bSlot;
    });
  }, [operationInputs]);

  const inputIndexById = useMemo(() => {
    const map = new Map<string, number>();
    orderedInputs.forEach((item, idx) => {
      map.set(item.id, idx);
    });
    return map;
  }, [orderedInputs]);

  const maxSlotIndex = useMemo(() => {
    return orderedInputs.reduce((max, item, idx) => {
      const slot = typeof item.slotIndex === 'number' ? item.slotIndex : idx;
      return Math.max(max, slot);
    }, -1);
  }, [orderedInputs]);

  const slotItems = useMemo(() => {
    if (maxSlotIndex < 0) return [] as Array<InputItem | null>;
    const slots: Array<InputItem | null> = Array.from(
      { length: maxSlotIndex + 1 },
      () => null
    );
    orderedInputs.forEach((item, idx) => {
      const slot = typeof item.slotIndex === 'number' ? item.slotIndex : idx;
      if (slot >= 0 && slot < slots.length) {
        slots[slot] = item;
      }
    });
    return slots;
  }, [orderedInputs, maxSlotIndex]);

  const clampedSlotIndices = useMemo(() => {
    if (maxAssetItems === null) return new Set<number>();
    let count = 0;
    const clamped = new Set<number>();
    slotItems.forEach((item, idx) => {
      if (!item) return;
      count += 1;
      if (count > maxAssetItems) {
        clamped.add(idx);
      }
    });
    return clamped;
  }, [slotItems, maxAssetItems]);

  // Stable callback for wheel handler
  const handleWheelRef = useRef<(e: WheelEvent) => void>();
  handleWheelRef.current = (e: WheelEvent) => {
    if (operationInputs.length <= 1) return;

    e.preventDefault();

    // Scroll up = next, scroll down = prev (reversed for natural feel)
    if (e.deltaY < 0) {
      cycleInputs?.(operationType, 'next');
    } else if (e.deltaY > 0) {
      cycleInputs?.(operationType, 'prev');
    }
  };

  // Attach native wheel listener with passive: false
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: WheelEvent) => handleWheelRef.current?.(e);
    container.addEventListener('wheel', handler, { passive: false });

    return () => {
      container.removeEventListener('wheel', handler);
    };
  }, []);

  const isFusionOperation = operationType === 'fusion';

  const buildFusionRoleOverlay = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (item: InputItem, slotIdx: number) => {
      if (!isFusionOperation) return undefined;

      // Three-state cycle: none → main_character → environment → none
      const currentRole = item.roleOverride; // undefined = simple mode (no role)

      const nextRole =
        currentRole === undefined ? 'main_character'
        : currentRole === 'main_character' ? 'environment'
        : undefined; // environment → none

      const title =
        currentRole === undefined ? 'No role (simple mode) — click to assign Character'
        : currentRole === 'main_character' ? 'Character — click to switch to Background'
        : 'Background — click to clear role';

      const iconName =
        currentRole === 'environment' ? 'image'
        : currentRole === 'main_character' ? 'user'
        : 'minus';

      const bgClass =
        currentRole === undefined
          ? 'bg-black/40'
          : 'bg-black/70';

      return (
        <button
          type="button"
          className={`cq-badge-xs cq-inset-br absolute rounded-full pointer-events-auto cursor-pointer hover:bg-black/90 transition-colors ${bgClass}`}
          title={title}
          onClick={(e) => {
            e.stopPropagation();
            storeUpdateRoleOverride(operationType, item.id, nextRole);
          }}
        >
          <Icon name={iconName} size={10} color="#fff" />
        </button>
      );
    },
    [isFusionOperation, storeUpdateRoleOverride, operationType],
  );

  // Reusable warning badge widget for cards (over-limit, etc.)
  const buildWarningWidget = useCallback(
    (tooltip: string) => createBadgeWidget({
      id: 'card-warning',
      position: { anchor: 'top-right', offset: COMPACT_TOP_RIGHT_BADGE_OFFSET },
      stackGroup: TOP_RIGHT_BADGE_STACK_GROUP,
      visibility: { trigger: 'always', transition: 'none' },
      variant: 'icon',
      icon: 'alertTriangle',
      color: 'amber',
      shape: 'circle',
      tooltip,
      priority: 25,
      className: '!bg-amber-500/90 !text-white',
    }),
    [],
  );

  // Slot index badge widget for multi-asset cards
  const buildSlotIndexWidget = useCallback(
    (slotIdx: number) => createBadgeWidget({
      id: 'slot-index',
      position: { anchor: 'top-left', offset: { x: 4, y: 4 } },
      visibility: { trigger: 'always', transition: 'none' },
      variant: 'text',
      labelBinding: { id: 'label', resolve: () => String(slotIdx + 1) },
      color: 'accent',
      className: 'cq-badge !bg-accent !text-accent-text font-medium',
      priority: 22,
    }),
    [],
  );

  const hasAsset = displayAssets.length > 0;
  const isMultiAssetDisplay = displayAssets.length > 1;
  const currentInputIdx = Math.max(0, Math.min(operationInputIndex - 1, orderedInputs.length - 1));
  const currentInput = orderedInputs[currentInputIdx];
  const currentInputId = currentInput?.id;

  return {
    // Identity / context
    controller,
    containerRef,
    scopeInstanceId,
    instanceId,
    operationType,
    isFlexibleOperation,
    operationMeta,

    // Upload
    effectiveProviderId,
    uploadingAssetIds,
    uploadedAssetIds,
    handleUploadToProvider,

    // Inputs
    operationInputs,
    operationInputIndex,
    cycleInputs,
    setOperationInputIndex,
    removeInput,
    updateLockedTimestamp,
    orderedInputs,
    inputIndexById,
    slotItems,
    clampedSlotIndices,
    maxAssetItems,
    armedSlotIndex,
    setArmedSlot,

    // Drag reorder
    draggedSlotIndex,
    dragOverSlotIndex,
    getDragItemProps,
    getDropTargetProps,

    // Display assets
    displayAssets,
    hasAsset,
    isMultiAssetDisplay,
    currentInputIdx,
    currentInput,
    currentInputId,

    // History
    sortedHistory,
    compatibleHistory,

    // Component settings
    resolvedDisplayMode,
    resolvedGridColumns,
    enableHoverPreview,
    showPlayOverlay,
    clickToPlay,
    assetInstanceOverrides,
    assetHasInstanceOverrides,
    globalDisplayMode,
    globalGridColumns,
    handleComponentSetting,
    handleClearInstanceOverrides,

    // Widget builders
    buildFusionRoleOverlay,
    buildWarningWidget,
    buildSlotIndexWidget,

    // Source label
    sourceLabel: ctx?.sourceLabel,
  };
}

export type AssetPanelState = ReturnType<typeof useAssetPanelState>;
