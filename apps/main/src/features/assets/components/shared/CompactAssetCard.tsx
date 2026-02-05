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

import { useAssetAutoContextMenu } from '@lib/dockview';
import { ThemedIcon } from '@lib/icons';
import { VideoScrubWidgetRenderer } from '@lib/ui/overlay';

import { getAssetDisplayUrls } from '@features/assets/models/asset';
import { CAP_ASSET, useProvideCapability } from '@features/contextHub';

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';


import type { AssetModel } from '../../types';

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
  currentIndex,
  totalCount,
  onNavigatePrev,
  onNavigateNext,
  queueItems,
  onSelectIndex,
  enableHoverPreview = true,
  showPlayOverlay = true,
  clickToPlay = false,
}: CompactAssetCardProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showQueueGrid, setShowQueueGrid] = useState(false);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);

  // Resolve URLs for the asset
  const { thumbnailUrl: resolvedThumbUrl, previewUrl: resolvedPreviewUrl, mainUrl: resolvedMainUrl } =
    getAssetDisplayUrls(asset);
  const { thumbSrc } = useResolvedAssetMedia({
    thumbUrl: resolvedThumbUrl,
    previewUrl: resolvedPreviewUrl,
    remoteUrl: resolvedMainUrl,
  });

  const isVideo = asset.mediaType === 'video';
  const hoverPreviewEnabled = enableHoverPreview && !clickToPlay;
  const isHovering = hoverPreviewEnabled && isHovered;

  // For video scrubbing, prefer the resolved main URL (respects local-vs-remote settings)
  const videoSrc = isVideo ? resolvedMainUrl : undefined;
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

  // Handle frame lock/unlock via dot click
  const handleDotClick = useCallback((timestamp: number) => {
    if (!onLockTimestamp) return;

    if (hasLockedFrame) {
      // Unlock
      onLockTimestamp(undefined);
    } else {
      // Lock at the clicked timestamp
      onLockTimestamp(timestamp);
    }
  }, [hasLockedFrame, onLockTimestamp]);

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

  // Context menu: automatic registration with type-specific preset
  const contextMenuProps = useAssetAutoContextMenu(asset);

  return (
    <div
      className={`relative rounded-md border-2 ${statusColor} bg-white dark:bg-neutral-900 overflow-hidden ${fillHeight ? 'h-full flex flex-col' : ''} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...contextMenuProps}
    >
      {label && (
        <div className="absolute top-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-0.5 z-10 font-medium">
          {label}
        </div>
      )}

      <div
        className={`relative bg-neutral-100 dark:bg-neutral-800 ${
          fillHeight ? 'h-full' : (isVideo ? 'aspect-video' : 'aspect-square')
        }`}
      >
        {/* Base thumbnail/poster image */}
        {thumbSrc && (
          <img
            src={thumbSrc}
            alt={asset.description || `Asset ${asset.id}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {/* Video scrub overlay - uses shared VideoScrubWidgetRenderer */}
        {isVideo && videoSrc && hoverPreviewEnabled && (
          <div className="absolute inset-0 z-[1]">
            <VideoScrubWidgetRenderer
              url={videoSrc}
              configDuration={asset.durationSec ?? undefined}
              isHovering={isHovering}
              showTimeline={true}
              showTimestamp={false}
              timelinePosition="bottom"
              onDotClick={onLockTimestamp ? handleDotClick : undefined}
              dotTooltip={hasLockedFrame ? `Unlock frame (${lockedTimestamp?.toFixed(1)}s)` : 'Lock current frame'}
              dotActive={hasLockedFrame}
              lockedTimestamp={lockedTimestamp}
            />
          </div>
        )}

        {showPlayOverlay && isVideo && !hoverPreviewEnabled && (
          <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
              <ThemedIcon name="play" size={12} variant="default" className="text-white" />
            </div>
          </div>
        )}

        {/* Status indicator */}
        {isLocalOnly && (
          <div className="absolute right-1.5 top-1.5 z-10">
            <div className="w-6 h-6 rounded-full bg-amber-500/80 flex items-center justify-center" title="Local only - not synced to provider">
              <ThemedIcon name="alertTriangle" size={12} variant="default" className="text-white" />
            </div>
          </div>
        )}

        {/* Remove button - top right, tiny */}
        {showRemoveButton && onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute right-1 top-1 w-4 h-4 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors z-20 opacity-70 hover:opacity-100"
            title="Remove"
          >
            <ThemedIcon name="close" size={8} variant="default" className="text-white" />
          </button>
        )}

        {/* Navigation pill - bottom center */}
        {currentIndex !== undefined && totalCount !== undefined && totalCount > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 z-20">
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
              className="fixed inset-0"
              style={{ zIndex: 99998 }}
              onClick={() => { setShowQueueGrid(false); setPopupPosition(null); }}
            />
            {/* Grid using fixed position with edge detection */}
            <div
              className="fixed p-2 bg-neutral-900 rounded-lg shadow-2xl border border-neutral-600"
              style={{
                zIndex: 99999,
                display: 'grid',
                gridTemplateColumns: `repeat(${queueItems.length <= 4 ? 2 : queueItems.length <= 9 ? 3 : 4}, 80px)`,
                gap: '6px',
                left: popupPosition.x,
                top: popupPosition.showAbove ? undefined : popupPosition.y,
                bottom: popupPosition.showAbove ? window.innerHeight - popupPosition.y : undefined,
                transform: 'translateX(-50%)',
              }}
            >
              {queueItems.map((item, idx) => (
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
                      ? 'ring-2 ring-blue-500'
                      : 'hover:ring-1 hover:ring-white/50'
                  }`}
                >
                  <QueueThumbnail url={item.thumbnailUrl} alt={`Asset ${idx + 1}`} />
                  <span className="absolute bottom-0 right-0 bg-black/80 text-white text-[11px] px-1.5 py-0.5 rounded-tl font-medium">
                    {idx + 1}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
      </div>

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
