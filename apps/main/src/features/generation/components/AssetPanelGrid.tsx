/**
 * AssetPanelGrid – Renders multi-asset strip or grid layout.
 * Maps slotItems to empty/filled slot cards.
 */
import { useMemo, useRef } from 'react';

import { useCardGestures } from '@lib/gestures';
import { Icon } from '@lib/icons';
import type { WidgetConfig } from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import { toggleFavoriteTag } from '@features/assets';
import { needsUploadToProvider } from '@features/assets/lib/resolveUploadTarget';
import type { InputItem } from '@features/generation';
import { useSetSlotViewStore } from '@features/generation/stores/setSlotViewStore';

import { MediaCard } from '@/components/media/MediaCard';
import { SetGridOverlay } from '@/components/media/setGridOverlay';
import { useInputSlotShortcuts } from '@/components/media/useInputSlotShortcuts';
import type { OperationType } from '@/types/operations';

import { MaskPreviewOverlay } from './MaskPreviewOverlay';


export interface AssetPanelGridProps {
  slotItems: Array<InputItem | null>;
  currentInputId: string | undefined;
  clampedSlotIndices: Set<number>;
  maxAssetItems: number | null;

  armedSlotIndex: number | undefined;
  setArmedSlot: (operationType: OperationType, slotIndex: number | undefined) => void;
  operationType: OperationType;

  // Drag reorder
  getDragItemProps: (index: number) => Record<string, unknown>;
  getDropTargetProps: (index: number) => Record<string, unknown>;
  draggedSlotIndex: number | null;
  dragOverSlotIndex: number | null;

  inputIndexById: Map<string, number>;
  setOperationInputIndex: ((idx: number) => void) | undefined;

  removeInput: (operationType: OperationType, inputId: string) => void;
  updateLockedTimestamp: ((operationType: OperationType, inputId: string, timestamp: number | undefined) => void) | undefined;
  toggleSkip: (operationType: OperationType, inputId: string) => void;

  // Widget builders
  buildFusionRoleOverlay: (item: InputItem, slotIdx: number) => React.ReactNode | undefined;
  buildSlotExtraWidgets: (item: InputItem, slotIdx: number) => WidgetConfig[];

  // Display settings
  enableHoverPreview: boolean;
  showPlayOverlay: boolean;
  clickToPlay: boolean;
  isGridMode: boolean;
  resolvedGridColumns: number;
  /** Strip-mode card `minmax()` floor (px). Grid sizes via columns instead. */
  resolvedCardMinSize: number;

  // Upload
  effectiveProviderId: string | undefined;
  uploadedAssetIds: Set<number>;
  uploadingAssetIds: Set<number>;
  handleUploadToProvider: (assetId: number) => Promise<void>;

  // Asset picker
  handlePickAsset?: (e: React.MouseEvent) => void;
  onOpenAsset?: (asset: AssetModel) => void;
}

