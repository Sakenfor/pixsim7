/**
 * AssetPanel - Shows selected/queued assets for QuickGenerate.
 * Supports mousewheel scrolling to cycle through queue.
 * Navigation pill has grid popup for quick selection.
 *
 * Split from QuickGeneratePanels.tsx.
 */
import { resolveMediaTypes } from '@pixsim7/shared.assets.core';
import { Ref } from '@pixsim7/shared.ref.core';
import type { AssetRef } from '@pixsim7/shared.types';
import { Dropdown } from '@pixsim7/shared.ui';
import { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';

import { useDockviewId } from '@lib/dockview';
import { getArrayParamLimits, type ParamSpec } from '@lib/generation-ui';
import { Icon } from '@lib/icons';

import { getAssetDisplayUrls } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared';
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
import { useWorkspaceStore } from '@features/workspace';

import { OPERATION_METADATA } from '@/types/operations';

import { useRecentGenerations } from '../hooks/useRecentGenerations';
import { useGenerationHistoryStore } from '../stores/generationHistoryStore';
import { useGenerationsStore } from '../stores/generationsStore';

import { FLEXIBLE_OPERATIONS, EMPTY_INPUTS, type QuickGenPanelProps } from './quickGenPanelTypes';


export function AssetPanel(props: QuickGenPanelProps) {
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
  const { useInputStore } = useGenerationScopeStores();

  // History state
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const isHistoryOpenerRef = useRef(false);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);
  const updateFloatingPanelContext = useWorkspaceStore((s) => s.updateFloatingPanelContext);
  const isHistoryPanelOpen = useWorkspaceStore((s) =>
    s.floatingPanels.some((panel) => panel.id === 'quickgen-history'),
  );

  // Recent generations state
  const recentGensTriggerRef = useRef<HTMLButtonElement>(null);
  const isRecentGensOpenerRef = useRef(false);
  const isRecentGensPanelOpen = useWorkspaceStore((s) =>
    s.floatingPanels.some((panel) => panel.id === 'recent-generations'),
  );
  // Fetch recent generations so the store is populated for the count badge
  useRecentGenerations({ fetchOnMount: true });
  const completedGenerationCount = useGenerationsStore((s) => {
    let count = 0;
    for (const gen of s.generations.values()) {
      if (gen.status === 'completed' && gen.assetId != null) count++;
    }
    return count;
  });

  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

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
  const updateLockedTimestamp = ctxUpdateLockedTimestamp ?? storeUpdateLockedTimestamp;
  const storeInputs = useInputStore(s => s.inputsByOperation[operationType]?.items ?? EMPTY_INPUTS);
  const storeInputIndex = useInputStore(s => s.inputsByOperation[operationType]?.currentIndex ?? 1);
  const storeSetInputIndex = useInputStore(s => s.setInputIndex);
  const storeCycleInputs = useInputStore(s => s.cycleInputs);
  const armedSlotIndex = useInputStore(s => s.armedSlotByOperation?.[operationType]);
  const setArmedSlot = useInputStore(s => s.setArmedSlot);
  const setInputMode = useInputStore(s => s.setInputMode);

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

  const displayAssets = useMemo(() => {
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
        const supportsMulti = operationMeta?.multiAssetMode !== 'single';
        const minCount = operationMeta?.multiAssetMode === 'required'
          ? 2
          : isFlexibleOperation
          ? 0
          : 1;
        const isMultiAsset =
          operationMeta?.multiAssetMode === 'required' ||
          (supportsMulti && (displayAssets?.length ?? 0) > 1);
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
  const isOverLimit = maxAssetItems !== null && operationInputs.length > maxAssetItems;
  const overLimitCount = isOverLimit && maxAssetItems !== null
    ? Math.max(0, operationInputs.length - maxAssetItems)
    : 0;

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

  const hasAsset = displayAssets.length > 0;
  const isMultiAssetDisplay = operationMeta?.multiAssetMode === 'required' || displayAssets.length > 1;
  const currentInputIdx = Math.max(0, Math.min(operationInputIndex - 1, orderedInputs.length - 1));
  const currentInput = orderedInputs[currentInputIdx];
  const currentInputId = currentInput?.id;

  // Reset opener tracking when the history panel closes
  useEffect(() => {
    if (!isHistoryPanelOpen) {
      isHistoryOpenerRef.current = false;
    }
  }, [isHistoryPanelOpen]);

  // History panel toggle handler
  const handleToggleHistory = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isHistoryPanelOpen) {
        closeFloatingPanel('quickgen-history');
        isHistoryOpenerRef.current = false;
        return;
      }

      const panelWidth = 360;
      const panelHeight = 320;
      let x: number | undefined;
      let y: number | undefined;

      if (historyTriggerRef.current) {
        const rect = historyTriggerRef.current.getBoundingClientRect();
        const minX = 8;
        const maxX = window.innerWidth - panelWidth - 8;
        x = Math.max(minX, Math.min(maxX, rect.left + rect.width / 2 - panelWidth / 2));

        const showAbove =
          rect.top > window.innerHeight - rect.bottom && rect.top > panelHeight + 8;
        const desiredY = showAbove ? rect.top - panelHeight - 8 : rect.bottom + 8;
        const minY = 8;
        const maxY = window.innerHeight - panelHeight - 8;
        y = Math.max(minY, Math.min(maxY, desiredY));
      }

      const resolvedSourceLabel = ctx?.sourceLabel || scopeInstanceId || instanceId || 'History';
      isHistoryOpenerRef.current = true;
      openFloatingPanel('quickgen-history', {
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        context: scopeInstanceId
          ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
          : { operationType, sourceLabel: resolvedSourceLabel },
      });
    },
    [isHistoryPanelOpen, closeFloatingPanel, openFloatingPanel, operationType, scopeInstanceId, instanceId, dockviewId],
  );

  useEffect(() => {
    if (!isHistoryPanelOpen || !isHistoryOpenerRef.current) return;
    const resolvedSourceLabel = ctx?.sourceLabel || scopeInstanceId || instanceId || 'History';
    updateFloatingPanelContext(
      'quickgen-history',
      scopeInstanceId
        ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
        : { operationType, sourceLabel: resolvedSourceLabel },
    );
  }, [isHistoryPanelOpen, operationType, scopeInstanceId, instanceId, ctx?.sourceLabel, updateFloatingPanelContext]);

  // Reset opener tracking when the recent generations panel closes
  useEffect(() => {
    if (!isRecentGensPanelOpen) {
      isRecentGensOpenerRef.current = false;
    }
  }, [isRecentGensPanelOpen]);

  // Recent generations panel toggle handler
  const handleToggleRecentGenerations = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isRecentGensPanelOpen) {
        closeFloatingPanel('recent-generations');
        isRecentGensOpenerRef.current = false;
        return;
      }

      const panelWidth = 360;
      const panelHeight = 320;
      let x: number | undefined;
      let y: number | undefined;

      if (recentGensTriggerRef.current) {
        const rect = recentGensTriggerRef.current.getBoundingClientRect();
        const minX = 8;
        const maxX = window.innerWidth - panelWidth - 8;
        x = Math.max(minX, Math.min(maxX, rect.left + rect.width / 2 - panelWidth / 2));

        const showAbove =
          rect.top > window.innerHeight - rect.bottom && rect.top > panelHeight + 8;
        const desiredY = showAbove ? rect.top - panelHeight - 8 : rect.bottom + 8;
        const minY = 8;
        const maxY = window.innerHeight - panelHeight - 8;
        y = Math.max(minY, Math.min(maxY, desiredY));
      }

      const resolvedSourceLabel = ctx?.sourceLabel || scopeInstanceId || instanceId || 'Recent';
      isRecentGensOpenerRef.current = true;
      openFloatingPanel('recent-generations', {
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        context: scopeInstanceId
          ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
          : { operationType, sourceLabel: resolvedSourceLabel },
      });
    },
    [isRecentGensPanelOpen, closeFloatingPanel, openFloatingPanel, operationType, scopeInstanceId, instanceId],
  );

  useEffect(() => {
    if (!isRecentGensPanelOpen || !isRecentGensOpenerRef.current) return;
    const resolvedSourceLabel = ctx?.sourceLabel || scopeInstanceId || instanceId || 'Recent';
    updateFloatingPanelContext(
      'recent-generations',
      scopeInstanceId
        ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
        : { operationType, sourceLabel: resolvedSourceLabel },
    );
  }, [isRecentGensPanelOpen, operationType, scopeInstanceId, instanceId, ctx?.sourceLabel, updateFloatingPanelContext]);

  // Sync anchor rect for settings dropdown while open
  useLayoutEffect(() => {
    if (!showSettingsPopover || !settingsTriggerRef.current) {
      setAnchorRect(null);
      return;
    }
    const update = () => {
      setAnchorRect(settingsTriggerRef.current?.getBoundingClientRect() ?? null);
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showSettingsPopover]);

  // History button component (inline in header bar)
  const hasHistory = compatibleHistory.length > 0;
  const hasPinnedAssets = compatibleHistory.some(e => e.pinned);
  const historyButton = (
    <button
      ref={historyTriggerRef}
      onClick={handleToggleHistory}
      className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
        isHistoryPanelOpen
          ? 'bg-purple-600 hover:bg-purple-700 text-white'
          : hasHistory
          ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
      }`}
      title={isHistoryPanelOpen ? 'History panel (open)' : hasHistory ? `History (${sortedHistory.length})` : 'No history yet'}
    >
      <Icon name="clock" size={10} />
      <span>{hasHistory ? sortedHistory.length : 0}</span>
      {hasPinnedAssets && !isHistoryPanelOpen && (
        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
      )}
    </button>
  );

  const hasCompletedGenerations = completedGenerationCount > 0;
  const recentGenerationsButton = (
    <button
      ref={recentGensTriggerRef}
      onClick={handleToggleRecentGenerations}
      className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
        isRecentGensPanelOpen
          ? 'bg-blue-600 hover:bg-blue-700 text-white'
          : hasCompletedGenerations
          ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
      }`}
      title={isRecentGensPanelOpen ? 'Recent generations (open)' : hasCompletedGenerations ? `Recent generations (${completedGenerationCount})` : 'No recent generations'}
    >
      <Icon name="sparkles" size={10} />
      <span>{completedGenerationCount}</span>
    </button>
  );

  const settingsButton = (
    <button
      ref={settingsTriggerRef}
      onClick={(e) => {
        e.stopPropagation();
        setShowSettingsPopover((prev) => !prev);
      }}
      className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
        showSettingsPopover
          ? 'bg-amber-600 hover:bg-amber-700 text-white'
          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
      }`}
      title="Asset panel settings"
      type="button"
    >
      <Icon name="sliders" size={10} />
      {assetHasInstanceOverrides && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
      )}
    </button>
  );

  const settingsPopover = (
    <Dropdown
      isOpen={showSettingsPopover}
      onClose={() => setShowSettingsPopover(false)}
      portal
      positionMode="fixed"
      triggerRef={settingsTriggerRef}
      anchorPosition={
        anchorRect
          ? {
              x: Math.max(8, Math.min(anchorRect.right - 192, window.innerWidth - 192 - 8)),
              y: anchorRect.bottom + 4,
            }
          : { x: 0, y: 0 }
      }
      minWidth="192px"
      className="rounded-lg bg-white dark:bg-neutral-900"
    >
      <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
        Display
      </div>
      <div className="space-y-2">
        <label className="block text-[10px] text-neutral-500 dark:text-neutral-400">Multi-input mode</label>
        <select
          value={assetInstanceOverrides?.displayMode ?? '__global__'}
          onChange={(e) => handleComponentSetting('displayMode', e.target.value)}
          className="w-full px-2 py-1 text-[11px] rounded-md bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
        >
          <option value="__global__">Global ({globalDisplayMode})</option>
          <option value="strip">Strip</option>
          <option value="grid">Grid</option>
          <option value="carousel">Carousel</option>
        </select>

        {resolvedDisplayMode === 'grid' && (
          <>
            <label className="block text-[10px] text-neutral-500 dark:text-neutral-400">Grid columns</label>
            <select
              value={assetInstanceOverrides?.gridColumns ?? '__global__'}
              onChange={(e) => handleComponentSetting('gridColumns', e.target.value === '__global__' ? '__global__' : Number(e.target.value))}
              className="w-full px-2 py-1 text-[11px] rounded-md bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            >
              <option value="__global__">Global ({globalGridColumns})</option>
              {[2, 3, 4, 5, 6].map((val) => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </>
        )}

        {assetHasInstanceOverrides && (
          <button
            type="button"
            onClick={handleClearInstanceOverrides}
            className="w-full mt-1 text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
          >
            Reset instance overrides
          </button>
        )}
      </div>
    </Dropdown>
  );

  const limitLabel = maxAssetItems && operationMeta?.multiAssetMode !== 'single' ? (
    <div
      className={`text-[10px] font-medium ${
        isOverLimit ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'
      }`}
      title={
        isOverLimit
          ? `Only the first ${maxAssetItems} assets will be used (remove ${overLimitCount}).`
          : `Max ${maxAssetItems} assets for this model.`
      }
    >
      Max {maxAssetItems} assets
    </div>
  ) : null;

  // Header bar with history and settings buttons grouped on right
  const headerBar = (
    <>
      <div className="relative flex items-center justify-between gap-1 px-2 py-1 shrink-0">
        {limitLabel ?? <div />}
        <div className="flex items-center gap-1">
          {resolvedDisplayMode === 'carousel' && operationInputs.length > 0 && (
            <div
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-accent/20 text-accent"
              title="Carousel mode: adding an asset replaces the currently viewed one"
            >
              <Icon name="refresh-cw" size={9} />
              <span>Replace</span>
            </div>
          )}
          {historyButton}
          {recentGenerationsButton}
          {settingsButton}
        </div>
      </div>
      {settingsPopover}
    </>
  );

  if (!hasAsset) {
    return (
      <div className="h-full flex flex-col">
        {headerBar}
        <div className="flex-1 flex items-center justify-center p-3">
          <div className="text-xs text-neutral-500 italic text-center">
            {operationType === 'video_extend' ? 'Select video' :
             operationMeta?.multiAssetMode === 'required' ? '+ Add images' :
             isFlexibleOperation ? '+ Image (optional)' : 'Select image'}
          </div>
        </div>
      </div>
    );
  }

  const isGridMode = resolvedDisplayMode === 'grid';

  // Multi-asset display (strip/grid). Carousel uses the single-asset path below.
  if (isMultiAssetDisplay && resolvedDisplayMode !== 'carousel') {
    return (
      <div className="h-full w-full flex flex-col">
        {headerBar}
        <div
          ref={containerRef}
          className={`flex-1 p-2 pt-0 ${isGridMode ? 'overflow-auto' : 'overflow-x-auto'}`}
        >
          <div
            className={isGridMode ? 'grid gap-1.5' : 'flex gap-1.5 h-full'}
            style={isGridMode ? { gridTemplateColumns: `repeat(${resolvedGridColumns}, minmax(0, 1fr))` } : undefined}
          >
            {slotItems.map((inputItem, idx) => {
              const isSelected = !!inputItem && inputItem.id === currentInputId;
              const isClamped = clampedSlotIndices.has(idx);
              const wrapperClasses = isGridMode
                ? 'relative aspect-square'
                : 'relative flex-shrink-0 h-full aspect-square';

              if (!inputItem) {
                const isArmed = armedSlotIndex === idx;
                return (
                  <div
                    key={`empty-${idx}`}
                    className={`${wrapperClasses} ${isClamped ? 'opacity-40' : ''} border border-dashed ${
                      isArmed ? 'border-accent ring-2 ring-accent/60' : 'border-neutral-300 dark:border-neutral-700'
                    } rounded-md flex items-center justify-center`}
                    onClick={() => {
                      if (isClamped) return;
                      setArmedSlot(operationType, isArmed ? undefined : idx);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isClamped) return;
                        setArmedSlot(operationType, isArmed ? undefined : idx);
                      }
                    }}
                    aria-disabled={isClamped}
                  >
                    <div className="text-[10px] text-neutral-400">
                      {isArmed ? 'Next input' : 'Empty slot'}
                    </div>
                    <div className="absolute top-1 left-1 bg-neutral-700 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                      {idx + 1}
                    </div>
                    {isClamped && (
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/40 text-white text-[10px] font-semibold z-10 pointer-events-none">
                        Exceeds limit
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={inputItem.id ?? idx}
                  className={`${wrapperClasses} ${isSelected ? 'quickgen-asset-selected' : ''} ${isClamped ? 'opacity-50' : ''}`}
                  onClick={() => {
                    if (isClamped) return;
                    if (armedSlotIndex !== undefined) {
                      setArmedSlot(operationType, undefined);
                    }
                    const selectedIndex = inputIndexById.get(inputItem.id);
                    if (selectedIndex !== undefined) {
                      setOperationInputIndex?.(selectedIndex + 1);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isClamped) return;
                      if (armedSlotIndex !== undefined) {
                        setArmedSlot(operationType, undefined);
                      }
                      const selectedIndex = inputIndexById.get(inputItem.id);
                      if (selectedIndex !== undefined) {
                        setOperationInputIndex?.(selectedIndex + 1);
                      }
                    }
                  }}
                  aria-disabled={isClamped}
                >
                  <CompactAssetCard
                    asset={inputItem.asset}
                    showRemoveButton
                    onRemove={() => removeInput(operationType, inputItem.id)}
                    lockedTimestamp={inputItem.lockedTimestamp}
                    onLockTimestamp={(timestamp) => updateLockedTimestamp?.(operationType, inputItem.id, timestamp)}
                    hideFooter
                    fillHeight
                    enableHoverPreview={enableHoverPreview}
                    showPlayOverlay={showPlayOverlay}
                    clickToPlay={clickToPlay}
                    disableMotion={isSelected}
                    className={`${isSelected ? 'ring-2 ring-accent' : ''} ${isClamped ? 'grayscale' : ''}`}
                  />
                  <div className="absolute top-1 left-1 bg-purple-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                    {idx + 1}
                  </div>
                  {isClamped && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50 text-white text-[10px] font-semibold z-10 pointer-events-none">
                      Exceeds limit
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Single-asset display: existing behavior
  // Get the current queue item based on index
  const currentSlotIndex = currentInput
    ? (typeof currentInput.slotIndex === 'number' ? currentInput.slotIndex : currentInputIdx)
    : null;
  const isCurrentClamped = currentSlotIndex !== null && clampedSlotIndices.has(currentSlotIndex);

  // Build queue items for grid popup - use index as part of key to ensure uniqueness
  const queueItems = orderedInputs.flatMap((item, idx) => {
    if (!item?.asset) return [];
    const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(item.asset);
    const thumbUrl = thumbnailUrl ?? previewUrl ?? mainUrl ?? '';
    return [{
      id: `${item.asset.id}-${idx}`,
      thumbnailUrl: thumbUrl,
    }];
  });

  const currentAsset = currentInput?.asset ?? displayAssets[0];
  const singleHoverPreview = enableHoverPreview;

  return (
    <div className="h-full w-full flex flex-col">
      {headerBar}
      <div ref={containerRef} className="flex-1 p-2 pt-0">
        <div className={`relative h-full ${isCurrentClamped ? 'opacity-50' : ''}`}>
          <CompactAssetCard
            asset={currentAsset}
          showRemoveButton={orderedInputs.length > 0}
            onRemove={() => {
              if (currentInputId) {
                removeInput?.(operationType, currentInputId);
              }
            }}
            lockedTimestamp={currentInput?.lockedTimestamp}
            onLockTimestamp={
              currentInputId
                ? (timestamp) =>
                    updateLockedTimestamp?.(operationType, currentInputId, timestamp)
                : undefined
            }
            hideFooter
            fillHeight
            currentIndex={operationInputIndex}
          totalCount={orderedInputs.length}
            onNavigatePrev={() => cycleInputs?.(operationType, 'prev')}
            onNavigateNext={() => cycleInputs?.(operationType, 'next')}
            queueItems={queueItems}
            onSelectIndex={(idx) => setOperationInputIndex?.(idx + 1)} // Convert 0-based to 1-based
            enableHoverPreview={singleHoverPreview}
            showPlayOverlay={showPlayOverlay}
            clickToPlay={clickToPlay}
            className={isCurrentClamped ? 'grayscale' : ''}
          />
          {isCurrentClamped && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50 text-white text-[10px] font-semibold z-10 pointer-events-none">
              Exceeds limit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
