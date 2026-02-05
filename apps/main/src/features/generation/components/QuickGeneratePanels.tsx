/**
 * QuickGeneratePanels - Minimal dockview panels for asset/prompt/settings
 *
 * Simple, lightweight panel components for use in QuickGenPanelHost dockview instances.
 * Panels receive context via SmartDockview's injected props.
 */
import { resolveMediaTypes } from '@pixsim7/shared.assets.core';
import { Ref } from '@pixsim7/shared.ref.core';
import type { AssetRef } from '@pixsim7/shared.types';
import { PromptInput } from '@pixsim7/shared.ui';
import type { IDockviewPanelProps } from 'dockview-core';
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';


import { useDockviewId } from '@lib/dockview';
import { getArrayParamLimits, getDurationOptions, type ParamSpec } from '@lib/generation-ui';
import { ThemedIcon, Icon } from '@lib/icons';
import { PromptCompanionHost } from '@lib/ui';


import { getAssetDisplayUrls, type AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared';
import {
  CAP_PROMPT_BOX,
  CAP_GENERATION_WIDGET,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  useCapability,
  usePanelContext,
  useProvideCapability,
  type PromptBoxContext,
  type AssetInputContext,
  type GenerateActionContext,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  GenerationSettingsPanel,
  type InputItem,
  useGenerationScopeStores,
  useGenerationWorkbench,
  resolveDisplayAssets,
} from '@features/generation';
import {
  QUICKGEN_PROMPT_COMPONENT_ID,
  QUICKGEN_SETTINGS_COMPONENT_ID,
  QUICKGEN_ASSET_COMPONENT_ID,
  QUICKGEN_PROMPT_DEFAULTS,
  QUICKGEN_SETTINGS_DEFAULTS,
  QUICKGEN_ASSET_DEFAULTS,
} from '@features/generation/lib/quickGenerateComponentSettings';
import { useResolveComponentSettings, getInstanceId, useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId, usePanelInstanceSettingsStore } from '@features/panels';
import { useQuickGenerateController } from '@features/prompts';
import { useWorkspaceStore } from '@features/workspace';

import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';

import { useGenerationHistoryStore } from '../stores/generationHistoryStore';


// Panel IDs
export type QuickGenPanelId =
  | 'quickgen-asset'
  | 'quickgen-prompt'
  | 'quickgen-settings'
  | 'quickgen-blocks';

// Shared context passed to all panels
export interface QuickGenPanelContext {
  // Asset panel
  displayAssets: AssetModel[];
  operationInputs: InputItem[];
  operationInputIndex: number;
  operationType: OperationType;
  isFlexibleOperation: boolean;
  removeInput: (operationType: OperationType, inputId: string) => void;
  updateLockedTimestamp: (operationType: OperationType, inputId: string, timestamp: number | undefined) => void;
  cycleInputs: (operationType: OperationType, direction: 'prev' | 'next') => void;
  setOperationInputIndex: (index: number) => void;
  transitionPrompts?: string[];
  setTransitionPrompts?: React.Dispatch<React.SetStateAction<string[]>>;
  transitionDurations?: number[];
  setTransitionDurations?: React.Dispatch<React.SetStateAction<number[]>>;

  // Prompt panel
  prompt: string;
  setPrompt: (value: string) => void;
  providerId?: string;
  model?: string;
  paramSpecs?: ParamSpec[];
  generating: boolean;
  error?: string | null;

  // Settings panel
  renderSettingsPanel?: () => React.ReactNode;

  // Target toggle
  targetProviderId?: string;
}

// Panel props with injected context from SmartDockview
export interface QuickGenPanelProps extends IDockviewPanelProps {
  context?: Partial<QuickGenPanelContext>;
  panelId: string;
}

const FLEXIBLE_OPERATIONS = new Set<OperationType>(['image_to_video', 'image_to_image']);
const EMPTY_INPUTS: InputItem[] = [];

/**
 * Asset Panel - Shows selected/queued assets
 * Supports mousewheel scrolling to cycle through queue
 * Navigation pill has grid popup for quick selection
 */
export function AssetPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const allowAnySelected = !ctx;
  const controller = useQuickGenerateController();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-asset';
  const scopeInstanceId = useScopeInstanceId("generation");
  const dockviewId = useDockviewId();
  const instanceId = scopeInstanceId ?? getInstanceId(dockviewId, panelInstanceId);
  const capabilityScope = resolveCapabilityScopeFromScopeInstanceId(scopeInstanceId);

  // Subscribe to scoped input store for live input data
  const { useInputStore } = useGenerationScopeStores();

  // History state
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);
  const updateFloatingPanelContext = useWorkspaceStore((s) => s.updateFloatingPanelContext);
  const isHistoryPanelOpen = useWorkspaceStore((s) =>
    s.floatingPanels.some((panel) => panel.id === 'quickgen-history'),
  );
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsPopoverRef = useRef<HTMLDivElement>(null);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);

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

  // History panel toggle handler
  const handleToggleHistory = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isHistoryPanelOpen) {
        closeFloatingPanel('quickgen-history');
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

      openFloatingPanel('quickgen-history', {
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        context: scopeInstanceId
          ? { operationType, generationScopeId: scopeInstanceId }
          : { operationType },
      });
    },
    [isHistoryPanelOpen, closeFloatingPanel, openFloatingPanel, operationType, scopeInstanceId],
  );

  useEffect(() => {
    if (!isHistoryPanelOpen) return;
    updateFloatingPanelContext(
      'quickgen-history',
      scopeInstanceId
        ? { operationType, generationScopeId: scopeInstanceId }
        : { operationType },
    );
  }, [isHistoryPanelOpen, operationType, scopeInstanceId, updateFloatingPanelContext]);

  useEffect(() => {
    if (!showSettingsPopover) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsPopoverRef.current &&
        !settingsPopoverRef.current.contains(event.target as Node) &&
        settingsTriggerRef.current &&
        !settingsTriggerRef.current.contains(event.target as Node)
      ) {
        setShowSettingsPopover(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSettingsPopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
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

  const settingsButton = (
    <button
      ref={settingsTriggerRef}
      onClick={(e) => {
        e.stopPropagation();
        setShowSettingsPopover((prev) => !prev);
      }}
      className="relative flex items-center justify-center w-6 h-5 rounded text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
      title="Asset panel settings"
      type="button"
    >
      <ThemedIcon name="settings" size={10} variant="default" />
      {assetHasInstanceOverrides && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
      )}
    </button>
  );

  const settingsPopover = showSettingsPopover && (
    <div
      ref={settingsPopoverRef}
      className="absolute right-2 top-full mt-1 w-48 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-2 z-50"
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
    </div>
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

  // Header bar with history button
  const headerBar = (
    <div className="relative flex items-center justify-between gap-1 px-2 py-1 shrink-0">
      {limitLabel ?? <div />}
      {historyButton}
      {settingsButton}
      {settingsPopover}
    </div>
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
                      isArmed ? 'border-blue-500 ring-2 ring-blue-500/60' : 'border-neutral-300 dark:border-neutral-700'
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
                    className={`${isSelected ? 'ring-2 ring-blue-500' : ''} ${isClamped ? 'grayscale' : ''}`}
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

/**
 * Prompt Panel - Text input for generation prompt
 */
export function PromptPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const allowAnySelected = !ctx;
  const controller = useQuickGenerateController();
  // Use scope instanceId if available, else fall back to dockview-computed instanceId
  const scopeInstanceId = useScopeInstanceId("generation");
  const dockviewId = useDockviewId();
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-prompt';
  const instanceId = scopeInstanceId ?? getInstanceId(dockviewId, panelInstanceId);
  const capabilityScope = resolveCapabilityScopeFromScopeInstanceId(scopeInstanceId);

  // Get workbench for fallback model and paramSpecs when no context provided
  const workbench = useGenerationWorkbench({ operationType: controller.operationType });

  // Use instance-resolved component settings (global + instance overrides)
  // The resolver already merges schema defaults -> component defaults -> global -> instance
  // Pass "generation" as scopeId to match the scope toggle key
  const { settings: resolvedPromptSettings } = useResolveComponentSettings<typeof QUICKGEN_PROMPT_DEFAULTS>(
    QUICKGEN_PROMPT_COMPONENT_ID,
    instanceId,
    "generation",
  );

  const {
    prompt = controller.prompt,
    setPrompt = controller.setPrompt,
    providerId = controller.providerId,
    model = workbench.dynamicParams?.model as string | undefined,
    paramSpecs = workbench.allParamSpecs,
    generating = controller.generating,
    operationType = controller.operationType,
    operationInputIndex = controller.operationInputIndex,
    displayAssets = resolveDisplayAssets({
      operationType,
      inputs: controller.operationInputs,
      currentIndex: controller.operationInputIndex,
      lastSelectedAsset: controller.lastSelectedAsset,
      allowAnySelected,
    }),
    isFlexibleOperation: _isFlexibleOperation = FLEXIBLE_OPERATIONS.has(operationType),
    transitionPrompts = controller.prompts,
    setTransitionPrompts = controller.setPrompts,
    transitionDurations = controller.transitionDurations,
    setTransitionDurations = controller.setTransitionDurations,
    error = controller.error,
  } = ctx || {};
  void _isFlexibleOperation; // Used in PromptPanel for future capability hints

  const maxChars = resolvePromptLimitForModel(providerId, model, paramSpecs as any);
  const hasAsset = displayAssets.length > 0;
  const isTransitionMode = operationType === 'video_transition';
  const transitionCount = Math.max(0, (displayAssets?.length ?? 0) - 1);
  const transitionIndex = Math.max(0, Math.min(operationInputIndex - 1, transitionCount - 1));
  const hasTransitionPrompt = isTransitionMode && transitionCount > 0;

  const durationOptions =
    getDurationOptions(paramSpecs as any, model)?.options ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const currentTransitionDuration =
    hasTransitionPrompt && transitionDurations?.[transitionIndex] !== undefined
      ? transitionDurations[transitionIndex]
      : durationOptions[0];

  const promptValue = hasTransitionPrompt
    ? transitionPrompts?.[transitionIndex] ?? ''
    : prompt;
  const handlePromptChange = (value: string) => {
    if (!hasTransitionPrompt) {
      setPrompt(value);
      return;
    }
    setTransitionPrompts((prev) => {
      const next = [...(prev ?? [])];
      while (next.length < transitionCount) {
        next.push('');
      }
      next[transitionIndex] = value;
      return next;
    });
  };

  useProvideCapability<PromptBoxContext>(
    CAP_PROMPT_BOX,
    {
      id: `quickgen-prompt:${panelInstanceId}`,
      label: 'Prompt Box',
      priority: 50,
      getValue: () => ({
        prompt: promptValue,
        setPrompt: handlePromptChange,
        maxChars,
        providerId,
        operationType,
      }),
    },
    [promptValue, handlePromptChange, maxChars, providerId, operationType, panelInstanceId],
    { scope: capabilityScope },
  );

  return (
    <div className="h-full w-full p-2 flex flex-col gap-2">
      <div
        className={`flex-1 ${error ? 'ring-2 ring-red-500 rounded-lg' : ''}`}
        style={{ transition: 'none', animation: 'none' }}
      >
        {isTransitionMode && (
          <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
            <div>
              {transitionCount > 0
                ? `Transition ${transitionIndex + 1} -> ${transitionIndex + 2}`
                : 'Add one more image to edit prompts'}
            </div>
            {transitionCount > 0 && (
              <select
                value={currentTransitionDuration}
                onChange={(e) => {
                  const nextValue = Number(e.target.value);
                  setTransitionDurations((prev) => {
                    const next = [...(prev ?? [])];
                    while (next.length < transitionCount) {
                      next.push(durationOptions[0]);
                    }
                    next[transitionIndex] = nextValue;
                    return next;
                  });
                }}
                disabled={generating}
                className="px-2 py-0.5 text-[10px] rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              >
                {durationOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}s</option>
                ))}
              </select>
            )}
          </div>
        )}
        <PromptInput
          value={promptValue}
          onChange={handlePromptChange}
          maxChars={maxChars}
          disabled={generating || (isTransitionMode && transitionCount === 0)}
          variant={resolvedPromptSettings.variant}
          showCounter={resolvedPromptSettings.showCounter}
          resizable={resolvedPromptSettings.resizable}
          minHeight={resolvedPromptSettings.minHeight}
          placeholder={
            isTransitionMode
              ? (transitionCount > 0 ? 'Describe the motion...' : 'Add one more image...')
              : operationType === 'image_to_video'
              ? (hasAsset ? 'Describe the motion...' : 'Describe the video...')
              : operationType === 'image_to_image'
              ? (hasAsset ? 'Describe the transformation...' : 'Describe the image...')
              : operationType === 'text_to_image'
              ? 'Describe the image you want to create...'
              : operationType === 'text_to_video'
              ? 'Describe the video you want to create...'
              : operationType === 'video_extend'
              ? 'Describe how to continue the video...'
              : 'Describe the fusion...'
          }
          className="h-full"
        />
      </div>
      {/* Error is shown in GenerationSettingsPanel near Go button */}
    </div>
  );
}