export function AssetPanelGrid({
  slotItems,
  currentInputId,
  clampedSlotIndices,
  maxAssetItems,
  armedSlotIndex,
  setArmedSlot,
  operationType,
  getDragItemProps,
  getDropTargetProps,
  draggedSlotIndex,
  dragOverSlotIndex,
  inputIndexById,
  setOperationInputIndex,
  removeInput,
  updateLockedTimestamp,
  toggleSkip,
  buildFusionRoleOverlay,
  buildSlotExtraWidgets,
  enableHoverPreview,
  showPlayOverlay,
  clickToPlay,
  isGridMode,
  resolvedGridColumns,
  resolvedCardMinSize,
  effectiveProviderId,
  uploadedAssetIds,
  uploadingAssetIds,
  handleUploadToProvider,
  handlePickAsset,
  onOpenAsset,
}: AssetPanelGridProps) {
  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: isGridMode
          ? `repeat(${resolvedGridColumns}, minmax(0, 1fr))`
          : `repeat(auto-fill, minmax(${resolvedCardMinSize}px, 1fr))`,
      }}
    >
      {slotItems.map((inputItem, idx) => {
        const isSelected = !!inputItem && inputItem.id === currentInputId;
        const isClamped = clampedSlotIndices.has(idx);
        const wrapperClasses = 'relative aspect-square cq-scale';

        if (!inputItem) {
          const isArmed = armedSlotIndex === idx;
          const isDragOver = dragOverSlotIndex === idx;
          return (
            <div
              key={`empty-${idx}`}
              className={`${wrapperClasses} border border-dashed ${
                isClamped ? 'border-red-500/50' :
                isDragOver ? 'border-accent ring-2 ring-accent/60' :
                isArmed ? 'border-accent ring-2 ring-accent/60' : 'border-neutral-300 dark:border-neutral-700'
              } rounded-md flex items-center justify-center ${!isClamped ? 'transition-shadow' : ''}`}
              onClick={(e) => {
                if (isClamped) return;
                if (handlePickAsset) {
                  setArmedSlot(operationType, idx);
                  handlePickAsset(e);
                } else {
                  setArmedSlot(operationType, isArmed ? undefined : idx);
                }
              }}
              {...getDropTargetProps(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (isClamped) return;
                  if (handlePickAsset) {
                    setArmedSlot(operationType, idx);
                    handlePickAsset(e as unknown as React.MouseEvent);
                  } else {
                    setArmedSlot(operationType, isArmed ? undefined : idx);
                  }
                }
              }}
              aria-disabled={isClamped}
            >
              <div className="text-[10px] text-neutral-400 cursor-pointer">
                {isArmed ? 'Next input' : '+ Add'}
              </div>
              <div className="cq-badge cq-inset-tl absolute bg-neutral-700 text-white font-medium rounded">
                {idx + 1}
              </div>
              {isClamped && (
                <div className="cq-btn-md cq-inset-tr-md absolute rounded-full bg-amber-500/90 flex items-center justify-center z-10" title={`Over limit — only the first ${maxAssetItems} assets will be used`}>
                  <Icon name="alertTriangle" size={12} variant="default" className="text-white" />
                </div>
              )}
            </div>
          );
        }

        const isDragOver = dragOverSlotIndex === idx;
        const isDragging = draggedSlotIndex === idx;

        return (
          <FilledSlot
            key={inputItem.id ?? idx}
            inputItem={inputItem}
            idx={idx}
            isSelected={isSelected}
            isClamped={isClamped}
            isDragOver={isDragOver}
            isDragging={isDragging}
            wrapperClasses={wrapperClasses}
            operationType={operationType}
            armedSlotIndex={armedSlotIndex}
            setArmedSlot={setArmedSlot}
            getDragItemProps={getDragItemProps}
            inputIndexById={inputIndexById}
            setOperationInputIndex={setOperationInputIndex}
            removeInput={removeInput}
            updateLockedTimestamp={updateLockedTimestamp}
            toggleSkip={toggleSkip}
            buildFusionRoleOverlay={buildFusionRoleOverlay}
            buildSlotExtraWidgets={buildSlotExtraWidgets}
            enableHoverPreview={enableHoverPreview}
            showPlayOverlay={showPlayOverlay}
            clickToPlay={clickToPlay}
            effectiveProviderId={effectiveProviderId}
            uploadedAssetIds={uploadedAssetIds}
            uploadingAssetIds={uploadingAssetIds}
            handleUploadToProvider={handleUploadToProvider}
            onOpenAsset={onOpenAsset}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilledSlot
//
// Per-slot component so `useInputSlotShortcuts` can run inside the React
// render (rules-of-hooks). Owns nothing structurally — the JSX below is the
// same wrapper div + MediaCard the inline render used; only `onWheel` is
// added by the shortcuts hook.
// ─────────────────────────────────────────────────────────────────────────────

interface FilledSlotProps {
  inputItem: InputItem;
  idx: number;
  isSelected: boolean;
  isClamped: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  wrapperClasses: string;
  operationType: OperationType;
  armedSlotIndex: number | undefined;
  setArmedSlot: (operationType: OperationType, slotIndex: number | undefined) => void;
  getDragItemProps: (index: number) => Record<string, unknown>;
  inputIndexById: Map<string, number>;
  setOperationInputIndex: ((idx: number) => void) | undefined;
  removeInput: (operationType: OperationType, inputId: string) => void;
  updateLockedTimestamp: ((operationType: OperationType, inputId: string, timestamp: number | undefined) => void) | undefined;
  toggleSkip: (operationType: OperationType, inputId: string) => void;
  buildFusionRoleOverlay: (item: InputItem, slotIdx: number) => React.ReactNode | undefined;
  buildSlotExtraWidgets: (item: InputItem, slotIdx: number) => WidgetConfig[];
  enableHoverPreview: boolean;
  showPlayOverlay: boolean;
  clickToPlay: boolean;
  effectiveProviderId: string | undefined;
  uploadedAssetIds: Set<number>;
  uploadingAssetIds: Set<number>;
  handleUploadToProvider: (assetId: number) => Promise<void>;
  onOpenAsset?: (asset: AssetModel) => void;
}

function FilledSlot({
  inputItem,
  idx,
  isSelected,
  isClamped,
  isDragOver,
  isDragging,
  wrapperClasses,
  operationType,
  armedSlotIndex,
  setArmedSlot,
  getDragItemProps,
  inputIndexById,
  setOperationInputIndex,
  removeInput,
  updateLockedTimestamp,
  toggleSkip,
  buildFusionRoleOverlay,
  buildSlotExtraWidgets,
  enableHoverPreview,
  showPlayOverlay,
  clickToPlay,
  effectiveProviderId,
  uploadedAssetIds,
  uploadingAssetIds,
  handleUploadToProvider,
  onOpenAsset,
}: FilledSlotProps) {
  // Shift+Wheel + `[` / `]` shortcuts. The hook attaches a non-passive
  // wheel listener via DOM (React's onWheel is passive in modern versions,
  // which makes preventDefault a no-op against the browser's native
  // Shift+Wheel horizontal scroll). Plan: `media-card-input-time-nav`.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { commitPrev, commitNext } = useInputSlotShortcuts({
    asset: inputItem.asset,
    inputId: inputItem.id,
    operationType,
    // Set-linked slots now navigate the set cohort (pin-on-commit) — the
    // hook branches internally on assetSetRef. Plan: set-slot-walk-and-grid.
    assetSetRef: inputItem.assetSetRef,
    isFocused: isSelected,
    // No clamp gate — keeps `[`/`]` / wheel / swipe consistent with the
    // chevrons (chevrons render on clamped slots too; see
    // buildSlotExtraWidgets comment).
    enabled: true,
    targetRef: wrapperRef,
  });

  // Set-linked slots can toggle to a grid view that replaces MediaCard with
  // a thumbnail grid of the set's members. Plan: set-slot-walk-and-grid.
  const viewMode = useSetSlotViewStore(
    (s) => s.viewByInputId[inputItem.id] ?? 'single',
  );
  const showSetGrid = !!inputItem.assetSetRef && viewMode === 'grid';

  // Swipe gestures via the 'input-slot' surface. The commit handlers come
  // from useInputSlotShortcuts so wheel/keyboard/swipe all share one
  // neighbor lookup via the useAssetSequence cache.
  const gestureActions = useMemo(
    () => ({
      onInputTimeNavPrev: commitPrev,
      onInputTimeNavNext: commitNext,
    }),
    [commitPrev, commitNext],
  );
  const { gestureHandlers } = useCardGestures({
    id: inputItem.asset.id,
    surfaceId: 'input-slot',
    actions: gestureActions,
  });

  return (
    <div
      ref={wrapperRef}
      className={`${wrapperClasses} ${isSelected ? 'quickgen-asset-selected' : ''} ${isDragOver ? 'ring-2 ring-accent' : ''} ${isDragging ? 'opacity-40' : ''} cursor-grab transition-shadow`}
      {...getDragItemProps(idx)}
      onClick={() => {
        if (armedSlotIndex !== undefined) {
          setArmedSlot(operationType, undefined);
        }
        const selectedIndex = inputIndexById.get(inputItem.id);
        if (selectedIndex !== undefined) {
          setOperationInputIndex?.(selectedIndex + 1);
        }
      }}
      onDoubleClick={() => onOpenAsset?.(inputItem.asset)}
      onPointerDown={gestureHandlers.onPointerDown}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (armedSlotIndex !== undefined) {
            setArmedSlot(operationType, undefined);
          }
          const selectedIndex = inputIndexById.get(inputItem.id);
          if (selectedIndex !== undefined) {
            setOperationInputIndex?.(selectedIndex + 1);
          }
        }
      }}
      aria-disabled={isClamped}
    >
      {showSetGrid ? (
        <SetGridOverlay inputItem={inputItem} operationType={operationType} />
      ) : (
      <MediaCard
        asset={inputItem.asset}
        onToggleFavorite={() => toggleFavoriteTag(inputItem.asset)}
        customWidgets={buildSlotExtraWidgets(inputItem, idx)}
        presetCapabilities={{ showsInputTimeNav: true }}
        layout={{
          density: 'compact',
          hideFooter: true,
          fillHeight: true,
          enableHoverPreview,
          showPlayOverlay,
          clickToPlay,
          overlay: (
            <>
              {(inputItem.maskLayers?.length || inputItem.maskUrl) && (
                <MaskPreviewOverlay maskLayers={inputItem.maskLayers} maskUrl={inputItem.maskUrl} />
              )}
              {/* Per-asset prompt pin indicator (plan: per-asset-prompt-pin). */}
              {inputItem.promptPinned ? (
                <div
                  className="absolute bottom-1 left-1 z-10 flex items-center rounded bg-amber-500/90 px-1 py-0.5 text-white"
                  title="This input has its own pinned prompt"
                >
                  <Icon name="pin" size={9} />
                </div>
              ) : null}
              {buildFusionRoleOverlay(inputItem, idx)}
            </>
          ),
          className: `${isSelected ? 'ring-2 ring-accent' : ''} ${isClamped ? '!border-amber-500/70' : ''}`,
        }}
        picker={{
          showRemoveButton: true,
          onRemove: () => removeInput(operationType, inputItem.id),
          skipped: inputItem.skipped,
          onToggleSkip: () => toggleSkip(operationType, inputItem.id),
          lockedTimestamp: inputItem.lockedTimestamp,
          onLockTimestamp: (timestamp) => updateLockedTimestamp?.(operationType, inputItem.id, timestamp),
          ...(needsUploadToProvider(inputItem.asset, effectiveProviderId) && !uploadedAssetIds.has(inputItem.asset.id) ? {
            onUploadToProvider: () => handleUploadToProvider(inputItem.asset.id),
            uploadingToProvider: uploadingAssetIds.has(inputItem.asset.id),
          } : {}),
        }}
      />
      )}
    </div>
  );
}
