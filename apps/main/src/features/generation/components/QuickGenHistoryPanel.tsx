import { useCallback, useEffect, useMemo, useState } from 'react';

import { Icon, ThemedIcon } from '@lib/icons';

import { getAsset, fromAssetResponse, useAsset, getAssetDisplayUrls } from '@features/assets';
import { GenerationScopeProvider, useGenerationScopeStores } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';
import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA, OPERATION_TYPES } from '@/types/operations';

import { useGenerationHistoryStore, type AssetHistoryEntry } from '../stores/generationHistoryStore';

export interface QuickGenHistoryPanelProps {
  operationType?: OperationType;
  generationScopeId?: string;
  context?: {
    operationType?: OperationType;
    generationScopeId?: string;
  };
}

interface HistoryItemProps {
  entry: AssetHistoryEntry;
  isCompatible: boolean;
  isLoading: boolean;
  autoPrefetchThumbnails: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}

function HistoryItem({
  entry,
  isCompatible,
  isLoading,
  autoPrefetchThumbnails,
  onSelect,
  onTogglePin,
  onRemove,
}: HistoryItemProps) {
  const [shouldFetchAsset, setShouldFetchAsset] = useState(
    autoPrefetchThumbnails && !entry.thumbnailUrl
  );
  const { asset, loading: assetLoading } = useAsset(shouldFetchAsset ? entry.assetId : null);
  const displayUrls = useMemo(
    () => (asset ? getAssetDisplayUrls(asset) : null),
    [asset],
  );
  const fallbackThumbUrl =
    displayUrls?.thumbnailUrl ?? displayUrls?.previewUrl ?? displayUrls?.mainUrl;
  const resolvedThumbUrl = entry.thumbnailUrl || fallbackThumbUrl;
  const { thumbSrc, thumbLoading, thumbFailed, thumbRetry } = useResolvedAssetMedia({
    thumbUrl: resolvedThumbUrl,
    previewUrl: displayUrls?.previewUrl,
    remoteUrl: displayUrls?.mainUrl,
    thumbOptions: { preferPreview: true },
  });
  const isThumbLoading = thumbLoading || assetLoading;
  const canSelect = isCompatible && !isLoading;

  useEffect(() => {
    if (!autoPrefetchThumbnails) return;
    if (!shouldFetchAsset && (thumbFailed || (!entry.thumbnailUrl && !resolvedThumbUrl))) {
      setShouldFetchAsset(true);
    }
  }, [autoPrefetchThumbnails, entry.thumbnailUrl, resolvedThumbUrl, shouldFetchAsset, thumbFailed]);

  useEffect(() => {
    if (autoPrefetchThumbnails && !entry.thumbnailUrl) {
      setShouldFetchAsset(true);
    }
  }, [autoPrefetchThumbnails, entry.thumbnailUrl]);

  return (
    <div
      className={`relative rounded-md overflow-hidden group border border-neutral-700/60 ${
        canSelect ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
      }`}
      onClick={() => {
        if (!canSelect) return;
        onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-disabled={!canSelect}
      onKeyDown={(e) => {
        if (!canSelect) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="relative w-full h-0 pb-[100%] bg-neutral-900">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={`Asset ${entry.assetId}`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] text-neutral-400 gap-1">
            <span>{isThumbLoading ? 'Loading...' : 'No preview'}</span>
            {thumbFailed && !isThumbLoading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  thumbRetry();
                }}
                className="text-[10px] text-neutral-300 hover:text-white transition-colors"
              >
                Retry
              </button>
            )}
            {!autoPrefetchThumbnails && !resolvedThumbUrl && !isThumbLoading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShouldFetchAsset(true);
                }}
                className="text-[10px] text-neutral-300 hover:text-white transition-colors"
              >
                Fetch
              </button>
            )}
          </div>
        )}

        {entry.pinned && (
          <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-white">
            <Icon name="pin" size={8} className="text-white" color="#fff" />
          </div>
        )}

        {entry.mediaType === 'video' && (
          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center">
            <ThemedIcon name="play" size={8} variant="default" className="text-white" />
          </div>
        )}

        {entry.useCount > 1 && (
          <div className="absolute bottom-0.5 left-0.5 bg-black/80 text-white text-[9px] px-1 rounded font-medium">
            {entry.useCount}x
          </div>
        )}

        {!isCompatible && (
          <div className="absolute inset-0 bg-neutral-900/70 flex items-center justify-center text-[10px] text-neutral-200 text-center px-1">
            Not compatible
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white">
            Loading...
          </div>
        )}

        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors text-white ${
              entry.pinned
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-neutral-700 hover:bg-neutral-600'
            }`}
            title={entry.pinned ? 'Unpin' : 'Pin'}
            type="button"
          >
            <Icon name="pin" size={10} className="text-white" color="#fff" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="w-6 h-6 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center transition-colors text-white"
            title="Remove from history"
            type="button"
          >
            <Icon name="close" size={10} className="text-white" color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickGenHistoryPanelContent(props: QuickGenHistoryPanelProps) {
  const controller = useQuickGenerateController();
  const operationType =
    props.operationType ?? props.context?.operationType ?? controller.operationType;
  const [historyOperation, setHistoryOperation] = useState<OperationType>(operationType);
  const { useInputStore } = useGenerationScopeStores();
  const addInput = useInputStore((s) => s.addInput);

  const historyMode = useGenerationHistoryStore((s) => s.historyMode);
  const historySortMode = useGenerationHistoryStore((s) => s.historySortMode);
  const hideIncompatibleAssets = useGenerationHistoryStore((s) => s.hideIncompatibleAssets);
  const autoPrefetchHistoryThumbnails = useGenerationHistoryStore(
    (s) => s.autoPrefetchHistoryThumbnails,
  );
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

  const handleSelectFromHistory = useCallback(
    async (entry: AssetHistoryEntry) => {
      if (loadingIds[entry.assetId]) return;
      if (!canAcceptAssets || !acceptsInput.includes(entry.mediaType)) return;

      setLoadingIds((prev) => ({ ...prev, [entry.assetId]: true }));
      setError(null);

      try {
        const response = await getAsset(entry.assetId);
        const asset = fromAssetResponse(response);
        addInput({ asset, operationType });
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
    [addInput, operationType, loadingIds, canAcceptAssets, acceptsInput],
  );

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          Asset History
        </div>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">History</span>
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
        {!canAcceptAssets && (
          <div className="text-xs text-neutral-500 italic text-center py-4">
            This operation does not accept asset inputs.
          </div>
        )}

        {canAcceptAssets && visibleHistory.length === 0 && (
          <div className="text-xs text-neutral-500 italic text-center py-4">
            {sortedHistory.length > 0 && hideIncompatibleAssets
              ? 'No compatible assets for this operation.'
              : 'No history yet.'}
          </div>
        )}

        {canAcceptAssets && visibleHistory.length > 0 && (
          <div className="space-y-4">
            {pinnedEntries.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400 mb-1.5">
                  <Icon name="pin" size={10} />
                  <span>Pinned</span>
                </div>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
                >
                  {pinnedEntries.map((entry) => (
                    <HistoryItem
                      key={`pinned-${entry.assetId}`}
                      entry={entry}
                      isCompatible={acceptsInput.includes(entry.mediaType)}
                      isLoading={!!loadingIds[entry.assetId]}
                      autoPrefetchThumbnails={autoPrefetchHistoryThumbnails}
                      onSelect={() => handleSelectFromHistory(entry)}
                      onTogglePin={() => togglePin(historyOperation, entry.assetId)}
                      onRemove={() => removeFromHistory(historyOperation, entry.assetId)}
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
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
                >
                  {recentEntries.map((entry) => (
                    <HistoryItem
                      key={`recent-${entry.assetId}`}
                      entry={entry}
                      isCompatible={acceptsInput.includes(entry.mediaType)}
                      isLoading={!!loadingIds[entry.assetId]}
                      autoPrefetchThumbnails={autoPrefetchHistoryThumbnails}
                      onSelect={() => handleSelectFromHistory(entry)}
                      onTogglePin={() => togglePin(historyOperation, entry.assetId)}
                      onRemove={() => removeFromHistory(historyOperation, entry.assetId)}
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
