import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getAsset } from '@lib/api/assets';
import { Icon, IconBadge } from '@lib/icons';
import { IconButton } from '@pixsim7/shared.ui';

import type { AssetModel } from '@features/assets';
import { fromAssetResponse } from '@features/assets';
import { MiniGallery } from '@features/gallery/components/MiniGallery';
import { useQuickGenerateController } from '@features/prompts';

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
  const response = await getAsset(asset.id);
  return fromAssetResponse(response);
}

// ---------------------------------------------------------------------------
// Overlay — pin badge + use count
// ---------------------------------------------------------------------------

function HistoryItemOverlay({ entry }: { entry: AssetHistoryEntry }) {
  return (
    <>
      {entry.pinned && (
        <IconBadge name="pin" size={10} bg="#9333EA" className="absolute top-1 left-1 w-5 h-5 pointer-events-none" />
      )}
      {entry.useCount > 1 && (
        <div className="absolute top-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium pointer-events-none">
          {entry.useCount}x
        </div>
      )}
    </>
  );
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

  // Convert to AssetModel[]
  const items = useMemo(
    () => visibleHistory.map(assetFromHistoryEntry),
    [visibleHistory],
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

  // Card overlay — pin badge + use count
  const renderItemOverlay = useCallback(
    (asset: AssetModel): ReactNode => {
      const entry = entryByAssetId.get(asset.id);
      if (!entry) return null;
      return <HistoryItemOverlay entry={entry} />;
    },
    [entryByAssetId],
  );

  // Card hover actions — pin toggle + default zap/viewer + remove
  const renderItemActions = useCallback(
    (asset: AssetModel, defaultActions: ReactNode): ReactNode => {
      const entry = entryByAssetId.get(asset.id);
      return (
        <>
          {/* Pin toggle */}
          {entry && (
            <IconButton
              size="lg"
              rounded="full"
              icon={<Icon name="pin" size={12} />}
              onClick={(e) => {
                e.stopPropagation();
                togglePin(historyOperation, asset.id);
              }}
              className={entry.pinned
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-neutral-700 hover:bg-neutral-600'
              }
              style={{ color: '#fff' }}
              title={entry.pinned ? 'Unpin' : 'Pin'}
            />
          )}

          {/* Default zap + viewer */}
          {defaultActions}

          {/* Remove */}
          <IconButton
            size="lg"
            rounded="full"
            icon={<Icon name="close" size={12} />}
            onClick={(e) => {
              e.stopPropagation();
              removeFromHistory(historyOperation, asset.id);
            }}
            className="bg-red-600/80 hover:bg-red-600"
            style={{ color: '#fff' }}
            title="Remove from history"
          />
        </>
      );
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
      resolveAsset={resolveHistoryAsset}
      renderItemOverlay={renderItemOverlay}
      renderItemActions={renderItemActions}
    />
  );
}
