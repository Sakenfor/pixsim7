
import { ActionHintBadge, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon, ThemedIcon } from '@lib/icons';

import { getAsset, fromAssetResponse, getAssetDisplayUrls, useAssetViewerStore } from '@features/assets';
import type { AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared';
import { GenerationScopeProvider, useGenerationScopeStores } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { useOperationSpec, useProviderIdForModel } from '@features/providers';

import { SlotPickerGrid, resolveMaxSlotsFromSpecs, resolveMaxSlotsForModel } from '@/components/media/SlotPicker';
import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA, OPERATION_TYPES, isMultiAssetOperation } from '@/types/operations';

import { useGenerationHistoryStore, type AssetHistoryEntry } from '../stores/generationHistoryStore';

export interface QuickGenHistoryPanelProps {
  operationType?: OperationType;
  generationScopeId?: string;
  sourceLabel?: string;
  context?: {
    operationType?: OperationType;
    generationScopeId?: string;
    sourceLabel?: string;
  };
}

/**
 * Build a minimal AssetModel from an AssetHistoryEntry for display purposes.
 * The full asset is only fetched when the user clicks (in handleSelectFromHistory).
 */
function assetFromHistoryEntry(entry: AssetHistoryEntry): AssetModel {
  return {
    id: entry.assetId,
    createdAt: entry.lastUsedAt,
    mediaType: entry.mediaType,
    thumbnailUrl: entry.thumbnailUrl || null,
    previewUrl: null,
    remoteUrl: null,
    providerAssetId: '',
    providerId: '',
    providerStatus: null,
    syncStatus: 'remote',
    isArchived: false,
    userId: 0,
    description: null,
    durationSec: null,
    height: null,
    width: null,
  };
}

interface HistoryItemProps {
  entry: AssetHistoryEntry;
  isLoading: boolean;
  operationType: OperationType;
  onSelect: () => void;
  onSelectSlot: (asset: AssetModel, slotIndex: number) => void;
  onTogglePin: () => void;
  onRemove: () => void;
  inputScopeId?: string;
  maxSlots?: number;
  isReplaceMode?: boolean;
}

