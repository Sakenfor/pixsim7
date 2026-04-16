/**
 * AssetPanel – Orchestrator wiring useAssetPanelState → sub-components.
 * Supports empty, single-asset carousel, and multi-asset strip/grid modes.
 *
 * Split from the original monolith into:
 *   useAssetPanelState.tsx  – all store subscriptions, computed values, callbacks
 *   AssetPanelHeader.tsx    – header bar, floating panel toggles, settings popover
 *   AssetPanelGrid.tsx      – multi-asset strip/grid display
 */
import { getAssetDisplayUrls, toggleFavoriteTag } from '@features/assets';
import { needsUploadToProvider } from '@features/assets/lib/resolveUploadTarget';

import { MediaCard } from '@/components/media/MediaCard';

import { AssetPanelGrid } from './AssetPanelGrid';
import { AssetPanelHeader } from './AssetPanelHeader';
import { MaskPreviewOverlay } from './MaskPreviewOverlay';
import { MiniGalleryPopover } from './MiniGalleryPopover';
import type { QuickGenPanelProps } from './quickGenPanelTypes';
import { SetSlotPopover } from './SetSlotPopover';
import { useAssetPanelState } from './useAssetPanelState';

export function AssetPanel(props: QuickGenPanelProps) {
  const state = useAssetPanelState(props);

  const header = (
    <AssetPanelHeader
      operationType={state.operationType}
      scopeInstanceId={state.scopeInstanceId}
      instanceId={state.instanceId}
      sourceLabel={state.sourceLabel}
      sortedHistory={state.sortedHistory}
      compatibleHistory={state.compatibleHistory}
      resolvedDisplayMode={state.resolvedDisplayMode}
      resolvedGridColumns={state.resolvedGridColumns}
      operationInputsLength={state.operationInputs.length}
      assetInstanceOverrides={state.assetInstanceOverrides}
      assetHasInstanceOverrides={state.assetHasInstanceOverrides}
      globalDisplayMode={state.globalDisplayMode}
      globalGridColumns={state.globalGridColumns}
      handleComponentSetting={state.handleComponentSetting}
      handleClearInstanceOverrides={state.handleClearInstanceOverrides}
    />
  );

  const isGridMode = state.resolvedDisplayMode === 'grid';

  // ── Resolve popover target (shared across display modes) ──────────
  const popoverInputItem = state.activeSetPopover
    ? (state.slotItems[state.activeSetPopover.slotIdx] ?? state.currentInput)
    : null;

  const assetPickerPopover = state.pickerAnchorRect ? (
    <MiniGalleryPopover
      anchorRect={state.pickerAnchorRect}
      title="Add Asset"
      onClose={state.handleClosePickerPopover}
      galleryProps={{
        showSearch: true,
        showMediaType: true,
        showSort: true,
      }}
    />
  ) : null;

  const setPopover = state.activeSetPopover && popoverInputItem ? (
    <SetSlotPopover
      anchorRect={state.activeSetPopover.anchorRect}
      inputItem={popoverInputItem}
      operationType={state.operationType}
      onSetLink={state.handleSetLink}
      onSetUnlink={state.handleSetUnlink}
      onSetModeChange={state.handleSetModeChange}
      onPickStrategyChange={state.handlePickStrategyChange}
      onReroll={state.handleSetReroll}
      onClose={state.handleSetPopoverClose}
    />
  ) : null;

  // ── Empty state ────────────────────────────────────────────────────
  if (!state.hasAsset) {
    const emptyLabel = state.operationMeta?.inputMediaType === 'video' ? '+ Select video' :
      state.operationMeta?.multiAssetMode === 'required' ? '+ Add images' : '+ Add asset';
    return (
      <div className="h-full flex flex-col">
        {header}
        <div
          className="flex-1 flex items-center justify-center p-3 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors rounded-md"
          onClick={(e) => state.handlePickAsset(e)}
          role="button"
        >
          <div className="text-xs text-neutral-500 italic text-center">
            {emptyLabel}
          </div>
        </div>
        {assetPickerPopover}
      </div>
    );
  }

  // ── Multi-asset display (strip / grid) ─────────────────────────────
  if (state.resolvedDisplayMode !== 'carousel') {
    return (
      <>
        <div className="h-full w-full flex flex-col">
          {header}
          <div
            ref={state.containerRef}
            className={`flex-1 p-2 pt-0 overflow-auto ${state.draggedSlotIndex !== null ? 'cursor-grabbing' : ''}`}
          >
            <AssetPanelGrid
              slotItems={state.slotItems}
              currentInputId={state.currentInputId}
              clampedSlotIndices={state.clampedSlotIndices}
              maxAssetItems={state.maxAssetItems}
              armedSlotIndex={state.armedSlotIndex}
              setArmedSlot={state.setArmedSlot}
              operationType={state.operationType}
              getDragItemProps={state.getDragItemProps}
              getDropTargetProps={state.getDropTargetProps}
              draggedSlotIndex={state.draggedSlotIndex}
              dragOverSlotIndex={state.dragOverSlotIndex}
              inputIndexById={state.inputIndexById}
              setOperationInputIndex={state.setOperationInputIndex}
              removeInput={state.removeInput}
              updateLockedTimestamp={state.updateLockedTimestamp}
              toggleSkip={state.toggleSkip}
              buildFusionRoleOverlay={state.buildFusionRoleOverlay}
              buildSlotExtraWidgets={(item, idx) => state.buildSlotExtraWidgets(item, idx, { includeSlotIndex: true })}
              enableHoverPreview={state.enableHoverPreview}
              showPlayOverlay={state.showPlayOverlay}
              clickToPlay={state.clickToPlay}
              isGridMode={isGridMode}
              resolvedGridColumns={state.resolvedGridColumns}
              effectiveProviderId={state.effectiveProviderId}
              uploadedAssetIds={state.uploadedAssetIds}
              uploadingAssetIds={state.uploadingAssetIds}
              handleUploadToProvider={state.handleUploadToProvider}
              handlePickAsset={state.handlePickAsset}
              onOpenAsset={state.openAsset}
            />
          </div>
        </div>
        {setPopover}
        {assetPickerPopover}
      </>
    );
  }

  // ── Single-asset carousel ──────────────────────────────────────────
  const currentSlotIndex = state.currentInput
    ? (typeof state.currentInput.slotIndex === 'number' ? state.currentInput.slotIndex : state.currentInputIdx)
    : null;
  const isCurrentClamped = currentSlotIndex !== null && state.clampedSlotIndices.has(currentSlotIndex);

  const queueItems = state.orderedInputs.flatMap((item, idx) => {
    if (!item?.asset) return [];
    const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(item.asset);
    const thumbUrl = thumbnailUrl ?? previewUrl ?? mainUrl ?? '';
    return [{
      id: `${item.asset.id}-${idx}`,
      thumbnailUrl: thumbUrl,
    }];
  });
  // Append virtual empty slot entry for grid popup
  if (state.showVirtualEmptySlot) {
    queueItems.push({ id: 'virtual-empty', thumbnailUrl: '' });
  }

  // ── Carousel navigation with virtual slot awareness ───────────────
  const handleCarouselPrev = () => {
    if (state.isOnVirtualSlot) {
      // Virtual slot → last real item
      state.setOperationInputIndex(state.orderedInputs.length);
    } else if (state.operationInputIndex <= 1 && state.showVirtualEmptySlot) {
      // First item, wrap to virtual slot
      state.setOperationInputIndex(state.orderedInputs.length + 1);
    } else {
      state.cycleInputs?.(state.operationType, 'prev');
    }
  };

  const handleCarouselNext = () => {
    if (state.operationInputIndex >= state.orderedInputs.length && state.showVirtualEmptySlot && !state.isOnVirtualSlot) {
      // Last real item → virtual slot
      state.setOperationInputIndex(state.orderedInputs.length + 1);
    } else if (state.isOnVirtualSlot) {
      // Virtual slot → wrap to first item
      state.setOperationInputIndex(1);
    } else {
      state.cycleInputs?.(state.operationType, 'next');
    }
  };

  const currentAsset = state.currentInput?.asset ?? state.displayAssets[0];
  const singleNeedsUpload = !state.isOnVirtualSlot && needsUploadToProvider(currentAsset, state.effectiveProviderId) && !state.uploadedAssetIds.has(currentAsset.id);

  return (
    <>
      <div className="h-full w-full flex flex-col">
        {header}
        <div ref={state.containerRef} className="flex-1 min-h-0 p-2 pt-0">
          <div className="relative h-full">
            {state.isOnVirtualSlot ? (
              // ── Virtual empty slot placeholder ──────────────────────
              <div
                className="h-full border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
                onClick={(e) => state.handlePickAsset(e)}
                role="button"
              >
                <div className="text-xs text-neutral-500 italic text-center">
                  + Add asset
                </div>
                {/* Nav pill for virtual slot */}
                {state.carouselTotalCount > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 z-20">
                    <button
                      onClick={handleCarouselPrev}
                      className="text-white/90 hover:text-white transition-colors text-[11px] font-medium px-1"
                      title="Previous"
                    >
                      {state.operationInputIndex}
                    </button>
                    <span className="text-white/60 text-[10px]">/</span>
                    <button
                      onClick={handleCarouselNext}
                      className="text-white/90 hover:text-white transition-colors text-[11px] font-medium px-1"
                      title="Next"
                    >
                      {state.carouselTotalCount}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full" onDoubleClick={() => state.openAsset(currentAsset)}>
                <MediaCard
                  asset={currentAsset}
                  onToggleFavorite={() => toggleFavoriteTag(currentAsset)}
                  customWidgets={state.buildSlotExtraWidgets(state.currentInput ?? null, currentSlotIndex ?? 0)}
                  layout={{
                    density: 'compact',
                    hideFooter: true,
                    fillHeight: true,
                    enableHoverPreview: state.enableHoverPreview,
                    showPlayOverlay: state.showPlayOverlay,
                    clickToPlay: state.clickToPlay,
                    overlay: (
                      <>
                        {(state.currentInput?.maskLayers?.length || state.currentInput?.maskUrl) && (
                          <MaskPreviewOverlay maskLayers={state.currentInput?.maskLayers} maskUrl={state.currentInput?.maskUrl} />
                        )}
                        {state.currentInput && state.buildFusionRoleOverlay(state.currentInput, currentSlotIndex ?? 0)}
                      </>
                    ),
                    className: isCurrentClamped ? '!border-amber-500/70' : '',
                  }}
                  picker={{
                    showRemoveButton: state.orderedInputs.length > 0,
                    onRemove: () => {
                      if (state.currentInputId) {
                        state.removeInput?.(state.operationType, state.currentInputId);
                      }
                    },
                    lockedTimestamp: state.currentInput?.lockedTimestamp,
                    onLockTimestamp: state.currentInputId
                      ? (timestamp) =>
                          state.updateLockedTimestamp?.(state.operationType, state.currentInputId!, timestamp)
                      : undefined,
                    skipped: state.currentInput?.skipped,
                    onToggleSkip: state.currentInputId
                      ? () => state.toggleSkip(state.operationType, state.currentInputId!)
                      : undefined,
                    queue: {
                      currentIndex: state.operationInputIndex,
                      totalCount: state.carouselTotalCount,
                      items: queueItems,
                      onPrev: handleCarouselPrev,
                      onNext: handleCarouselNext,
                      onSelect: (idx) => state.setOperationInputIndex(idx + 1),
                    },
                    ...(singleNeedsUpload
                      ? {
                          onUploadToProvider: () => state.handleUploadToProvider(currentAsset.id),
                          uploadingToProvider: state.uploadingAssetIds.has(currentAsset.id),
                        }
                      : {
                          onGenerate: () => state.controller.generate(
                            state.currentInput?.asset
                              ? { assetOverrides: [state.currentInput.asset] }
                              : { assetOverrides: [], skipActiveAssetFallback: true }
                          ),
                          generating: state.controller.generating,
                        }
                    ),
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {setPopover}
      {assetPickerPopover}
    </>
  );
}
