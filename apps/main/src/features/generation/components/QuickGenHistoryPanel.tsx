import { useCallback, useMemo } from 'react';

import {
  buildRemoveWidget,
  buildPinToggleWidget,
  buildCountBadgeWidget,
  type OverlayWidget,
} from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import { MiniGallery } from '@features/gallery/components/MiniGallery';

import type { OperationType } from '@/types/operations';
import { OPERATION_METADATA, OPERATION_TYPES } from '@/types/operations';

import { useHistoryGalleryItems } from '../hooks/useHistoryGalleryItems';
import { useGenerationHistoryStore } from '../stores/generationHistoryStore';

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

// ---------------------------------------------------------------------------
// QuickGenHistoryPanel
// ---------------------------------------------------------------------------

export function QuickGenHistoryPanel(props: QuickGenHistoryPanelProps) {
  const operationType =
    props.operationType ?? props.context?.operationType;

  const {
    items,
    entryByAssetId,
    historyOperation,
    setHistoryOperation,
    visibleHistory,
    clearHistory,
    togglePin,
    removeFromHistory,
    historyMode,
  } = useHistoryGalleryItems({
    initialOperation: operationType,
  });

  const hideIncompatibleAssets = useGenerationHistoryStore((s) => s.hideIncompatibleAssets);
  const sortedHistoryLen = useGenerationHistoryStore((s) => {
    const key = s.historyMode === 'global' ? '_global' : historyOperation;
    return (s.historyByOperation[key] ?? []).length;
  });

  // Card widgets — pin (top-left) + remove (top-right) + use count (bottom-left)
  const renderItemWidgets = useCallback(
    (asset: AssetModel): OverlayWidget[] | undefined => {
      const entry = entryByAssetId.get(asset.id);
      if (!entry) return undefined;

      const widgets: OverlayWidget[] = [
        buildPinToggleWidget(entry.pinned, () => togglePin(historyOperation, asset.id)),
        buildRemoveWidget(
          () => removeFromHistory(historyOperation, asset.id),
          { id: 'remove-history', tooltip: 'Remove from history' },
        ),
      ];

      const countWidget = buildCountBadgeWidget(entry.useCount);
      if (countWidget) widgets.push(countWidget);

      return widgets;
    },
    [entryByAssetId, historyOperation, togglePin, removeFromHistory],
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
    [sourceLabel, historyOperation, operationOptions, historyMode, visibleHistory.length, clearHistory, setHistoryOperation],
  );

  const emptyMessage = useMemo(() => {
    if (sortedHistoryLen > 0 && hideIncompatibleAssets) {
      return 'No compatible assets for this operation.';
    }
    return 'No history yet. Generated outputs will appear here.';
  }, [sortedHistoryLen, hideIncompatibleAssets]);

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
      suppressHoverActions
      renderItemWidgets={renderItemWidgets}
    />
  );
}
