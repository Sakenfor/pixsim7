import { useEffect, useMemo, useState } from 'react';

import type { AssetModel } from '@features/assets';
import { useLinkedCardAssetAdapter } from '@features/assets/lib/useLinkedCardAssetAdapter';
import { useQuickGenerateController } from '@features/prompts';

import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA } from '@/types/operations';

import {
  useGenerationHistoryStore,
  type AssetHistoryEntry,
  type HistoryMode,
} from '../stores/generationHistoryStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseHistoryGalleryItemsOptions {
  /** Initial operation type (from controller/context). */
  initialOperation: OperationType;
}

export interface UseHistoryGalleryItemsResult {
  /** Hydrated AssetModel[] ready for MiniGallery `items`. */
  items: AssetModel[];
  /** Lookup from asset id → history entry for widget builders. */
  entryByAssetId: Map<number, AssetHistoryEntry>;
  /** Currently selected operation for history viewing. */
  historyOperation: OperationType;
  setHistoryOperation: (op: OperationType) => void;
  /** Filtered + sorted history entries. */
  visibleHistory: AssetHistoryEntry[];
  /** Store actions forwarded for convenience. */
  clearHistory: (op: OperationType) => void;
  togglePin: (op: OperationType, assetId: number) => void;
  removeFromHistory: (op: OperationType, assetId: number) => void;
  historyMode: HistoryMode;
}

// ---------------------------------------------------------------------------
// Helpers (shared with QuickGenHistoryPanel)
// ---------------------------------------------------------------------------

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
// Hook
// ---------------------------------------------------------------------------

export function useHistoryGalleryItems({
  initialOperation,
}: UseHistoryGalleryItemsOptions): UseHistoryGalleryItemsResult {
  const controller = useQuickGenerateController();
  const operationType =
    controller.operationType ?? initialOperation;

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

  // Linked card asset adapter — hydrates stubs in background
  const { getMediaCardAsset } = useLinkedCardAssetAdapter<AssetHistoryEntry>({
    visibleItems: visibleHistory,
    getItemKey: (entry) => String(entry.assetId),
    getLinkedAssetId: (entry) => entry.assetId,
    toFallbackAsset: assetFromHistoryEntry,
    mergeLinkedWithSource: mergeHistoryLinkedAsset,
  });

  // Convert history entries into canonical assets
  const items = useMemo(
    () => visibleHistory.map((entry) => getMediaCardAsset(entry)),
    [visibleHistory, getMediaCardAsset],
  );

  return {
    items,
    entryByAssetId,
    historyOperation,
    setHistoryOperation,
    visibleHistory,
    clearHistory,
    togglePin,
    removeFromHistory,
    historyMode,
  };
}
