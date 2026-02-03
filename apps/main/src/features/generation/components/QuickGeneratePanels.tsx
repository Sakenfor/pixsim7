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
import { Pin, X, Clock, Play } from 'lucide-react';
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';


import { useDockviewId } from '@lib/dockview';
import { getDurationOptions } from '@lib/generation-ui';
import { ThemedIcon } from '@lib/icons';
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

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';
import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';

import { useGenerationHistoryStore, type AssetHistoryEntry } from '../stores/generationHistoryStore';


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
  operationInputs: { id: string; asset: AssetModel; lockedTimestamp?: number }[];
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
  paramSpecs?: Array<{ name: string; max_length?: number; metadata?: Record<string, unknown> }>;
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

// --- History Popup Components ---

function HistoryThumbnail({ url, alt }: { url: string; alt: string }) {
  const { mediaSrc } = useResolvedAssetMedia({ mediaUrl: url });
  const resolvedSrc = mediaSrc || url;
  return <img src={resolvedSrc} alt={alt} className="w-full h-full object-cover" />;
}

interface HistoryPopupPosition {
  x: number;
  y: number;
  showAbove: boolean;
}

interface HistoryPopupProps {
  history: AssetHistoryEntry[];
  position: HistoryPopupPosition;
  onClose: () => void;
  onSelectAsset: (entry: AssetHistoryEntry) => void;
  onTogglePin: (assetId: number) => void;
  onRemove: (assetId: number) => void;
  isPinned: boolean;
  onTogglePinned: () => void;
  pinnedPosition: { x: number; y: number };
  pinnedSize: { width: number; height: number };
  onPinnedPositionChange: (pos: { x: number; y: number }) => void;
  onPinnedSizeChange: (size: { width: number; height: number }) => void;
}

