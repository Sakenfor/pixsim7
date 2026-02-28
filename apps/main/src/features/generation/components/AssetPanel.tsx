/**
 * AssetPanel – Orchestrator wiring useAssetPanelState → sub-components.
 * Supports empty, single-asset carousel, and multi-asset strip/grid modes.
 *
 * Split from the original monolith into:
 *   useAssetPanelState.tsx  – all store subscriptions, computed values, callbacks
 *   AssetPanelHeader.tsx    – header bar, floating panel toggles, settings popover
 *   AssetPanelGrid.tsx      – multi-asset strip/grid display
 */
import { getAssetDisplayUrls } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared';
import { needsUploadToProvider } from '@features/assets/lib/resolveUploadTarget';

import { AssetPanelGrid } from './AssetPanelGrid';
import { AssetPanelHeader } from './AssetPanelHeader';
import type { QuickGenPanelProps } from './quickGenPanelTypes';
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

  // ── Empty state ────────────────────────────────────────────────────
  if (!state.hasAsset) {
    return (
      <div className="h-full flex flex-col">
        {header}
        <div className="flex-1 flex items-center justify-center p-3">
          <div className="text-xs text-neutral-500 italic text-center">
            {state.operationType === 'video_extend' ? 'Select video' :
             state.operationMeta?.multiAssetMode === 'required' ? '+ Add images' :
             state.isFlexibleOperation ? '+ Image (optional)' : '+ Add image'}
          </div>
        </div>
      </div>
    );
  }

  const isGridMode = state.resolvedDisplayMode === 'grid';

  // ── Multi-asset display (strip / grid) ─────────────────────────────
  if (state.isMultiAssetDisplay && state.resolvedDisplayMode !== 'carousel') {
    return (
      <div className="h-full w-full flex flex-col">
        {header}
        <div
          ref={state.containerRef}
          className={`flex-1 p-2 pt-0 ${isGridMode ? 'overflow-auto' : 'overflow-x-auto'} ${state.draggedSlotIndex !== null ? 'cursor-grabbing' : ''}`}
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
            buildFusionRoleOverlay={state.buildFusionRoleOverlay}
            buildSlotIndexWidget={state.buildSlotIndexWidget}
            buildWarningWidget={state.buildWarningWidget}
            buildSetBadgeWidget={state.buildSetBadgeWidget}
            buildSetLinkWidget={state.buildSetLinkWidget}
            activeSetPopover={state.activeSetPopover}
            onSetPopoverClose={state.handleSetPopoverClose}
            onSetLink={state.handleSetLink}
            onSetUnlink={state.handleSetUnlink}
            onSetModeChange={state.handleSetModeChange}
            onSetReroll={state.handleSetReroll}
            enableHoverPreview={state.enableHoverPreview}
            showPlayOverlay={state.showPlayOverlay}
            clickToPlay={state.clickToPlay}
            isGridMode={isGridMode}
            resolvedGridColumns={state.resolvedGridColumns}
            effectiveProviderId={state.effectiveProviderId}
            uploadedAssetIds={state.uploadedAssetIds}
            uploadingAssetIds={state.uploadingAssetIds}
            handleUploadToProvider={state.handleUploadToProvider}
          />
        </div>
      </div>
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

  const currentAsset = state.currentInput?.asset ?? state.displayAssets[0];
  const singleNeedsUpload = needsUploadToProvider(currentAsset, state.effectiveProviderId) && !state.uploadedAssetIds.has(currentAsset.id);

  return (
    <div className="h-full w-full flex flex-col">
      {header}
      <div ref={state.containerRef} className="flex-1 p-2 pt-0">
        <div className="relative h-full">
          <CompactAssetCard
            asset={currentAsset}
            showRemoveButton={state.orderedInputs.length > 0}
            onRemove={() => {
              if (state.currentInputId) {
                state.removeInput?.(state.operationType, state.currentInputId);
              }
            }}
            lockedTimestamp={state.currentInput?.lockedTimestamp}
            onLockTimestamp={
              state.currentInputId
                ? (timestamp) =>
                    state.updateLockedTimestamp?.(state.operationType, state.currentInputId!, timestamp)
                : undefined
            }
            {...(singleNeedsUpload
              ? {
                  onUploadToProvider: () => state.handleUploadToProvider(currentAsset.id),
                  uploadingToProvider: state.uploadingAssetIds.has(currentAsset.id),
                }
              : {
                  onGenerate: () => state.controller.generate(
                    state.currentInput ? { overrideOperationInputs: [state.currentInput] } : undefined
                  ),
                  generating: state.controller.generating,
                }
            )}
            hideFooter
            fillHeight
            currentIndex={state.operationInputIndex}
            totalCount={state.orderedInputs.length}
            onNavigatePrev={() => state.cycleInputs?.(state.operationType, 'prev')}
            onNavigateNext={() => state.cycleInputs?.(state.operationType, 'next')}
            queueItems={queueItems}
            onSelectIndex={(idx) => state.setOperationInputIndex?.(idx + 1)}
            enableHoverPreview={state.enableHoverPreview}
            showPlayOverlay={state.showPlayOverlay}
            clickToPlay={state.clickToPlay}
            overlay={state.currentInput ? state.buildFusionRoleOverlay(state.currentInput, currentSlotIndex ?? 0) : undefined}
            className={isCurrentClamped ? '!border-amber-500/70' : ''}
            extraWidgets={isCurrentClamped ? [state.buildWarningWidget(`Over limit — only the first ${state.maxAssetItems} assets will be used`)] : undefined}
          />
        </div>
      </div>
    </div>
  );
}
