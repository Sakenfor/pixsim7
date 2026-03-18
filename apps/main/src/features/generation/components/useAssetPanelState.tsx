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
import { createBadgeWidget, BADGE_SLOT, BADGE_PRIORITY, type OverlayWidget } from '@lib/ui/overlay';

import { uploadAssetToProvider, type AssetModel } from '@features/assets';
import { resolveAssetSet } from '@features/assets/lib/assetSetResolver';
import { hydrateAssetModel, isStubAssetModel } from '@features/assets/lib/hydrateAssetModel';
import { notifyGalleryOfUpdatedAsset } from '@features/assets/lib/uploadActions';
import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import {
  CAP_ASSET_INPUT,
  CAP_CHARACTER_CONTEXT,
  useCapability,
  useProvideCapability,
  type AssetInputContext,
  type CharacterContextSummary,
} from '@features/contextHub';
import {
  type InputItem,
  useGenerationScopeStores,
  useGenerationWorkbench,
  resolveDisplayAssets,
  buildFallbackAsset,
} from '@features/generation';
import {
  QUICKGEN_ASSET_COMPONENT_ID,
  QUICKGEN_ASSET_DEFAULTS,
} from '@features/generation/lib/quickGenerateComponentSettings';
import type { AssetSetSlotRef } from '@features/generation/stores/generationInputStore';
import { useResolveComponentSettings, getInstanceId, useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId, usePanelInstanceSettingsStore, GENERATION_SCOPE_ID } from '@features/panels';
import { useQuickGenerateController } from '@features/prompts';
import { useProviderIdForModel } from '@features/providers';

import { OPERATION_METADATA } from '@/types/operations';

import { useGenerationHistoryStore } from '../stores/generationHistoryStore';

import { MaskVersionBadge } from './MaskVersionBadge';
import { EMPTY_INPUTS, type QuickGenPanelProps } from './quickGenPanelTypes';

// ── Slot Badge Definitions ─────────────────────────────────────────────
// Badge widgets for asset input cards. Uses the overlay widget system so
// badges auto-stack and never overlap.
//
// To add a new badge:
//   1. Define a builder function here (module-level for static badges,
//      useCallback inside the hook if it needs closures like popovers).
//   2. Add the condition + call in buildSlotExtraWidgets (inside the hook).
//
// Badges use BADGE_SLOT for positioning and BADGE_PRIORITY for layering.
// Badges sharing a stackGroup (e.g. 'badges-tr') auto-stack vertically.
// ────────────────────────────────────────────────────────────────────────

function slotIndexBadge(slotIdx: number) {
  return createBadgeWidget({
    id: 'slot-index',
    ...BADGE_SLOT.topLeft,
    variant: 'text',
    labelBinding: { kind: 'fn', target: 'label', fn: () => String(slotIdx + 1) },
    color: 'accent',
    className: 'cq-badge !bg-accent !text-accent-text font-medium',
    priority: BADGE_PRIORITY.slotIndex,
  });
}

function warningBadge(tooltip: string) {
  return createBadgeWidget({
    id: 'card-warning',
    ...BADGE_SLOT.topRight,
    variant: 'icon',
    icon: 'alertTriangle',
    color: 'amber',
    shape: 'circle',
    tooltip,
    priority: BADGE_PRIORITY.important,
    className: '!bg-amber-500/90 !text-white',
  });
}