function HistoryItem({
  entry,
  isLoading,
  operationType,
  onSelect,
  onSelectSlot,
  onTogglePin,
  onRemove,
  inputScopeId,
  maxSlots,
  isReplaceMode,
}: HistoryItemProps) {
  const asset = useMemo(() => assetFromHistoryEntry(entry), [entry]);
  const showSlotPicker = isMultiAssetOperation(operationType);
  const zapRef = useRef<HTMLButtonElement | null>(null);
  const { isExpanded: slotPickerExpanded, handlers: slotPickerHandlers } = useHoverExpand({
    expandDelay: 150,
    collapseDelay: 150,
  });

  // Stabilize handlers to prevent unnecessary re-renders
  const stableHandlers = useMemo(
    () => slotPickerHandlers,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotPickerHandlers.onMouseEnter, slotPickerHandlers.onMouseLeave],
  );

  // Compute portal position - use state to trigger re-render when position changes
  const [slotPickerPos, setSlotPickerPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (slotPickerExpanded && zapRef.current) {
      const rect = zapRef.current.getBoundingClientRect();
      setSlotPickerPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    } else {
      setSlotPickerPos(null);
    }
  }, [slotPickerExpanded]);

  const overlay = useMemo(
    () => (
      <>
        {/* Pin badge - top left */}
        {entry.pinned && (
          <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center pointer-events-none">
            <Icon name="pin" size={10} className="text-white" color="#fff" />
          </div>
        )}

        {/* Use count - top right */}
        {entry.useCount > 1 && (
          <div className="absolute top-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium pointer-events-none">
            {entry.useCount}x
          </div>
        )}

        {/* Video indicator - bottom right */}
        {entry.mediaType === 'video' && (
          <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center pointer-events-none">
            <ThemedIcon name="play" size={10} variant="default" className="text-white" />
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white pointer-events-none">
            Loading...
          </div>
        )}
      </>
    ),
    [entry.pinned, entry.useCount, entry.mediaType, isLoading],
  );

  const hoverActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {/* Pin toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors text-white ${
            entry.pinned
              ? 'bg-purple-600 hover:bg-purple-700'
              : 'bg-neutral-700 hover:bg-neutral-600'
          }`}
          title={entry.pinned ? 'Unpin' : 'Pin'}
          type="button"
        >
          <Icon name="pin" size={12} className="text-white" color="#fff" />
        </button>

        {/* Zap button — always shown; hover triggers slot picker for multi-asset ops */}
        <div {...(showSlotPicker ? stableHandlers : {})}>
          <button
            ref={zapRef}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="relative w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-colors text-white"
            title={isReplaceMode ? 'Replace current input' : showSlotPicker ? 'Add to input (hover for slot picker)' : 'Add to input'}
            type="button"
          >
            <Icon name="zap" size={12} className="text-white" color="#fff" />
            {isReplaceMode && (
              <ActionHintBadge icon={<Icon name="refresh-cw" size={7} color="#fff" />} />
            )}
          </button>
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-7 h-7 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center transition-colors text-white"
          title="Remove from history"
          type="button"
        >
          <Icon name="close" size={12} className="text-white" color="#fff" />
        </button>
      </div>
    ),
    [entry.pinned, showSlotPicker, stableHandlers, onTogglePin, onSelect, onRemove, isReplaceMode],
  );

  return (
    <>
      <CompactAssetCard
        asset={asset}
        hideFooter
        className={isLoading ? 'opacity-60 pointer-events-none' : ''}
        onClick={onSelect}
        enableHoverPreview={entry.mediaType === 'video'}
        showPlayOverlay={false}
        overlay={overlay}
        hoverActions={hoverActions}
      />

      {/* Slot picker grid - portal to body to escape overflow-hidden */}
      {showSlotPicker && slotPickerExpanded && slotPickerPos && createPortal(
        <div
          className="fixed pb-4"
          style={{
            zIndex: 99999,
            left: slotPickerPos.x,
            bottom: window.innerHeight - slotPickerPos.y,
            transform: 'translateX(-50%)',
          }}
          {...stableHandlers}
        >
          <SlotPickerGrid
            asset={asset}
            operationType={operationType}
            onSelectSlot={onSelectSlot}
            maxSlots={maxSlots}
            inputScopeId={inputScopeId}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

function QuickGenHistoryPanelContent(props: QuickGenHistoryPanelProps) {
  const controller = useQuickGenerateController();
  // Prefer the live controller operationType (reactive via scoped session store)
  // so the panel tracks operation changes in quick gen automatically.
  const operationType =
    controller.operationType ?? props.operationType ?? props.context?.operationType;
  const sourceLabel = props.sourceLabel ?? props.context?.sourceLabel ?? 'History';
  const [historyOperation, setHistoryOperation] = useState<OperationType>(operationType);
  const { useInputStore, useSessionStore, useSettingsStore, id: scopeId } = useGenerationScopeStores();
  const addInput = useInputStore((s) => s.addInput);
  const isReplaceMode = useInputStore((s) => s.inputModeByOperation?.[operationType] === 'replace');

  // Resolve max slots for slot picker
  const activeModel = useSettingsStore((s) => s.params?.model as string | undefined);
  const scopedProviderId = useSessionStore((s) => s.providerId);
  const inferredProviderId = useProviderIdForModel(activeModel);
  const effectiveProviderId = scopedProviderId ?? inferredProviderId;
  const operationSpec = useOperationSpec(effectiveProviderId, operationType);
  const maxSlots = useMemo(() => {
    const fromSpecs = resolveMaxSlotsFromSpecs(operationSpec?.parameters, operationType, activeModel);
    return fromSpecs ?? resolveMaxSlotsForModel(operationType, activeModel);
  }, [operationSpec?.parameters, operationType, activeModel]);

  const historyMode = useGenerationHistoryStore((s) => s.historyMode);
  const historySortMode = useGenerationHistoryStore((s) => s.historySortMode);
  const hideIncompatibleAssets = useGenerationHistoryStore((s) => s.hideIncompatibleAssets);
  const historyByOperation = useGenerationHistoryStore((s) => s.historyByOperation);
  const togglePin = useGenerationHistoryStore((s) => s.togglePin);
  const removeFromHistory = useGenerationHistoryStore((s) => s.removeFromHistory);
  const clearHistory = useGenerationHistoryStore((s) => s.clearHistory);

  const [loadingIds, setLoadingIds] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const historyKey = historyMode === 'global' ? '_global' : historyOperation;
  const historyEntries = historyByOperation[historyKey] ?? [];

  useEffect(() => {
    setHistoryOperation(operationType);
  }, [operationType]);

  const historyOperationLabels: Record<OperationType, string> = useMemo(
    () => ({
      text_to_image: 'Text to Image',
      text_to_video: 'Text to Video',
      image_to_video: 'Image to Video',
      image_to_image: 'Image to Image',
      video_extend: 'Video Extend',
      video_transition: 'Video Transition',
      fusion: 'Fusion',
    }),
    [],
  );

  const operationOptions = useMemo(
    () =>
      OPERATION_TYPES.map((op) => ({
        value: op,
        label: historyOperationLabels[op] ?? OPERATION_METADATA[op]?.label ?? op,
      })),
    [historyOperationLabels],
  );

  const sortedHistory = useMemo(() => {
    if (historyEntries.length === 0) return [];
    if (historySortMode === 'recent-first') {
      return [...historyEntries].sort(
        (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
      );
    }
    const pinned = historyEntries.filter((e) => e.pinned);
    const unpinned = historyEntries.filter((e) => !e.pinned);
    pinned.sort((a, b) => b.useCount - a.useCount);
    unpinned.sort(
      (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
    );
    return [...pinned, ...unpinned];
  }, [historyEntries, historySortMode]);

  const acceptsInput = OPERATION_METADATA[operationType]?.acceptsInput ?? [];
  const canAcceptAssets = acceptsInput.length > 0;

  const visibleHistory = useMemo(() => {
    if (!hideIncompatibleAssets || acceptsInput.length === 0) {
      return sortedHistory;
    }
    return sortedHistory.filter((entry) => acceptsInput.includes(entry.mediaType));
  }, [sortedHistory, hideIncompatibleAssets, acceptsInput]);

  const pinnedEntries = useMemo(
    () =>
      historySortMode === 'pinned-first'
        ? visibleHistory.filter((entry) => entry.pinned)
        : [],
    [visibleHistory, historySortMode],
  );
  const recentEntries = useMemo(
    () =>
      historySortMode === 'pinned-first'
        ? visibleHistory.filter((entry) => !entry.pinned)
        : visibleHistory,
    [visibleHistory, historySortMode],
  );

  const openViewer = useAssetViewerStore((s) => s.openViewer);

  const handleSelectFromHistory = useCallback(
    async (entry: AssetHistoryEntry) => {
      if (loadingIds[entry.assetId]) return;

      setLoadingIds((prev) => ({ ...prev, [entry.assetId]: true }));
      setError(null);

      try {
        const response = await getAsset(entry.assetId);
        const asset = fromAssetResponse(response);
        const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(asset);

        // If operation accepts this asset type, add as input; otherwise open in viewer
        if (canAcceptAssets && acceptsInput.includes(entry.mediaType)) {
          addInput({ asset, operationType });
        } else {
          openViewer({
            id: asset.id,
            name: asset.name || `Asset ${asset.id}`,
            type: asset.mediaType === 'video' ? 'video' : 'image',
            url: thumbnailUrl || previewUrl || mainUrl || '',
            fullUrl: mainUrl,
            source: 'gallery',
          });
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load asset');
      } finally {
        setLoadingIds((prev) => {
          const next = { ...prev };
          delete next[entry.assetId];
          return next;
        });
      }
    },
    [addInput, operationType, loadingIds, canAcceptAssets, acceptsInput, openViewer],
  );

  const handleSelectSlot = useCallback(
    async (minimalAsset: AssetModel, slotIndex: number) => {
      const assetId = minimalAsset.id;
      if (loadingIds[assetId]) return;

      setLoadingIds((prev) => ({ ...prev, [assetId]: true }));
      setError(null);

      try {
        const response = await getAsset(assetId);
        const asset = fromAssetResponse(response);
        addInput({ asset, operationType, slotIndex });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load asset');
      } finally {
        setLoadingIds((prev) => {
          const next = { ...prev };
          delete next[assetId];
          return next;
        });
      }
    },
    [addInput, operationType, loadingIds],
  );

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          {sourceLabel}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
          <select
            value={historyOperation}
            onChange={(e) => setHistoryOperation(e.target.value as OperationType)}
            className="px-2 py-1 text-[10px] rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
            title="Choose history mode"
          >
            {operationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {historyMode === 'global' && (
            <span className="px-1.5 py-0.5 text-[9px] rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200">
              Global
            </span>
          )}
          {visibleHistory.length > 0 && (
            <button
              type="button"
              onClick={() => clearHistory(historyOperation)}
              className="text-[10px] text-neutral-500 hover:text-red-500 transition-colors"
              title="Clear recent history (keeps pinned)"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-3 py-1 text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {visibleHistory.length === 0 && (
          <div className="text-xs text-neutral-500 italic text-center py-4">
            {sortedHistory.length > 0 && hideIncompatibleAssets
              ? 'No compatible assets for this operation.'
              : 'No history yet. Generated outputs will appear here.'}
          </div>
        )}

        {visibleHistory.length > 0 && (
          <div className="space-y-4">
            {pinnedEntries.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400 mb-1.5">
                  <Icon name="pin" size={10} />
                  <span>Pinned</span>
                </div>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
                >
                  {pinnedEntries.map((entry) => (
                    <HistoryItem
                      key={`pinned-${entry.assetId}`}
                      entry={entry}
                      isLoading={!!loadingIds[entry.assetId]}
                      operationType={operationType}
                      onSelect={() => handleSelectFromHistory(entry)}
                      onSelectSlot={handleSelectSlot}
                      onTogglePin={() => togglePin(historyOperation, entry.assetId)}
                      onRemove={() => removeFromHistory(historyOperation, entry.assetId)}
                      inputScopeId={scopeId}
                      maxSlots={maxSlots}
                      isReplaceMode={isReplaceMode}
                    />
                  ))}
                </div>
              </div>
            )}

            {recentEntries.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400 mb-1.5">
                  <Icon name="clock" size={10} />
                  <span>{historySortMode === 'pinned-first' ? 'Recent' : 'History'}</span>
                </div>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
                >
                  {recentEntries.map((entry) => (
                    <HistoryItem
                      key={`recent-${entry.assetId}`}
                      entry={entry}
                      isLoading={!!loadingIds[entry.assetId]}
                      operationType={operationType}
                      onSelect={() => handleSelectFromHistory(entry)}
                      onSelectSlot={handleSelectSlot}
                      onTogglePin={() => togglePin(historyOperation, entry.assetId)}
                      onRemove={() => removeFromHistory(historyOperation, entry.assetId)}
                      inputScopeId={scopeId}
                      maxSlots={maxSlots}
                      isReplaceMode={isReplaceMode}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuickGenHistoryPanel(props: QuickGenHistoryPanelProps) {
  const scopeId =
    props.generationScopeId ?? props.context?.generationScopeId ?? undefined;

  if (!scopeId) {
    return <QuickGenHistoryPanelContent {...props} />;
  }

  return (
    <GenerationScopeProvider scopeId={scopeId} label="Generation Settings">
      <QuickGenHistoryPanelContent {...props} />
    </GenerationScopeProvider>
  );
}
