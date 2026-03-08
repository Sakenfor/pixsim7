/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Badge Widgets
 *
 * Status badge components and widgets for MediaCard overlay.
 * Split from mediaCardWidgets.tsx for better separation of concerns.
 */

import React, { useEffect, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';

import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useGenerationInputStore } from '@features/generation/stores/generationInputStore';
import type { GenerationInputStoreHook } from '@features/generation/stores/generationInputStore';
import { getRegisteredInputStores } from '@features/generation/stores/generationScopeStores';

import { OPERATION_METADATA, OPERATION_TYPES, type OperationType } from '@/types/operations';

import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

/**
 * Collect all input stores: the global singleton + any scoped stores.
 */
function collectAllInputStores(): GenerationInputStoreHook[] {
  const scoped = getRegisteredInputStores();
  // Deduplicate: the global singleton may also appear in the scoped map
  if (scoped.includes(useGenerationInputStore as unknown as GenerationInputStoreHook)) {
    return scoped;
  }
  return [useGenerationInputStore as unknown as GenerationInputStoreHook, ...scoped];
}

/**
 * Find all operations across all input stores that contain the given asset.
 */
function findMatchingOperations(stores: GenerationInputStoreHook[], assetId: number): OperationType[] {
  const seen = new Set<OperationType>();
  for (const store of stores) {
    const { inputsByOperation } = store.getState();
    for (const opType of OPERATION_TYPES) {
      if (!seen.has(opType) && inputsByOperation[opType]?.items.some((item) => item.asset.id === assetId)) {
        seen.add(opType);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Hook that subscribes to all input stores (global + scoped) and returns
 * the operation types the asset is queued in.
 */
function useAssetInAllInputStores(assetId: number): OperationType[] {
  const [matchOps, setMatchOps] = useState<OperationType[]>([]);
  const prevRef = useRef<OperationType[]>([]);

  useEffect(() => {
    const check = () => {
      const stores = collectAllInputStores();
      const next = findMatchingOperations(stores, assetId);
      const prev = prevRef.current;
      if (prev.length === next.length && prev.every((op, i) => op === next[i])) return;
      prevRef.current = next;
      setMatchOps(next);
    };

    check();

    const stores = collectAllInputStores();
    const unsubs = stores.map((store) => store.subscribe(check));
    return () => unsubs.forEach((fn) => fn());
  }, [assetId]);

  return matchOps;
}

/**
 * Badge showing when an asset is queued in generation inputs
 */
export function QueueStatusBadge({ assetId }: { assetId: number }) {
  const matchOperations = useAssetInAllInputStores(assetId);

  if (matchOperations.length === 0) return null;

  const labels = matchOperations.map((op) => OPERATION_METADATA[op]?.label || op);

  return (
    <div
      className="inline-flex items-center justify-center cq-btn-md bg-accent text-accent-text rounded-full shadow-md hover:animate-hover-pop cursor-pointer"
      title={`In inputs: ${labels.join(', ')}`}
    >
      <Icon name="layers" />
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
      className="cq-badge-xs flex items-center gap-1 font-medium rounded-full bg-accent text-accent-text shadow-sm"
      title={`Selected (${selectionCount} total)`}
    >
      <Icon name="check" />
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
    position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
    stackGroup: 'badges-tr',
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
