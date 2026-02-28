/**
 * AssetPanelGrid – Renders multi-asset strip or grid layout.
 * Maps slotItems to empty/filled slot cards.
 */
import { Icon } from '@lib/icons';
import type { WidgetConfig } from '@lib/ui/overlay';

import { CompactAssetCard } from '@features/assets/components/shared';
import { needsUploadToProvider } from '@features/assets/lib/resolveUploadTarget';
import type { AssetSetSlotRef, InputItem } from '@features/generation';

import type { OperationType } from '@/types/operations';

import { SetSlotPopover } from './SetSlotPopover';

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

  // Widget builders
  buildFusionRoleOverlay: (item: InputItem, slotIdx: number) => React.ReactNode | undefined;
  buildSlotIndexWidget: (slotIdx: number) => WidgetConfig;
  buildWarningWidget: (tooltip: string) => WidgetConfig;
  buildSetBadgeWidget: (item: InputItem, slotIdx: number) => WidgetConfig | null;
  buildSetLinkWidget: (slotIdx: number) => WidgetConfig;

  // Asset set popover
  activeSetPopover: { slotIdx: number; anchorRect: DOMRect } | null;
  onSetPopoverClose: () => void;
  onSetLink: (operationType: OperationType, inputId: string, setId: string) => void;
  onSetUnlink: (operationType: OperationType, inputId: string) => void;
  onSetModeChange: (operationType: OperationType, inputId: string, mode: AssetSetSlotRef['mode']) => void;
  onSetReroll: (operationType: OperationType, inputId: string) => void;

  // Display settings
  enableHoverPreview: boolean;
  showPlayOverlay: boolean;
  clickToPlay: boolean;
  isGridMode: boolean;
  resolvedGridColumns: number;

  // Upload
  effectiveProviderId: string | undefined;
  uploadedAssetIds: Set<number>;
  uploadingAssetIds: Set<number>;
  handleUploadToProvider: (assetId: number) => Promise<void>;
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
  buildFusionRoleOverlay,
  buildSlotIndexWidget,
  buildWarningWidget,
  buildSetBadgeWidget,
  buildSetLinkWidget,
  activeSetPopover,
  onSetPopoverClose,
  onSetLink,
  onSetUnlink,
  onSetModeChange,
  onSetReroll,
  enableHoverPreview,
  showPlayOverlay,
  clickToPlay,
  isGridMode,
  resolvedGridColumns,
  effectiveProviderId,
  uploadedAssetIds,
  uploadingAssetIds,
  handleUploadToProvider,
}: AssetPanelGridProps) {
  return (
    <div
      className={isGridMode ? 'grid gap-1.5' : 'flex gap-1.5 h-full'}
      style={isGridMode ? { gridTemplateColumns: `repeat(${resolvedGridColumns}, minmax(0, 1fr))` } : undefined}
    >
      {slotItems.map((inputItem, idx) => {
        const isSelected = !!inputItem && inputItem.id === currentInputId;
        const isClamped = clampedSlotIndices.has(idx);
        const wrapperClasses = isGridMode
          ? 'relative aspect-square cq-scale'
          : 'relative flex-shrink-0 h-full aspect-square cq-scale';

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
              onClick={() => {
                if (isClamped) return;
                setArmedSlot(operationType, isArmed ? undefined : idx);
              }}
              {...getDropTargetProps(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (isClamped) return;
                  setArmedSlot(operationType, isArmed ? undefined : idx);
                }
              }}
              aria-disabled={isClamped}
            >
              <div className="text-[10px] text-neutral-400">
                {isArmed ? 'Next input' : 'Empty slot'}
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
          <div
            key={inputItem.id ?? idx}
            className={`${wrapperClasses} ${isSelected ? 'quickgen-asset-selected' : ''} ${isDragOver ? 'ring-2 ring-accent' : ''} ${isDragging ? 'opacity-40' : ''} ${!isClamped ? 'cursor-grab transition-shadow' : ''}`}
            {...(isClamped ? getDropTargetProps(idx) : getDragItemProps(idx))}
            onClick={() => {
              if (isClamped) return;
              if (armedSlotIndex !== undefined) {
                setArmedSlot(operationType, undefined);
              }
              const selectedIndex = inputIndexById.get(inputItem.id);
              if (selectedIndex !== undefined) {
                setOperationInputIndex?.(selectedIndex + 1);
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isClamped) return;
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
              disableMotion={isSelected}
              overlay={buildFusionRoleOverlay(inputItem, idx)}
              className={`${isSelected ? 'ring-2 ring-accent' : ''} ${isClamped ? '!border-amber-500/70' : ''}`}
              extraWidgets={[
                buildSlotIndexWidget(idx),
                ...(inputItem.assetSetRef
                  ? [buildSetBadgeWidget(inputItem, idx)].filter(Boolean)
                  : [buildSetLinkWidget(idx)]),
                ...(isClamped ? [buildWarningWidget(`Over limit — only the first ${maxAssetItems} assets will be used`)] : []),
              ]}
              {...(needsUploadToProvider(inputItem.asset, effectiveProviderId) && !uploadedAssetIds.has(inputItem.asset.id) ? {
                onUploadToProvider: () => handleUploadToProvider(inputItem.asset.id),
                uploadingToProvider: uploadingAssetIds.has(inputItem.asset.id),
              } : {})}/>
          </div>
        );
      })}
      {activeSetPopover && (() => {
        const popoverItem = slotItems[activeSetPopover.slotIdx];
        if (!popoverItem) return null;
        return (
          <SetSlotPopover
            anchorRect={activeSetPopover.anchorRect}
            inputItem={popoverItem}
            operationType={operationType}
            onSetLink={onSetLink}
            onSetUnlink={onSetUnlink}
            onSetModeChange={onSetModeChange}
            onReroll={onSetReroll}
            onClose={onSetPopoverClose}
          />
        );
      })()}
    </div>
  );
}