function HistoryPopup({
  history,
  position,
  onClose,
  onSelectAsset,
  onTogglePin,
  onRemove,
  isPinned,
  onTogglePinned,
  pinnedPosition,
  pinnedSize,
  onPinnedPositionChange,
  onPinnedSizeChange,
}: HistoryPopupProps) {
  void onPinnedSizeChange;
  const pinnedEntries = history.filter((e) => e.pinned);
  const recent = history.filter((e) => !e.pinned);

  // Grid layout: 4 columns max
  const cols = Math.min(4, Math.max(2, history.length));
  const popupWidth = cols * 72 + (cols - 1) * 6 + 20; // thumbnails + gaps + padding

  // Drag state for pinned mode
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!isPinned) return;
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - pinnedPosition.x,
      y: e.clientY - pinnedPosition.y,
    });
  }, [isPinned, pinnedPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      onPinnedPositionChange({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, onPinnedPositionChange]);

  // Header with pin toggle and close
  const header = (
    <div className="flex items-center justify-between mb-2 px-1 select-none">
      {/* Drag handle area - takes up available space */}
      <div
        className="flex-1 cursor-move py-1 -my-1"
        onMouseDown={handleDragStart}
      >
        <span className="text-xs font-medium text-neutral-300">Asset History</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePinned();
          }}
          className={`w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
            isPinned
              ? 'bg-purple-600 hover:bg-purple-700'
              : 'bg-neutral-700 hover:bg-neutral-600'
          }`}
          title={isPinned ? 'Unpin panel' : 'Pin panel (keep open)'}
        >
          <Pin size={10} className="text-white" />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-5 h-5 rounded bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center cursor-pointer"
          title="Close"
        >
          <X size={10} className="text-neutral-300" />
        </button>
      </div>
    </div>
  );

  // Content section
  const content = (
    <div className="overflow-y-auto flex-1" style={{ maxHeight: isPinned ? 'calc(100% - 28px)' : '350px' }}>
      {/* Pinned section */}
      {pinnedEntries.length > 0 && (
        <>
          <div className="flex items-center gap-1 text-[10px] text-neutral-400 mb-1.5 px-1">
            <Pin size={10} />
            <span>Pinned</span>
          </div>
          <div
            className="grid gap-1.5 mb-2"
            style={{ gridTemplateColumns: `repeat(${cols}, 64px)` }}
          >
            {pinnedEntries.map((entry) => (
              <HistoryItem
                key={entry.assetId}
                entry={entry}
                onSelect={() => onSelectAsset(entry)}
                onTogglePin={() => onTogglePin(entry.assetId)}
                onRemove={() => onRemove(entry.assetId)}
              />
            ))}
          </div>
        </>
      )}

      {/* Recent section */}
      {recent.length > 0 && (
        <>
          <div className="flex items-center gap-1 text-[10px] text-neutral-400 mb-1.5 px-1">
            <Clock size={10} />
            <span>Recent</span>
          </div>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, 64px)` }}
          >
            {recent.map((entry) => (
              <HistoryItem
                key={entry.assetId}
                entry={entry}
                onSelect={() => onSelectAsset(entry)}
                onTogglePin={() => onTogglePin(entry.assetId)}
                onRemove={() => onRemove(entry.assetId)}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {history.length === 0 && (
        <div className="text-xs text-neutral-500 italic py-4 text-center">
          No history yet
        </div>
      )}
    </div>
  );

  // Pinned mode: floating draggable panel
  if (isPinned) {
    return createPortal(
      <div
        className="fixed bg-neutral-900 rounded-lg shadow-2xl border border-purple-500/50"
        style={{
          zIndex: 99999,
          left: pinnedPosition.x,
          top: pinnedPosition.y,
          width: pinnedSize.width,
          height: pinnedSize.height,
        }}
      >
        <div className="p-2 h-full flex flex-col">
          {header}
          {content}
        </div>
      </div>,
      document.body
    );
  }

  // Non-pinned mode: popup with backdrop
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 99998 }}
        onClick={onClose}
      />
      {/* Popup */}
      <div
        className="fixed bg-neutral-900 rounded-lg shadow-2xl border border-neutral-600 p-2 flex flex-col"
        style={{
          zIndex: 99999,
          width: popupWidth,
          left: position.x,
          top: position.showAbove ? undefined : position.y,
          bottom: position.showAbove ? window.innerHeight - position.y : undefined,
          transform: 'translateX(-50%)',
          maxHeight: '400px',
        }}
      >
        {header}
        {content}
      </div>
    </>,
    document.body
  );
}

interface HistoryItemProps {
  entry: AssetHistoryEntry;
  onSelect: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}

function HistoryItem({ entry, onSelect, onTogglePin, onRemove }: HistoryItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative w-16 h-16 rounded-md overflow-hidden cursor-pointer group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <HistoryThumbnail url={entry.thumbnailUrl} alt={`Asset ${entry.assetId}`} />

      {/* Pinned indicator (always visible when pinned) */}
      {entry.pinned && !isHovered && (
        <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center">
          <Pin size={8} className="text-white" />
        </div>
      )}

      {/* Video indicator */}
      {entry.mediaType === 'video' && (
        <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center">
          <Play size={8} className="text-white" />
        </div>
      )}

      {/* Hover overlay with actions */}
      {isHovered && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-1">
          {/* Pin/unpin button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              entry.pinned
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-neutral-700 hover:bg-neutral-600'
            }`}
            title={entry.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={10} className="text-white" />
          </button>

          {/* Remove button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="w-6 h-6 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center transition-colors"
            title="Remove from history"
          >
            <X size={10} className="text-white" />
          </button>
        </div>
      )}

      {/* Use count badge */}
      {entry.useCount > 1 && !isHovered && (
        <div className="absolute bottom-0.5 left-0.5 bg-black/80 text-white text-[9px] px-1 rounded font-medium">
          {entry.useCount}x
        </div>
      )}
    </div>
  );
}

