/**
 * QuickGeneratePanels - Minimal dockview panels for asset/prompt/settings
 *
 * Simple, lightweight panel components for use in QuickGenerateModule's SmartDockview instance.
 * Panels receive context via SmartDockview's injected props.
 */
import { resolveMediaTypes } from '@pixsim7/shared.assets.core';
import { Ref } from '@pixsim7/shared.ref.core';
import type { AssetRef } from '@pixsim7/shared.types';
import { PromptInput } from '@pixsim7/shared.ui';
import type { IDockviewPanelProps } from 'dockview-core';
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { useDockviewId } from '@lib/dockview';
import { ThemedIcon } from '@lib/icons';
import { PromptCompanionHost } from '@lib/ui';


import type { AssetModel } from '@features/assets';
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
import { useResolveComponentSettings, getInstanceId, useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId } from '@features/panels';
import { useQuickGenerateController } from '@features/prompts';

import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';
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
  const { src: authenticatedSrc } = useAuthenticatedMedia(url);
  const resolvedSrc = authenticatedSrc || url;
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
}

function HistoryPopup({
  history,
  position,
  onClose,
  onSelectAsset,
  onTogglePin,
  onRemove,
}: HistoryPopupProps) {
  const pinned = history.filter((e) => e.pinned);
  const recent = history.filter((e) => !e.pinned);

  // Grid layout: 4 columns max
  const cols = Math.min(4, Math.max(2, history.length));
  const popupWidth = cols * 72 + (cols - 1) * 6 + 20; // thumbnails + gaps + padding

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
        className="fixed bg-neutral-900 rounded-lg shadow-2xl border border-neutral-600 p-2 max-h-[400px] overflow-y-auto"
        style={{
          zIndex: 99999,
          width: popupWidth,
          left: position.x,
          top: position.showAbove ? undefined : position.y,
          bottom: position.showAbove ? window.innerHeight - position.y : undefined,
          transform: 'translateX(-50%)',
        }}
      >
        {/* Pinned section */}
        {pinned.length > 0 && (
          <>
            <div className="flex items-center gap-1 text-[10px] text-neutral-400 mb-1.5 px-1">
              <ThemedIcon name="pin" size={10} variant="default" />
              <span>Pinned</span>
            </div>
            <div
              className="grid gap-1.5 mb-2"
              style={{ gridTemplateColumns: `repeat(${cols}, 64px)` }}
            >
              {pinned.map((entry) => (
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
              <ThemedIcon name="clock" size={10} variant="default" />
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
          <ThemedIcon name="pin" size={8} variant="default" className="text-white" />
        </div>
      )}

      {/* Video indicator */}
      {entry.mediaType === 'video' && (
        <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center">
          <ThemedIcon name="play" size={8} variant="default" className="text-white" />
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
            <ThemedIcon name="pin" size={10} variant="default" className="text-white" />
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
            <ThemedIcon name="close" size={10} variant="default" className="text-white" />
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

  const { settings: resolvedAssetSettings } = useResolveComponentSettings<typeof QUICKGEN_ASSET_DEFAULTS>(
    QUICKGEN_ASSET_COMPONENT_ID,
    instanceId,
    "generation",
  );

  const {
    enableHoverPreview = QUICKGEN_ASSET_DEFAULTS.enableHoverPreview,
    showPlayOverlay = QUICKGEN_ASSET_DEFAULTS.showPlayOverlay,
    clickToPlay = QUICKGEN_ASSET_DEFAULTS.clickToPlay,
  } = resolvedAssetSettings ?? {};

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

  // Handle selecting an asset from history
  const handleSelectFromHistory = useCallback((entry: AssetHistoryEntry) => {
    // Create a minimal asset model from the history entry
    const assetFromHistory = {
      id: entry.assetId,
      thumbnailUrl: entry.thumbnailUrl,
      mediaType: entry.mediaType,
    } as any; // Cast to any since we only have partial asset data

    storeAddInput({ asset: assetFromHistory, operationType });
    setShowHistoryPopup(false);
    setHistoryPopupPosition(null);
  }, [storeAddInput, operationType]);

  // History button component (inline in header bar)
  const hasHistory = sortedHistory.length > 0;
  const historyButton = (
    <button
      ref={historyTriggerRef}
      onClick={handleToggleHistory}
      className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
        hasHistory
          ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
      }`}
      title={hasHistory ? `History (${sortedHistory.length})` : 'No history yet'}
    >
      <ThemedIcon name="clock" size={10} variant="default" />
      <span>{hasHistory ? sortedHistory.length : 0}</span>
      {sortedHistory.some(e => e.pinned) && (
        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
      )}
    </button>
  );

  // Header bar with history button
  const headerBar = (
    <div className="flex items-center justify-end px-2 py-1 shrink-0">
      {historyButton}
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

  // Multi-asset display: show all assets in horizontal strip
  if (isMultiAssetDisplay) {
    return (
      <div className="h-full w-full flex flex-col">
        {headerBar}
        {historyPopup}
        <div ref={containerRef} className="flex-1 p-2 pt-0 overflow-x-auto">
          <div className="flex gap-1.5 h-full">
          {operationInputs.map((inputItem, idx) => (
            <div key={idx} className="relative flex-shrink-0 h-full aspect-square">
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
              />
              <div className="absolute top-1 left-1 bg-purple-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                {idx + 1}
              </div>
            </div>
          ))}
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
    const thumbUrl = item.asset.thumbnailUrl ?? item.asset.remoteUrl ?? item.asset.fileUrl ?? '';
    return [{
      id: `${item.asset.id}-${idx}`,
      thumbnailUrl: thumbUrl,
    }];
  });

  return (
    <div className="h-full w-full flex flex-col">
      {headerBar}
      {historyPopup}
      <div ref={containerRef} className="flex-1 p-2 pt-0">
        <CompactAssetCard
          asset={displayAssets[0]}
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
    displayAssets = resolveDisplayAssets({
      operationType,
      inputs: controller.operationInputs,
      currentIndex: controller.operationInputIndex,
      lastSelectedAsset: controller.lastSelectedAsset,
      allowAnySelected,
    }),
    isFlexibleOperation: _isFlexibleOperation = FLEXIBLE_OPERATIONS.has(operationType),
    error = controller.error,
  } = ctx || {};
  void _isFlexibleOperation; // Used in PromptPanel for future capability hints

  const maxChars = resolvePromptLimitForModel(providerId, model, paramSpecs as any);
  const hasAsset = displayAssets.length > 0;

  useProvideCapability<PromptBoxContext>(
    CAP_PROMPT_BOX,
    {
      id: `quickgen-prompt:${panelInstanceId}`,
      label: 'Prompt Box',
      priority: 50,
      getValue: () => ({
        prompt,
        setPrompt,
        maxChars,
        providerId,
        operationType,
      }),
    },
    [prompt, setPrompt, maxChars, providerId, operationType, panelInstanceId],
    { scope: capabilityScope },
  );

  return (
    <div className="h-full w-full p-2 flex flex-col gap-2">
      <div
        className={`flex-1 ${error ? 'ring-2 ring-red-500 rounded-lg' : ''}`}
        style={{ transition: 'none', animation: 'none' }}
      >
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          maxChars={maxChars}
          disabled={generating}
          variant={resolvedPromptSettings.variant}
          showCounter={resolvedPromptSettings.showCounter}
          resizable={resolvedPromptSettings.resizable}
          minHeight={resolvedPromptSettings.minHeight}
          placeholder={
            operationType === 'image_to_video'
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
