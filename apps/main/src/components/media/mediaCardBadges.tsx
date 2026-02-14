/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Badge Widgets
 *
 * Status badge components and widgets for MediaCard overlay.
 * Split from mediaCardWidgets.tsx for better separation of concerns.
 */

import React from 'react';

import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';

import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useGenerationInputStore } from '@features/generation/stores/generationInputStore';

import { OPERATION_METADATA, OPERATION_TYPES } from '@/types/operations';

import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

/**
 * Badge showing when an asset is queued in generation inputs
 */
export function QueueStatusBadge({ assetId }: { assetId: number }) {
  const inputsByOperation = useGenerationInputStore((s) => s.inputsByOperation);
  const matchOperation = OPERATION_TYPES.find((operationType) =>
    inputsByOperation[operationType]?.items.some((item) => item.asset.id === assetId),
  );

  if (!matchOperation) return null;

  const metadata = OPERATION_METADATA[matchOperation];
  const label = metadata?.label || 'Queued';
  const icon = metadata?.icon || 'clock';

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500 text-white shadow-sm"
      title={`In inputs for ${label}`}
    >
      <Icon name={icon} className="w-3 h-3" />
      <span className="max-w-[60px] truncate">{label}</span>
    </div>
  );
}

/**
 * Badge showing when an asset is selected in the global selection
 */
export function SelectionStatusBadge({ assetId }: { assetId: number }) {
  const isSelected = useAssetSelectionStore((s) => s.isSelected(assetId));
  const selectionCount = useAssetSelectionStore((s) => s.selectedAssets.length);

  if (!isSelected) return null;

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-purple-500 text-white shadow-sm"
      title={`Selected (${selectionCount} total)`}
    >
      <Icon name="check" className="w-3 h-3" />
      {selectionCount > 1 && <span>{selectionCount}</span>}
    </div>
  );
}

/**
 * Create input status badge widget (top-right, below status)
 * Shows when asset is in the generation inputs with operation type indicator
 */
export function createQueueStatusWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id } = props;

  return {
    id: 'queue-status',
    type: 'custom',
    position: { anchor: 'top-right', offset: { x: -8, y: 32 } },
    visibility: { trigger: 'always' },
    priority: 15,
    render: () => {
      return <QueueStatusBadge assetId={id} />;
    },
  };
}

/**
 * Create selection status badge widget (bottom-left corner)
 * Shows when asset is part of the global selection
 */
export function createSelectionStatusWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id } = props;

  return {
    id: 'selection-status',
    type: 'custom',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
    visibility: { trigger: 'always' },
    priority: 12,
    render: () => {
      return <SelectionStatusBadge assetId={id} />;
    },
  };
}