// --- End History Popup Components ---

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
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
  const [historyPopupPosition, setHistoryPopupPosition] = useState<HistoryPopupPosition | null>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsPopoverRef = useRef<HTMLDivElement>(null);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);

  // Pinned panel state with localStorage persistence
  const [isHistoryPinned, setIsHistoryPinned] = useState(() => {
    try {
      return localStorage.getItem('quickgen-history-pinned') === 'true';
    } catch {
      return false;
    }
  });
  const [pinnedPosition, setPinnedPosition] = useState(() => {
    try {
      const stored = localStorage.getItem('quickgen-history-position');
      return stored ? JSON.parse(stored) : { x: 100, y: 100 };
    } catch {
      return { x: 100, y: 100 };
    }
  });
  const [pinnedSize, setPinnedSize] = useState(() => {
    try {
      const stored = localStorage.getItem('quickgen-history-size');
      return stored ? JSON.parse(stored) : { width: 320, height: 280 };
    } catch {
      return { width: 320, height: 280 };
    }
  });

  // Persist pinned state changes
  const handleTogglePinned = useCallback(() => {
    setIsHistoryPinned(prev => {
      const next = !prev;
      try {
        localStorage.setItem('quickgen-history-pinned', String(next));
      } catch {
        // Ignore storage errors (private mode, quota exceeded, etc.)
      }
      return next;
    });
  }, []);

  const handlePinnedPositionChange = useCallback((pos: { x: number; y: number }) => {
    setPinnedPosition(pos);
    try {
      localStorage.setItem('quickgen-history-position', JSON.stringify(pos));
    } catch {
      // Ignore storage errors (private mode, quota exceeded, etc.)
    }
  }, []);

  const handlePinnedSizeChange = useCallback((size: { width: number; height: number }) => {
    setPinnedSize(size);
    try {
      localStorage.setItem('quickgen-history-size', JSON.stringify(size));
    } catch {
      // Ignore storage errors (private mode, quota exceeded, etc.)
    }
  }, []);

  const {
    removeInput: ctxRemoveInput,
    updateLockedTimestamp: ctxUpdateLockedTimestamp,
  } = ctx || {};

  const operationType = ctx?.operationType ?? controller.operationType;
  const isFlexibleOperation = ctx?.isFlexibleOperation ?? FLEXIBLE_OPERATIONS.has(operationType);
  const removeInput = ctxRemoveInput ?? controller.removeInput;
  const storeUpdateLockedTimestamp = useInputStore(s => s.updateLockedTimestamp);
  const updateLockedTimestamp = ctxUpdateLockedTimestamp ?? storeUpdateLockedTimestamp;
  const storeInputs = useInputStore(s => s.inputsByOperation[operationType]?.items ?? EMPTY_INPUTS);
  const storeInputIndex = useInputStore(s => s.inputsByOperation[operationType]?.currentIndex ?? 1);
  const storeSetInputIndex = useInputStore(s => s.setInputIndex);
  const storeCycleInputs = useInputStore(s => s.cycleInputs);
  const storeAddInput = useInputStore(s => s.addInput);

  // History store subscriptions
  // History store subscriptions - use shallow compare for stable reference
  const historyByOperation = useGenerationHistoryStore(s => s.historyByOperation);
  const historyEntries = historyByOperation[operationType];
  const togglePin = useGenerationHistoryStore(s => s.togglePin);
  const removeFromHistory = useGenerationHistoryStore(s => s.removeFromHistory);

  // Sort history: pinned first (by useCount), then unpinned (by lastUsedAt)
  const sortedHistory = useMemo(() => {
    if (!historyEntries || historyEntries.length === 0) return [];
    const pinned = historyEntries.filter((e) => e.pinned);
    const unpinned = historyEntries.filter((e) => !e.pinned);
    pinned.sort((a, b) => b.useCount - a.useCount);
    unpinned.sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
    return [...pinned, ...unpinned];
  }, [historyEntries]);

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

  const operationMeta = OPERATION_METADATA[operationType];

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
        const maxCount = isMultiAsset ? Math.max(refs.length, 1) : 1;
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

  // History popup toggle handler
  const handleToggleHistory = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showHistoryPopup) {
      setShowHistoryPopup(false);
      setHistoryPopupPosition(null);
    } else {
      if (historyTriggerRef.current) {
        const rect = historyTriggerRef.current.getBoundingClientRect();
        const popupWidth = 320;
        const popupHeight = 300;

        // Calculate x position (centered on trigger, clamped to screen edges)
        let x = rect.left + rect.width / 2;
        const minX = popupWidth / 2 + 8;
        const maxX = window.innerWidth - popupWidth / 2 - 8;
        x = Math.max(minX, Math.min(maxX, x));

        // Check if there's room below, otherwise show above
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const showAbove = spaceBelow < popupHeight + 8 && spaceAbove > spaceBelow;

        const y = showAbove ? rect.top - 8 : rect.bottom + 8;

        setHistoryPopupPosition({ x, y, showAbove });
      }
      setShowHistoryPopup(true);
    }
  }, [showHistoryPopup]);

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

  // Handle selecting an asset from history
  const handleSelectFromHistory = useCallback((entry: AssetHistoryEntry) => {
    // Create a minimal asset model from the history entry
    const assetFromHistory = {
      id: entry.assetId,
      thumbnailUrl: entry.thumbnailUrl,
      mediaType: entry.mediaType,
    } as any; // Cast to any since we only have partial asset data

    storeAddInput({ asset: assetFromHistory, operationType });

    // Only close if not pinned
    if (!isHistoryPinned) {
      setShowHistoryPopup(false);
      setHistoryPopupPosition(null);
    }
  }, [storeAddInput, operationType, isHistoryPinned]);

  // History button component (inline in header bar)
  const hasHistory = sortedHistory.length > 0;
  const hasPinnedAssets = sortedHistory.some(e => e.pinned);
  const historyButton = (
    <button
      ref={historyTriggerRef}
      onClick={handleToggleHistory}
      className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
        isHistoryPinned
          ? 'bg-purple-600 hover:bg-purple-700 text-white'
          : hasHistory
          ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
      }`}
      title={isHistoryPinned ? 'History panel (pinned)' : hasHistory ? `History (${sortedHistory.length})` : 'No history yet'}
    >
      <ThemedIcon name={isHistoryPinned ? 'pin' : 'clock'} size={10} variant="default" />
      <span>{hasHistory ? sortedHistory.length : 0}</span>
      {hasPinnedAssets && !isHistoryPinned && (
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

  // Header bar with history button
  const headerBar = (
    <div className="relative flex items-center justify-end gap-1 px-2 py-1 shrink-0">
      {historyButton}
      {settingsButton}
      {settingsPopover}
    </div>
  );

  // History popup component (reused)
  const historyPopup = showHistoryPopup && historyPopupPosition && (
    <HistoryPopup
      history={sortedHistory}
      position={historyPopupPosition}
      onClose={() => {
        setShowHistoryPopup(false);
        setHistoryPopupPosition(null);
      }}
      onSelectAsset={handleSelectFromHistory}
      onTogglePin={(assetId) => togglePin(operationType, assetId)}
      onRemove={(assetId) => removeFromHistory(operationType, assetId)}
      isPinned={isHistoryPinned}
      onTogglePinned={handleTogglePinned}
      pinnedPosition={pinnedPosition}
      pinnedSize={pinnedSize}
      onPinnedPositionChange={handlePinnedPositionChange}
      onPinnedSizeChange={handlePinnedSizeChange}
    />
  );

  if (!hasAsset) {
    return (
      <div className="h-full flex flex-col">
        {headerBar}
        {historyPopup}
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

  const selectedInputIndex = Math.max(0, Math.min(operationInputIndex - 1, operationInputs.length - 1));
  const isGridMode = resolvedDisplayMode === 'grid';

  // Multi-asset display (strip/grid). Carousel uses the single-asset path below.
  if (isMultiAssetDisplay && resolvedDisplayMode !== 'carousel') {
    return (
      <div className="h-full w-full flex flex-col">
        {headerBar}
        {historyPopup}
        <div
          ref={containerRef}
          className={`flex-1 p-2 pt-0 ${isGridMode ? 'overflow-auto' : 'overflow-x-auto'}`}
        >
          <div
            className={isGridMode ? 'grid gap-1.5' : 'flex gap-1.5 h-full'}
            style={isGridMode ? { gridTemplateColumns: `repeat(${resolvedGridColumns}, minmax(0, 1fr))` } : undefined}
          >
            {operationInputs.map((inputItem, idx) => {
              const isSelected = idx === selectedInputIndex;
              const wrapperClasses = isGridMode
                ? 'relative aspect-square'
                : 'relative flex-shrink-0 h-full aspect-square';

              return (
                <div
                  key={inputItem.id ?? idx}
                  className={wrapperClasses}
                  onClick={() => setOperationInputIndex?.(idx + 1)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOperationInputIndex?.(idx + 1);
                    }
                  }}
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
                    className={isSelected ? 'ring-2 ring-blue-500' : ''}
                  />
                  <div className="absolute top-1 left-1 bg-purple-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                    {idx + 1}
                  </div>
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
  const currentInputIdx = Math.max(0, Math.min(operationInputIndex - 1, operationInputs.length - 1));
  const currentInput = operationInputs[currentInputIdx];
  const currentInputId = currentInput?.id;

  // Build queue items for grid popup - use index as part of key to ensure uniqueness
  const queueItems = operationInputs.flatMap((item, idx) => {
    if (!item?.asset) return [];
    const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(item.asset);
    const thumbUrl = thumbnailUrl ?? previewUrl ?? mainUrl ?? '';
    return [{
      id: `${item.asset.id}-${idx}`,
      thumbnailUrl: thumbUrl,
    }];
  });

  const currentAsset = currentInput?.asset ?? displayAssets[0];

  return (
    <div className="h-full w-full flex flex-col">
      {headerBar}
      {historyPopup}
      <div ref={containerRef} className="flex-1 p-2 pt-0">
        <CompactAssetCard
          asset={currentAsset}
          showRemoveButton={operationInputs.length > 0}
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
          totalCount={operationInputs.length}
          onNavigatePrev={() => cycleInputs?.(operationType, 'prev')}
          onNavigateNext={() => cycleInputs?.(operationType, 'next')}
          queueItems={queueItems}
          onSelectIndex={(idx) => setOperationInputIndex?.(idx + 1)} // Convert 0-based to 1-based
          enableHoverPreview={enableHoverPreview}
          showPlayOverlay={showPlayOverlay}
          clickToPlay={clickToPlay}
        />
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
