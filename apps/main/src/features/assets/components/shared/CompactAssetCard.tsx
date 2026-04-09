/**
 * CompactAssetCard
 *
 * A smaller, simplified version of MediaCard for displaying assets in compact spaces.
 * Uses the shared VideoScrubWidgetRenderer for consistent video scrubbing with MediaCard.
 * Supports frame locking for video assets used in image_to_video/transition workflows.
 *
 * Features:
 * - Thumbnail/preview display with authenticated URL handling
 * - Video hover scrubbing (via shared VideoScrubWidgetRenderer)
 * - Frame locking for video assets
 * - Navigation controls for asset queues
 * - Grid popup for quick asset selection
 * - Context menu integration
 */

import { useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { useAssetAutoContextMenu, useContextMenuOptional } from '@lib/dockview';
import { contextDataRegistry } from '@lib/dockview';
import { Icon } from '@lib/icons';
import { OverlayContainer, VideoScrubWidgetRenderer } from '@lib/ui/overlay';
import type { OverlayWidget } from '@lib/ui/overlay';
import type { OverlayPolicyStep } from '@lib/ui/overlay';
import type { OverlayContextId } from '@lib/widgets';

import { getAssetDisplayUrls } from '@features/assets/models/asset';
import { CAP_ASSET, useProvideCapability } from '@features/contextHub';

import { buildCompactAssetCardLocalWidgets } from '@/components/media/assetCardLocalWidgets';
import { useOverlayWidgetsForAsset } from '@/components/media/hooks/useOverlayWidgetsForAsset';
import { ThumbnailImage } from '@/components/media/ThumbnailImage';
import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';
import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';

import type { AssetModel } from '../../types';

/** Stable objects to avoid busting the useMemo inside useOverlayWidgetsForAsset */
const STABLE_RUNTIME_PROPS = {};

export interface ThumbnailGridItem {
  id: string | number;
  thumbnailUrl: string;
}

function QueueThumbnail({ url, alt }: { url: string; alt: string }) {
  const { mediaSrc } = useResolvedAssetMedia({ mediaUrl: url });
  return <img src={mediaSrc || url} alt={alt} className="w-full h-full object-cover" />;
}

interface PopupPosition {
  x: number;
  y: number;
  showAbove: boolean; // true = above trigger, false = below
}

export interface CompactAssetCardProps {
  asset: AssetModel;
  onRemove?: () => void;
  showRemoveButton?: boolean;
  className?: string;
  label?: string;
  lockedTimestamp?: number; // Locked frame timestamp in seconds
  onLockTimestamp?: (timestamp: number | undefined) => void; // Callback to lock/unlock frame
  selected?: boolean; // Whether this card is selected (for transition selection)
  onSelect?: () => void; // Callback when card is clicked for selection
  hideFooter?: boolean; // Hide the footer with asset ID/URL
  fillHeight?: boolean; // Fill parent height instead of using aspect ratio
  aspectSquare?: boolean; // Force square aspect ratio (useful in thumbnail grids)
  // Navigation
  currentIndex?: number; // Current index (1-based for display)
  totalCount?: number; // Total count
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  // Queue grid popup
  queueItems?: ThumbnailGridItem[]; // Items for grid popup (id, thumbnailUrl)
  onSelectIndex?: (index: number) => void; // Jump to specific index (0-based)
  // Video scrubbing options (passed to VideoScrubWidgetRenderer)
  enableHoverPreview?: boolean;
  showPlayOverlay?: boolean;
  clickToPlay?: boolean;
  // Generation shortcut
  onGenerate?: () => void; // "Go" button — triggers generation with this asset
  generating?: boolean; // Whether a generation is currently running
  // Upload to provider shortcut (replaces generate button when asset isn't on target provider)
  onUploadToProvider?: () => void | Promise<void>;
  uploadingToProvider?: boolean;
  // Skip toggle — temporarily omit from generation
  skipped?: boolean;
  onToggleSkip?: () => void;
  // Extension points
  onClick?: () => void; // Custom click handler for the card body
  overlay?: React.ReactNode; // Custom overlay content (absolute-positioned, pointer-events-none)
  hoverActions?: React.ReactNode; // Custom hover overlay replacing default behavior
  extraWidgets?: OverlayWidget[]; // Additional overlay widgets (participate in collision detection)
  /** Override the overlay context for widget visibility (default: 'compact').
   *  Use 'gallery' to show widgets like generation-button-group that are hidden in compact. */
  overlayContext?: OverlayContextId;
  /** Optional runtime overlay policy chain override. */
  overlayPolicyChain?: OverlayPolicyStep[];
}

export function CompactAssetCard({
  asset,
  onRemove,
  showRemoveButton = false,
  className = '',
  label,
  lockedTimestamp,
  onLockTimestamp,
  hideFooter = false,
  fillHeight = false,
  aspectSquare = false,
  currentIndex,
  totalCount,
  onNavigatePrev,
  onNavigateNext,
  queueItems,
  onSelectIndex,
  enableHoverPreview = true,
  showPlayOverlay = true,
  clickToPlay = false,
  onGenerate,
  generating = false,
  onUploadToProvider,
  uploadingToProvider = false,
  skipped,
  onToggleSkip,
  onClick,
  overlay,
  hoverActions,
  extraWidgets,
  overlayContext,
  overlayPolicyChain,
}: CompactAssetCardProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showQueueGrid, setShowQueueGrid] = useState(false);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);

  // Resolve URLs for the asset (shared helper handles video vs image thumbnail correctly)
  const { thumbnailUrl: resolvedThumbUrl, previewUrl: resolvedPreviewUrl, mainUrl: resolvedMainUrl } =
    getAssetDisplayUrls(asset);
  const { thumbSrc, thumbLoading, thumbFailed, thumbRetry, videoSrc: resolvedVideoSrc } = useMediaPreviewSource({
    mediaType: asset.mediaType,
    thumbUrl: resolvedThumbUrl,
    previewUrl: resolvedPreviewUrl,
    remoteUrl: resolvedMainUrl,
  });

  const isVideo = asset.mediaType === 'video';
  const hoverPreviewEnabled = enableHoverPreview && !clickToPlay;
  const isHovering = hoverPreviewEnabled && isHovered;

  // For video scrubbing, use the properly resolved video source
  const videoSrc = isVideo ? resolvedVideoSrc : undefined;
  const hasLockedFrame = lockedTimestamp !== undefined;

  // Toggle grid and calculate position with edge detection
  const handleToggleGrid = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showQueueGrid) {
      setShowQueueGrid(false);
      setPopupPosition(null);
    } else {
      if (triggerRef.current && queueItems) {
        const rect = triggerRef.current.getBoundingClientRect();
        const cols = queueItems.length <= 4 ? 2 : queueItems.length <= 9 ? 3 : 4;
        const rows = Math.ceil(queueItems.length / cols);
        const popupWidth = cols * 80 + (cols - 1) * 6 + 16; // thumbnails + gaps + padding
        const popupHeight = rows * 80 + (rows - 1) * 6 + 16;

        // Calculate x position (centered on trigger, clamped to screen edges)
        let x = rect.left + rect.width / 2;
        const minX = popupWidth / 2 + 8;
        const maxX = window.innerWidth - popupWidth / 2 - 8;
        x = Math.max(minX, Math.min(maxX, x));

        // Check if there's room above, otherwise show below
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const showAbove = spaceAbove >= popupHeight + 8 || spaceAbove > spaceBelow;

        const y = showAbove
          ? rect.top - 8
          : rect.bottom + 8;

        setPopupPosition({ x, y, showAbove });
      }
      setShowQueueGrid(true);
    }
  }, [showQueueGrid, queueItems]);

  // Handle frame lock/unlock via dot click (or double-click on mark)
  const handleDotClick = useCallback((timestamp: number) => {
    if (!onLockTimestamp) return;

    // If clicking the same timestamp that's already locked, unlock it
    if (hasLockedFrame && lockedTimestamp !== undefined && Math.abs(lockedTimestamp - timestamp) < 0.05) {
      onLockTimestamp(undefined);
    } else {
      // Lock at the new timestamp (works for both initial lock and switching marks)
      onLockTimestamp(timestamp);
    }
  }, [hasLockedFrame, lockedTimestamp, onLockTimestamp]);

  const isLocalOnly =
    asset.providerStatus === 'local_only' ||
    (asset.syncStatus === 'downloaded' && !asset.remoteUrl);
  const statusColor = isLocalOnly
    ? 'border-amber-300 dark:border-amber-700'
    : 'border-green-300 dark:border-green-700';

  // Provide asset capability for context menu actions
  const assetProvider = useMemo(() => ({
    id: 'asset-card',
    getValue: () => asset,
    isAvailable: () => !!asset,
    exposeToContextMenu: true,
  }), [asset]);
  useProvideCapability(CAP_ASSET, assetProvider, [assetProvider]);

  // Context menu: data-attribute registration + direct onContextMenu fallback
  const contextMenuProps = useAssetAutoContextMenu(asset);
  const contextMenu = useContextMenuOptional();
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!contextMenu || !asset?.id) return;
      // Only handle if the dockview capture handler didn't already consume the event
      if (e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      const resolved = contextDataRegistry.resolve('asset', asset.id);
      contextMenu.showContextMenu({
        contextType: 'asset',
        position: { x: e.clientX, y: e.clientY },
        data: resolved ?? { id: asset.id },
      });
    },
    [contextMenu, asset?.id],
  );

  // Shared overlay widgets (favorite, quick-tag, etc.) from overlay context settings.
  const effectiveContext = overlayContext ?? 'compact';
  const { overlayConfig, overlayData } = useOverlayWidgetsForAsset({
    asset,
    context: effectiveContext,
    runtimeProps: STABLE_RUNTIME_PROPS,
    useCompactPositions: true,
    suppressGenerationButtonGroup: !!hoverActions,
    policyChain: overlayPolicyChain,
  });

  // Stable ref for onRemove so widget identity doesn't change every render
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  // Stable refs for callbacks used in overlay widgets (avoids identity changes)
  const onGenerateRef = useRef(onGenerate);
  onGenerateRef.current = onGenerate;
  const onToggleSkipRef = useRef(onToggleSkip);
  onToggleSkipRef.current = onToggleSkip;

  // Build extra widgets from props (remove button, status indicators, etc.)
  const cardWidgets = useMemo(
    () => buildCompactAssetCardLocalWidgets({
      showRemoveButton,
      isLocalOnly,
      isVideo,
      hasLockedFrame,
      lockedTimestamp,
      onRemove: () => onRemoveRef.current?.(),
      onGenerate: onGenerate ? () => onGenerateRef.current?.() : undefined,
      generating,
      onUploadToProvider,
      skipped,
      onToggleSkip: onToggleSkip ? () => onToggleSkipRef.current?.() : undefined,
    }),
    [
      showRemoveButton,
      isLocalOnly,
      isVideo,
      hasLockedFrame,
      lockedTimestamp,
      onGenerate,
      generating,
      onUploadToProvider,
      skipped,
      onToggleSkip,
    ],
  );

  // Merge all widgets into one config; enable collision detection only when extra widgets are present
  const mergedOverlayConfig = useMemo(() => {
    const hasExtra = cardWidgets.length > 0 || (extraWidgets && extraWidgets.length > 0);
    return {
      ...overlayConfig,
      widgets: hasExtra
        ? [...overlayConfig.widgets, ...cardWidgets, ...(extraWidgets ?? [])]
        : overlayConfig.widgets,
      ...(hasExtra && { collisionDetection: true }),
    };
  }, [overlayConfig, cardWidgets, extraWidgets]);

  return (
    <div
      className={`relative rounded-md border-2 ${statusColor} bg-white dark:bg-neutral-900 overflow-hidden ${fillHeight ? 'h-full flex flex-col' : ''} ${onClick ? 'cursor-pointer' : ''} ${skipped ? 'opacity-40' : ''} group/card ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      {...contextMenuProps}
    >
      {label && (
        <div className="absolute top-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-0.5 z-10 font-medium">
          {label}
        </div>
      )}

      <OverlayContainer
        configuration={mergedOverlayConfig}
        data={overlayData}
        className={`relative bg-neutral-100 dark:bg-neutral-800 cq-scale ${
          fillHeight ? 'h-full' : (aspectSquare || !isVideo ? 'aspect-square' : 'aspect-video')
        }`}
      >
        {/* Base thumbnail/poster image */}
        <ThumbnailImage
          src={thumbSrc}
          alt={asset.description || `Asset ${asset.id}`}
          loading={thumbLoading}
          failed={thumbFailed}
          onRetry={thumbRetry}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Video scrub overlay - uses shared VideoScrubWidgetRenderer */}
        {isVideo && videoSrc && hoverPreviewEnabled && (
          <div className="absolute inset-0 z-[1]">
            <VideoScrubWidgetRenderer
              url={videoSrc}
              configDuration={asset.durationSec ?? undefined}
              isHovering={isHovering}
              showTimeline={true}
              showTimestamp={true}
              timelinePosition="bottom"
              onDotClick={onLockTimestamp ? handleDotClick : undefined}
              dotTooltip={hasLockedFrame ? `Unlock frame (${lockedTimestamp?.toFixed(1)}s)` : 'Click to use this frame'}
              dotActive={hasLockedFrame}
              lockedTimestamp={lockedTimestamp}
            />
          </div>
        )}

        {showPlayOverlay && isVideo && !hoverPreviewEnabled && (
          <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
            <div className="cq-btn-lg rounded-full bg-black/50 flex items-center justify-center">
              <Icon name="play" size={12} variant="default" className="text-white" />
            </div>
          </div>
        )}

        {/* Custom overlay (badges, indicators) */}
        {overlay && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {overlay}
          </div>
        )}

        {/* Custom hover actions overlay */}
        {hoverActions && (
          <div className="cq-hover-actions absolute inset-0 bg-black/30 opacity-0 group-hover/card:opacity-100 transition-opacity z-20 flex items-end justify-center pointer-events-none">
            <div className="cq-scale-down pointer-events-auto">
              {hoverActions}
            </div>
          </div>
        )}

        {/* Navigation pill - bottom center */}
        {currentIndex !== undefined && totalCount !== undefined && totalCount > 1 && (
          <div className="cq-scale-down absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 z-20">
            <button
              onClick={(e) => { e.stopPropagation(); onNavigatePrev?.(); }}
              className="text-white/90 hover:text-white transition-colors text-[11px] font-medium px-1"
              title="Previous"
            >
              {currentIndex}
            </button>

            {/* Grid popup trigger - small circle between numbers */}
            {queueItems && queueItems.length > 1 && onSelectIndex ? (
              <button
                ref={triggerRef}
                onClick={handleToggleGrid}
                className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 transition-colors flex items-center justify-center"
                title={`View all ${queueItems.length} assets`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              </button>
            ) : (
              <span className="text-white/60 text-[10px]">/</span>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); onNavigateNext?.(); }}
              className="text-white/90 hover:text-white transition-colors text-[11px] font-medium px-1"
              title="Next"
            >
              {totalCount}
            </button>
          </div>
        )}

        {/* Queue grid popup - Portal to body to escape stacking context */}
        {showQueueGrid && popupPosition && queueItems && queueItems.length > 1 && onSelectIndex && createPortal(
          <>
            {/* Backdrop to close on click outside */}
            <div
              className="fixed inset-0 z-modal-backdrop"
              onClick={() => { setShowQueueGrid(false); setPopupPosition(null); }}
            />
            {/* Grid using fixed position with edge detection */}
            <div
              className="fixed p-2 bg-neutral-900 rounded-lg shadow-2xl border border-neutral-600 z-popover"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${queueItems.length <= 4 ? 2 : queueItems.length <= 9 ? 3 : 4}, 80px)`,
                gap: '6px',
                left: popupPosition.x,
                top: popupPosition.showAbove ? undefined : popupPosition.y,
                bottom: popupPosition.showAbove ? window.innerHeight - popupPosition.y : undefined,
                transform: 'translateX(-50%)',
              }}
            >
              {queueItems.map((item, idx) => {
                const isVirtualSlot = !item.thumbnailUrl;
                return (
                  <button
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectIndex(idx);
                      setShowQueueGrid(false);
                      setPopupPosition(null);
                    }}
                    style={{ width: 80, height: 80, transition: 'none', animation: 'none' }}
                    className={`relative rounded-md overflow-hidden ${
                      idx === (currentIndex ?? 1) - 1
                        ? 'ring-2 ring-accent'
                        : 'hover:ring-1 hover:ring-white/50'
                    } ${isVirtualSlot ? 'border border-dashed border-neutral-600 flex items-center justify-center' : ''}`}
                  >
                    {isVirtualSlot ? (
                      <span className="text-neutral-400 text-lg font-light">+</span>
                    ) : (
                      <>
                        <QueueThumbnail url={item.thumbnailUrl} alt={`Asset ${idx + 1}`} />
                        <span className="absolute bottom-0 right-0 bg-black/80 text-white text-[11px] px-1.5 py-0.5 rounded-tl font-medium">
                          {idx + 1}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
      </OverlayContainer>

      {/* Upload-to-provider bar — below image to avoid overlapping corner widgets */}
      {onUploadToProvider && (
        <button
          onClick={(e) => { e.stopPropagation(); onUploadToProvider(); }}
          className="w-full flex items-center justify-center gap-1 py-0.5 bg-accent/90 hover:bg-accent text-accent-text text-[10px] font-medium transition-colors disabled:opacity-40"
          title="Upload to provider"
          disabled={uploadingToProvider}
        >
          {uploadingToProvider
            ? <Icon name="loader" size={10} className="animate-spin" />
            : <Icon name="upload" size={10} />
          }
          <span>{uploadingToProvider ? 'Uploading…' : 'Upload'}</span>
        </button>
      )}

      {/* Footer with basic info */}
      {!hideFooter && (
        <div className="px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
          <div className="truncate font-medium">{asset.providerAssetId || `ID: ${asset.id}`}</div>
          {isLocalOnly && (
            <div className="text-amber-600 dark:text-amber-400 text-[9px]">⚠ Not synced to provider</div>
          )}
        </div>
      )}
    </div>
  );
}