/**
 * Settings Panel - Generation settings and controls
 */
export function SettingsPanel(props: QuickGenPanelProps) {
  const panelContext = usePanelContext<QuickGenPanelContext>();
  const ctx = props.context ?? panelContext ?? undefined;
  const controller = useQuickGenerateController();
  const { value: promptBox } = useCapability<PromptBoxContext>(CAP_PROMPT_BOX);
  const { provider: generationWidgetProvider } = useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  // Use scope instanceId if available, else fall back to dockview-computed instanceId
  const scopeInstanceId = useScopeInstanceId("generation");
  const dockviewId = useDockviewId();
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-settings';
  const instanceId = scopeInstanceId ?? getInstanceId(dockviewId, panelInstanceId);
  const capabilityScope = resolveCapabilityScopeFromScopeInstanceId(scopeInstanceId);

  // Use instance-resolved component settings (global + instance overrides)
  // The resolver already merges schema defaults -> component defaults -> global -> instance
  // Pass "generation" as scopeId to match the scope toggle key
  const { settings: resolvedSettings } = useResolveComponentSettings<typeof QUICKGEN_SETTINGS_DEFAULTS>(
    QUICKGEN_SETTINGS_COMPONENT_ID,
    instanceId,
    "generation",
  );

  const renderSettingsPanel = ctx?.renderSettingsPanel;
  const useDefaultPanel = !renderSettingsPanel || typeof renderSettingsPanel !== 'function';
  const derivedTargetProviderId = dockviewId ? `generation-widget:${dockviewId}` : undefined;
  const targetProviderId =
    ctx?.targetProviderId ?? generationWidgetProvider?.id ?? derivedTargetProviderId;

  const metadata = OPERATION_METADATA[controller.operationType];
  const requiresPrompt = metadata?.promptRequired ?? false;
  const activePrompt = promptBox?.prompt ?? controller.prompt;
  const canGenerate = requiresPrompt ? activePrompt.trim().length > 0 : true;

  useProvideCapability<GenerateActionContext>(
    CAP_GENERATE_ACTION,
    {
      id: `quickgen-generate:${panelInstanceId}`,
      label: 'Generate Action',
      priority: 40,
      isAvailable: () => useDefaultPanel,
      getValue: () => ({
        canGenerate,
        generating: controller.generating,
        error: controller.error,
        generate: controller.generate,
      }),
    },
    [canGenerate, controller.generating, controller.error, controller.generate, panelInstanceId, useDefaultPanel],
    { scope: capabilityScope },
  );

  // Don't show loading state - just render empty during brief mode transitions
  if (useDefaultPanel) {
    return (
      <div className="h-full w-full p-2">
        <GenerationSettingsPanel
          showOperationType={resolvedSettings.showOperationType}
          showProvider={resolvedSettings.showProvider}
          showPresets={resolvedSettings.showInputSets}
          generating={controller.generating}
          canGenerate={canGenerate}
          onGenerate={controller.generate}
          error={controller.error}
          targetProviderId={targetProviderId}
          queueProgress={controller.queueProgress}
          onGenerateBurst={controller.generateBurst}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full p-2">
      {renderSettingsPanel()}
    </div>
  );
}

/**
 * Blocks Panel - Prompt companion with block analysis tools
 */
export function BlocksPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const controller = useQuickGenerateController();

  const {
    prompt = controller.prompt,
    setPrompt = controller.setPrompt,
    operationType = controller.operationType,
    providerId = controller.providerId,
  } = ctx || {};

  return (
    <div className="h-full w-full p-2 overflow-auto">
      <PromptCompanionHost
        surface="quick-generate"
        promptValue={prompt}
        setPromptValue={setPrompt}
        metadata={{ operationType, providerId }}
      />
    </div>
  );
}
