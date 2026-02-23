import { useCallback, useEffect, useMemo, useState } from 'react';

import { createBadgeWidget, type OverlayWidget } from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import { hydrateAssetModel } from '@features/assets/lib/hydrateAssetModel';
import { useLinkedCardAssetAdapter } from '@features/assets/lib/useLinkedCardAssetAdapter';
import { MiniGallery } from '@features/gallery/components/MiniGallery';
import { useQuickGenerateController } from '@features/prompts';

import {
  COMPACT_TOP_RIGHT_BADGE_OFFSET,
  TOP_RIGHT_BADGE_STACK_GROUP,
} from '@/components/media/assetCardLocalWidgets';
import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA, OPERATION_TYPES } from '@/types/operations';

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

/** Build a minimal AssetModel from a history entry for display. */
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

/** Resolve a minimal history AssetModel to a full one by fetching from API. */
async function resolveHistoryAsset(asset: AssetModel): Promise<AssetModel> {
  return hydrateAssetModel(asset);
}

function mergeHistoryLinkedAsset(
  _entry: AssetHistoryEntry,
  linkedAsset: AssetModel,
  fallbackAsset: AssetModel,
): AssetModel {
  return {
    ...linkedAsset,
    thumbnailUrl: linkedAsset.thumbnailUrl ?? fallbackAsset.thumbnailUrl,
    previewUrl: linkedAsset.previewUrl ?? fallbackAsset.previewUrl,
    remoteUrl: linkedAsset.remoteUrl ?? fallbackAsset.remoteUrl,
  };
}

// ---------------------------------------------------------------------------
// Use count badge (bottom-left) — overlay widget
// ---------------------------------------------------------------------------

function buildUseCountWidget(entry: AssetHistoryEntry): OverlayWidget | null {
  if (entry.useCount <= 1) return null;
  return createBadgeWidget({
    id: 'use-count',
    position: { anchor: 'bottom-left', offset: { x: 4, y: -4 } },
    visibility: { trigger: 'always', transition: 'none' },
    variant: 'text',
    labelBinding: { id: 'label', resolve: () => `${entry.useCount}x` },
    color: 'gray',
    className: '!bg-black/80 !text-white text-[10px] font-medium',
    priority: 5,
  });
}

// ---------------------------------------------------------------------------
// QuickGenHistoryPanel
// ---------------------------------------------------------------------------