function maskBadge(
  count: number,
  maskAssetIds: number[],
  onSwitchVersion?: (oldAssetId: number, newAssetId: number) => void,
): OverlayWidget {
  const label = count > 1 ? `${count} Masks` : 'Mask';
  const primaryAssetId = maskAssetIds[0] ?? null;
  return {
    id: 'mask-badge',
    type: 'badge',
    ...BADGE_SLOT.topRight,
    visibility: { trigger: 'always' as const, transition: 'none' as const },
    priority: BADGE_PRIORITY.status,
    stackGroup: 'badges-tr',
    interactive: true,
    ariaLabel: count > 1 ? `${count} inpaint masks attached` : 'Inpaint mask attached',
    render: () => (
      <MaskVersionBadge
        label={label}
        primaryAssetId={primaryAssetId}
        onSwitchVersion={onSwitchVersion}
      />
    ),
  };
}

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
  const isFlexibleOperation = ctx?.isFlexibleOperation ?? (OPERATION_METADATA[operationType]?.flexibleInput === true);
  const operationMeta = OPERATION_METADATA[operationType];
  const { value: activeCharacterContext } = useCapability<CharacterContextSummary>(CAP_CHARACTER_CONTEXT);
  const activeCharacterLabel = useMemo(() => {
    if (!activeCharacterContext) return null;
    if (activeCharacterContext.displayName?.trim()) return activeCharacterContext.displayName.trim();
    if (activeCharacterContext.name?.trim()) return activeCharacterContext.name.trim();
    return activeCharacterContext.characterId;
  }, [activeCharacterContext]);
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
  const storeUpdateMaskLayer = useInputStore(s => s.updateMaskLayer);
  const storeToggleSkip = useInputStore(s => s.toggleSkip);
  const reorderInput = ctx?.reorderInput ?? storeReorderInput;

  // Mini gallery popover for empty slot / add asset
  const [pickerAnchorRect, setPickerAnchorRect] = useState<DOMRect | null>(null);
  const handlePickAsset = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPickerAnchorRect(rect);
  }, []);
  const handleClosePickerPopover = useCallback(() => {
    setPickerAnchorRect(null);
  }, []);

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

  // Persisted source_asset_id survives refresh even when lastSelectedAsset doesn't.
  // Used as fallback so the asset card isn't empty after a page reload.
  const sourceAssetId = Number(controller.dynamicParams?.source_asset_id);
  const hasSourceAssetId = Number.isFinite(sourceAssetId) && sourceAssetId > 0;

  const rawDisplayAssets = useMemo(() => {
    if (ctx?.displayAssets) return ctx.displayAssets;
    const resolved = resolveDisplayAssets({
      operationType,
      inputs: controller.operationInputs,
      currentIndex: controller.operationInputIndex,
      lastSelectedAsset: controller.lastSelectedAsset,
      allowAnySelected,
    });
    // Replace stubs synchronously with cached hydrated versions to avoid
    // a two-phase render (stub → hydrated) flash on re-select.
    const cache = hydratedDisplayAssetCacheRef.current;
    const withCache = cache.size > 0
      ? resolved.map((asset) => (isStubAssetModel(asset) ? cache.get(asset.id) ?? asset : asset))
      : resolved;
    if (withCache.length > 0) return withCache;
    // Fallback: source_asset_id is persisted but lastSelectedAsset is not.
    // Create a stub so the hydration effect can fetch the real asset.
    if (hasSourceAssetId) {
      const mediaType = OPERATION_METADATA[operationType]?.inputMediaType ?? 'image';
      const cached = cache.get(sourceAssetId);
      if (cached) return [cached];
      return [buildFallbackAsset({ id: sourceAssetId, type: mediaType, url: '' })];
    }
    return withCache;
  }, [
    ctx?.displayAssets,
    operationType,
    controller.operationInputs,
    controller.operationInputIndex,
    controller.lastSelectedAsset,
    allowAnySelected,
    hasSourceAssetId,
    sourceAssetId,
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
    const meta = OPERATION_METADATA[operationType];
    return meta?.compositionRole ? 'composition_assets' : null;
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
    if (operationInputs.length <= 1 && !showVirtualEmptySlot) return;

    e.preventDefault();

    // Scroll up = next, scroll down = prev (reversed for natural feel)
    if (showVirtualEmptySlot) {
      // Virtual-slot-aware cycling: delegate to setOperationInputIndex
      const total = orderedInputs.length + 1; // includes virtual slot
      if (e.deltaY < 0) {
        const next = operationInputIndex >= total ? 1 : operationInputIndex + 1;
        setOperationInputIndex(next);
      } else if (e.deltaY > 0) {
        const prev = operationInputIndex <= 1 ? total : operationInputIndex - 1;
        setOperationInputIndex(prev);
      }
    } else {
      if (e.deltaY < 0) {
        cycleInputs?.(operationType, 'next');
      } else if (e.deltaY > 0) {
        cycleInputs?.(operationType, 'prev');
      }
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

  const supportsCompositionRoleOverlay = operationType === 'fusion'
    || operationType === 'image_to_image'
    || operationType === 'video_transition';

  const buildFusionRoleOverlay = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (item: InputItem, slotIdx: number) => {
      if (!supportsCompositionRoleOverlay) return undefined;
      const currentRole = item.roleOverride;
      const isCharacter = currentRole === 'main_character';
      const isEnvironment = currentRole === 'environment';
      const characterTitle = activeCharacterLabel
        ? `Set as Character (${activeCharacterLabel})`
        : 'Set as Character';
      const clearTitle = activeCharacterLabel
        ? `Clear role override (auto can still infer ${activeCharacterLabel})`
        : 'Clear role override (use auto inference)';

      return (
        <div className="cq-inset-br absolute flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            className={`cq-badge-xs rounded-full transition-colors ${
              isCharacter ? 'bg-accent text-accent-text' : 'bg-black/55 text-white hover:bg-black/75'
            }`}
            title={characterTitle}
            onClick={(e) => {
              e.stopPropagation();
              storeUpdateRoleOverride(operationType, item.id, 'main_character');
            }}
          >
            <Icon name="user" size={10} />
          </button>
          <button
            type="button"
            className={`cq-badge-xs rounded-full transition-colors ${
              isEnvironment ? 'bg-accent text-accent-text' : 'bg-black/55 text-white hover:bg-black/75'
            }`}
            title="Set as Background / Environment"
            onClick={(e) => {
              e.stopPropagation();
              storeUpdateRoleOverride(operationType, item.id, 'environment');
            }}
          >
            <Icon name="image" size={10} />
          </button>
          {currentRole && (
            <button
              type="button"
              className="cq-badge-xs rounded-full bg-black/45 text-white hover:bg-black/70 transition-colors"
              title={clearTitle}
              onClick={(e) => {
                e.stopPropagation();
                storeUpdateRoleOverride(operationType, item.id, undefined);
              }}
            >
              <Icon name="x" size={10} />
            </button>
          )}
        </div>
      );
    },
    [supportsCompositionRoleOverlay, activeCharacterLabel, storeUpdateRoleOverride, operationType],
  );

  // (Static badge builders are module-level - see top of file)
  const hasAsset = displayAssets.length > 0;
  const isMultiAssetDisplay = displayAssets.length > 1;

  // ─── Virtual empty slot (carousel-only) ────────────────────────────
  // Always show add-slot so users can add assets to any operation type.
  // Don't gate on maxAssetItems — users can overfill the pool and use
  // random/sequential picking to select from it.  The clamped warning
  // badge already indicates when slots exceed the provider limit.
  const showVirtualEmptySlot = resolvedDisplayMode === 'carousel' && hasAsset;
  const carouselTotalCount = orderedInputs.length + (showVirtualEmptySlot ? 1 : 0);
  const isOnVirtualSlot = showVirtualEmptySlot && operationInputIndex > orderedInputs.length;

  const currentInputIdx = isOnVirtualSlot
    ? orderedInputs.length  // clamp to last real item for safe fallback
    : Math.max(0, Math.min(operationInputIndex - 1, orderedInputs.length - 1));
  const currentInput = orderedInputs[currentInputIdx];
  const currentInputId = currentInput?.id;

  // ─── Asset Set Slot Ref ───

  const storeSetAssetSetRef = useInputStore(s => s.setAssetSetRef);
  const storeUpdateAssetSetMode = useInputStore(s => s.updateAssetSetMode);
  const storeLockAssetSetPick = useInputStore(s => s.lockAssetSetPick);

  // Popover state for set linking
  const [activeSetPopover, setActiveSetPopover] = useState<{ slotIdx: number; anchorRect: DOMRect } | null>(null);

  const handleSetPopoverOpen = useCallback((slotIdx: number, rect: DOMRect) => {
    setActiveSetPopover((prev) =>
      prev?.slotIdx === slotIdx ? null : { slotIdx, anchorRect: rect },
    );
  }, []);

  const handleSetPopoverClose = useCallback(() => {
    setActiveSetPopover(null);
  }, []);

  const handleSetLink = useCallback(async (opType: typeof operationType, inputId: string, setId: string) => {
    // Link set and pick initial preview asset
    const set = useAssetSetStore.getState().getSet(setId);
    if (!set) return;
    const resolved = await resolveAssetSet(set);
    const pick = resolved.length > 0 ? resolved[0] : undefined;
    // Remember the original asset so we can restore it on unlink
    const items = useInputStore.getState().inputsByOperation[opType]?.items ?? [];
    const item = items.find(i => i.id === inputId);
    const originalAssetId = item?.asset?.id;
    storeSetAssetSetRef(opType, inputId, {
      setId,
      mode: 'random_each',
      originalAssetId: typeof originalAssetId === 'number' ? originalAssetId : undefined,
    });
    if (pick) {
      useInputStore.getState().updateAssetModel(pick.id, pick);
      // Update the slot's display asset to the first set asset
      const state = useInputStore.getState();
      const existing = state.inputsByOperation[opType];
      if (existing) {
        (useInputStore as any).setState({
          inputsByOperation: {
            ...state.inputsByOperation,
            [opType]: {
              ...existing,
              items: existing.items.map(i =>
                i.id === inputId ? { ...i, asset: pick } : i
              ),
            },
          },
        });
      }
    }
  }, [operationType, storeSetAssetSetRef, useInputStore]);

  const handleSetUnlink = useCallback(async (opType: typeof operationType, inputId: string) => {
    // Grab the original asset ID before clearing the ref
    const items = useInputStore.getState().inputsByOperation[opType]?.items ?? [];
    const item = items.find(i => i.id === inputId);
    const originalId = item?.assetSetRef?.originalAssetId;

    storeSetAssetSetRef(opType, inputId, undefined);
    setActiveSetPopover(null);

    // Restore the original asset that was in the slot before linking
    if (typeof originalId === 'number') {
      const stub = buildFallbackAsset({ id: originalId, type: 'image', url: '' });
      const restored = await hydrateAssetModel(stub);
      const state = useInputStore.getState();
      const existing = state.inputsByOperation[opType];
      if (existing) {
        (useInputStore as any).setState({
          inputsByOperation: {
            ...state.inputsByOperation,
            [opType]: {
              ...existing,
              items: existing.items.map(i =>
                i.id === inputId ? { ...i, asset: restored } : i
              ),
            },
          },
        });
      }
    }
  }, [storeSetAssetSetRef, useInputStore]);

  const handleSetModeChange = useCallback(async (opType: typeof operationType, inputId: string, mode: AssetSetSlotRef['mode']) => {
    storeUpdateAssetSetMode(opType, inputId, mode);
    if (mode === 'locked') {
      // Pick a random asset and lock it
      const items = useInputStore.getState().inputsByOperation[opType]?.items ?? [];
      const item = items.find(i => i.id === inputId);
      if (item?.assetSetRef) {
        const set = useAssetSetStore.getState().getSet(item.assetSetRef.setId);
        if (set) {
          const resolved = await resolveAssetSet(set);
          if (resolved.length > 0) {
            const pick = resolved[Math.floor(Math.random() * resolved.length)];
            storeLockAssetSetPick(opType, inputId, pick.id);
            // Update display asset
            const state = useInputStore.getState();
            const existing = state.inputsByOperation[opType];
            if (existing) {
              (useInputStore as any).setState({
                inputsByOperation: {
                  ...state.inputsByOperation,
                  [opType]: {
                    ...existing,
                    items: existing.items.map(i =>
                      i.id === inputId ? { ...i, asset: pick } : i
                    ),
                  },
                },
              });
            }
          }
        }
      }
    }
  }, [storeUpdateAssetSetMode, storeLockAssetSetPick, useInputStore]);

  const handleSetReroll = useCallback(async (opType: typeof operationType, inputId: string) => {
    const items = useInputStore.getState().inputsByOperation[opType]?.items ?? [];
    const item = items.find(i => i.id === inputId);
    if (!item?.assetSetRef) return;
    const set = useAssetSetStore.getState().getSet(item.assetSetRef.setId);
    if (!set) return;
    const resolved = await resolveAssetSet(set);
    if (resolved.length === 0) return;
    // Avoid picking the same asset that's currently displayed
    const currentAssetId = item.asset?.id;
    const candidates = resolved.length > 1
      ? resolved.filter(a => a.id !== currentAssetId)
      : resolved;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    storeLockAssetSetPick(opType, inputId, pick.id);
    // Update display asset
    const state = useInputStore.getState();
    const existing = state.inputsByOperation[opType];
    if (existing) {
      (useInputStore as any).setState({
        inputsByOperation: {
          ...state.inputsByOperation,
          [opType]: {
            ...existing,
            items: existing.items.map(i =>
              i.id === inputId ? { ...i, asset: pick } : i
            ),
          },
        },
      });
    }
  }, [storeLockAssetSetPick, useInputStore]);

  // Badge widget for slots WITH a set linked (always visible)
  const buildSetBadgeWidget = useCallback(
    (item: InputItem, slotIdx: number) => {
      if (!item.assetSetRef) return null;
      const isRandom = item.assetSetRef.mode === 'random_each';
      const set = useAssetSetStore.getState().getSet(item.assetSetRef.setId);
      return createBadgeWidget({
        id: 'asset-set-ref',
        ...BADGE_SLOT.topLeft,
        variant: 'icon',
        icon: isRandom ? 'shuffle' : 'lock',
        color: 'purple',
        shape: 'circle',
        tooltip: `Set: ${set?.name ?? 'Unknown'} (${isRandom ? 'random each' : 'locked'})`,
        priority: 21,
        className: isRandom ? 'animate-pulse-badge' : '',
        onClick: (_data: any, e?: any) => {
          const target = e?.currentTarget ?? e?.target;
          if (target) {
            const rect = target.getBoundingClientRect();
            handleSetPopoverOpen(slotIdx, rect);
          }
        },
      });
    },
    [handleSetPopoverOpen],
  );

  // Badge widget for slots WITHOUT a set linked (hover-only, to allow linking)
  const buildSetLinkWidget = useCallback(
    (slotIdx: number) => createBadgeWidget({
      id: 'asset-set-link',
      ...BADGE_SLOT.topLeft,
      visibility: { trigger: 'hover-container', transition: 'fade' },
      variant: 'icon',
      icon: 'shuffle',
      color: 'gray',
      shape: 'circle',
      tooltip: 'Link asset set',
      priority: 21,
      className: 'opacity-50 hover:opacity-100',
      onClick: (_data: any, e?: any) => {
        const target = e?.currentTarget ?? e?.target;
        if (target) {
          const rect = target.getBoundingClientRect();
          handleSetPopoverOpen(slotIdx, rect);
        }
      },
    }),
    [handleSetPopoverOpen],
  );

  // Switch a mask layer to a different version asset
  const handleMaskVersionSwitch = useCallback(
    (item: InputItem, oldAssetId: number, newAssetId: number) => {
      const layer = item.maskLayers?.find((l) => l.assetUrl === `asset:${oldAssetId}`);
      if (layer) {
        storeUpdateMaskLayer(operationType, item.id, layer.id, { assetUrl: `asset:${newAssetId}` });
      }
    },
    [storeUpdateMaskLayer, operationType],
  );

  // Unified widget assembly for any slot.
  // Combines static badges (module-level) + interactive badges (callbacks above).
  const buildSlotExtraWidgets = useCallback(
    (item: InputItem | null, slotIdx: number, opts?: { includeSlotIndex?: boolean }) => {
      if (!item) return [];
      const isClamped = clampedSlotIndices.has(slotIdx);
      const widgets = [];
      if (opts?.includeSlotIndex) widgets.push(slotIndexBadge(slotIdx));
      if (item.assetSetRef) {
        const badge = buildSetBadgeWidget(item, slotIdx);
        if (badge) widgets.push(badge);
      } else {
        widgets.push(buildSetLinkWidget(slotIdx));
      }
      const visibleMasks = item.maskLayers?.filter((l) => l.visible) ?? [];
      const maskCount = visibleMasks.length || (item.maskUrl ? 1 : 0);
      if (maskCount > 0) {
        const maskAssetIds = visibleMasks
          .map((l) => { const m = l.assetUrl.match(/^asset:(\d+)$/); return m ? Number(m[1]) : null; })
          .filter((id): id is number => id !== null);
        widgets.push(maskBadge(
          maskCount,
          maskAssetIds,
          (oldId, newId) => handleMaskVersionSwitch(item, oldId, newId),
        ));
      }
      if (isClamped) widgets.push(warningBadge(`Over limit — only the first ${maxAssetItems} assets will be used`));
      return widgets;
    },
    [clampedSlotIndices, maxAssetItems, buildSetBadgeWidget, buildSetLinkWidget, handleMaskVersionSwitch],
  );

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
    toggleSkip: storeToggleSkip,
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

    // Virtual empty slot (carousel)
    showVirtualEmptySlot,
    carouselTotalCount,
    isOnVirtualSlot,

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
    buildSlotExtraWidgets,

    // Asset set slot ref
    activeSetPopover,
    handleSetPopoverOpen,
    handleSetPopoverClose,
    handleSetLink,
    handleSetUnlink,
    handleSetModeChange,
    handleSetReroll,

    // Asset picker popover
    handlePickAsset,
    pickerAnchorRect,
    handleClosePickerPopover,

    // Source label
    sourceLabel: ctx?.sourceLabel,
  };
}

export type AssetPanelState = ReturnType<typeof useAssetPanelState>;