export function QuickGenHistoryPanel(props: QuickGenHistoryPanelProps) {
  const controller = useQuickGenerateController();
  const operationType =
    controller.operationType ?? props.operationType ?? props.context?.operationType;

  const [historyOperation, setHistoryOperation] = useState<OperationType>(operationType);

  useEffect(() => {
    setHistoryOperation(operationType);
  }, [operationType]);

  // History store
  const historyMode = useGenerationHistoryStore((s) => s.historyMode);
  const historySortMode = useGenerationHistoryStore((s) => s.historySortMode);
  const hideIncompatibleAssets = useGenerationHistoryStore((s) => s.hideIncompatibleAssets);
  const historyByOperation = useGenerationHistoryStore((s) => s.historyByOperation);
  const togglePin = useGenerationHistoryStore((s) => s.togglePin);
  const removeFromHistory = useGenerationHistoryStore((s) => s.removeFromHistory);
  const clearHistory = useGenerationHistoryStore((s) => s.clearHistory);

  const historyKey = historyMode === 'global' ? '_global' : historyOperation;
  const historyEntries = historyByOperation[historyKey] ?? [];

  // Sort entries
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

  // Filter incompatible assets
  const acceptsInput = OPERATION_METADATA[operationType]?.acceptsInput ?? [];
  const visibleHistory = useMemo(() => {
    if (!hideIncompatibleAssets || acceptsInput.length === 0) return sortedHistory;
    return sortedHistory.filter((entry) => acceptsInput.includes(entry.mediaType));
  }, [sortedHistory, hideIncompatibleAssets, acceptsInput]);

  // Build a lookup from assetId → entry for overlay/actions
  const entryByAssetId = useMemo(() => {
    const map = new Map<number, AssetHistoryEntry>();
    for (const e of visibleHistory) map.set(e.assetId, e);
    return map;
  }, [visibleHistory]);

  const { getMediaCardAsset } = useLinkedCardAssetAdapter<AssetHistoryEntry>({
    visibleItems: visibleHistory,
    getItemKey: (entry) => String(entry.assetId),
    getLinkedAssetId: (entry) => entry.assetId,
    toFallbackAsset: assetFromHistoryEntry,
    mergeLinkedWithSource: mergeHistoryLinkedAsset,
  });

  // Convert history entries into canonical assets when available.
  // Fallback to minimal stubs while hydration is in-flight.
  const items = useMemo(
    () => visibleHistory.map((entry) => getMediaCardAsset(entry)),
    [visibleHistory, getMediaCardAsset],
  );

  // Operation dropdown options
  const operationOptions = useMemo(
    () =>
      OPERATION_TYPES.map((op) => ({
        value: op,
        label: OPERATION_METADATA[op]?.label ?? op,
      })),
    [],
  );

  // Suppress hover actions — generation button group from overlay system handles generation
  const renderItemActions = useCallback(
    () => null,
    [],
  );

  // Card widgets — pin (top-left) + remove (top-right) + use count (bottom-left)
  const renderItemWidgets = useCallback(
    (asset: AssetModel): OverlayWidget[] | undefined => {
      const entry = entryByAssetId.get(asset.id);
      if (!entry) return undefined;

      const widgets: OverlayWidget[] = [
        createBadgeWidget({
          id: 'pin-toggle',
          position: { anchor: 'top-left', offset: { x: 4, y: 4 } },
          visibility: { trigger: entry.pinned ? 'always' : 'hover-container' },
          variant: 'icon',
          icon: 'pin',
          color: 'gray',
          shape: 'circle',
          tooltip: entry.pinned ? 'Unpin' : 'Pin',
          onClick: () => togglePin(historyOperation, asset.id),
          className: entry.pinned
            ? '!bg-purple-600 hover:!bg-purple-700 !text-white'
            : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-purple-500 backdrop-blur-sm',
          priority: 25,
        }),
        createBadgeWidget({
          id: 'remove-history',
          position: { anchor: 'top-right', offset: COMPACT_TOP_RIGHT_BADGE_OFFSET },
          stackGroup: TOP_RIGHT_BADGE_STACK_GROUP,
          visibility: { trigger: 'hover-container' },
          variant: 'icon',
          icon: 'x',
          color: 'red',
          shape: 'circle',
          tooltip: 'Remove from history',
          onClick: () => removeFromHistory(historyOperation, asset.id),
          className: '!bg-red-600/80 hover:!bg-red-600 !text-white',
          priority: 30,
        }),
      ];

      const useCountWidget = buildUseCountWidget(entry);
      if (useCountWidget) widgets.push(useCountWidget);

      return widgets;
    },
    [entryByAssetId, historyOperation, togglePin, removeFromHistory],
  );

  const sourceLabel = props.sourceLabel ?? props.context?.sourceLabel ?? 'History';

  // Custom header with operation dropdown + clear
  const header = useMemo(
    () => (
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          {sourceLabel}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
          <select
            value={historyOperation}
            onChange={(e) => setHistoryOperation(e.target.value as OperationType)}
            className="px-2 py-1 text-[10px] rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
            title="Choose operation type"
          >
            {operationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {historyMode === 'global' && (
            <span className="px-1.5 py-0.5 text-[9px] rounded bg-accent-subtle text-accent">
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
    ),
    [sourceLabel, historyOperation, operationOptions, historyMode, visibleHistory.length, clearHistory],
  );

  const emptyMessage = useMemo(() => {
    if (sortedHistory.length > 0 && hideIncompatibleAssets) {
      return 'No compatible assets for this operation.';
    }
    return 'No history yet. Generated outputs will appear here.';
  }, [sortedHistory.length, hideIncompatibleAssets]);

  return (
    <MiniGallery
      items={items}
      header={header}
      emptyMessage={emptyMessage}
      operationType={operationType}
      generationScopeId={props.generationScopeId ?? props.context?.generationScopeId}
      context={props.context}
      paginationMode="page"
      pageSize={20}
      resolveAsset={resolveHistoryAsset}
      renderItemActions={renderItemActions}
      renderItemWidgets={renderItemWidgets}
    />
  );
}
