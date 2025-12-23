import { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ThemedIcon } from '@lib/icons';
import { useHoverScrubVideo } from '@/hooks/useHoverScrubVideo';
import { useMediaThumbnail } from '@/hooks/useMediaThumbnail';
import { useContextMenuItem } from '@lib/dockview/contextMenu';
import type { AssetModel } from '@features/assets';

export interface ThumbnailGridItem {
  id: string | number;
  thumbnailUrl: string;
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
}

/**
 * CompactAssetCard - A smaller, simplified version of MediaCard
 * for use in QuickGenerateModule to show selected/queued assets.
 * Reuses shared hooks for thumbnail loading and video hover scrubbing.
 * Supports frame locking for video assets used in image_to_video/transition.
 */
export function CompactAssetCard({
  asset,
  onRemove,
  showRemoveButton = false,
  className = '',
  label,
  lockedTimestamp,
  onLockTimestamp,
  selected = false,
  onSelect,
  hideFooter = false,
  fillHeight = false,
  currentIndex,
  totalCount,
  onNavigatePrev,
  onNavigateNext,
  queueItems,
  onSelectIndex,
}: CompactAssetCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showQueueGrid, setShowQueueGrid] = useState(false);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);

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

  // Use thumbnailUrl from AssetModel
  const thumbUrl = asset.thumbnailUrl;

  // Shared hooks from MediaCard
  const thumbSrc = useMediaThumbnail(thumbUrl, asset.previewUrl, asset.remoteUrl);
  const hover = useHoverScrubVideo(videoRef);

  const isVideo = asset.mediaType === 'video';
  const hasLockedFrame = lockedTimestamp !== undefined;

  // Handle frame lock/unlock
  const handleToggleLock = () => {
    if (!videoRef.current || !onLockTimestamp) return;

    if (hasLockedFrame) {
      // Unlock
      onLockTimestamp(undefined);
    } else {
      // Lock current frame
      const currentTime = videoRef.current.currentTime;
      onLockTimestamp(currentTime);
    }
  };

  const isLocalOnly = asset.providerStatus === 'local_only' || !asset.remoteUrl;
  const statusColor = isLocalOnly
    ? 'border-amber-300 dark:border-amber-700'
    : 'border-green-300 dark:border-green-700';

  // Context menu: combined hook registers data + returns attrs (Pattern B)
  const contextMenuProps = useContextMenuItem('asset', asset.id, {
    id: asset.id,
    name: asset.description || asset.providerAssetId || `Asset ${asset.id}`,
    type: asset.mediaType,
    asset, // full object for actions
    provider: asset.providerId,
    providerAssetId: asset.providerAssetId,
    thumbnailUrl: asset.thumbnailUrl,
    isLocalOnly,
  }, [
    asset.id,
    asset.description,
    asset.providerAssetId,
    asset.mediaType,
    asset.providerId,
    asset.thumbnailUrl,
    asset.providerStatus,
    asset.remoteUrl,
  ]);

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
        ref={hover.containerRef}
        className={`relative bg-neutral-100 dark:bg-neutral-800 ${
          fillHeight ? 'h-full' : (asset.mediaType === 'video' ? 'aspect-video' : 'aspect-square')
        }`}
        onMouseEnter={asset.mediaType === 'video' ? hover.onMouseEnter : undefined}
        onMouseLeave={asset.mediaType === 'video' ? hover.onMouseLeave : undefined}
        onMouseMove={asset.mediaType === 'video' ? hover.onMouseMove : undefined}
      >
        {thumbSrc && (
          asset.mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={thumbSrc}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
              playsInline
            />
          ) : (
            <img
              src={thumbSrc}
              alt={asset.description || `Asset ${asset.id}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )
        )}

        {/* Status indicator */}
        {isLocalOnly && (
          <div className="absolute right-1.5 top-1.5">
            <div className="w-6 h-6 rounded-full bg-amber-500/80 flex items-center justify-center" title="Local only - not synced to provider">
              <ThemedIcon name="alertTriangle" size={12} variant="default" className="text-white" />
            </div>
          </div>
        )}

        {/* Video hover scrub progress bar */}
        {asset.mediaType === 'video' && hover.hasStartedPlaying && !hasLockedFrame && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div className="h-full bg-white/80 transition-all" style={{ width: `${Math.round(hover.progress * 100)}%` }} />
          </div>
        )}

        {/* Locked frame indicator */}
        {hasLockedFrame && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500/30">
            <div
              className="h-full bg-blue-500"
              style={{
                width: `${Math.round((lockedTimestamp / (videoRef.current?.duration || 1)) * 100)}%`
              }}
            />
          </div>
        )}

        {/* Frame lock/unlock button (for videos) */}
        {isVideo && isHovered && onLockTimestamp && (
          <button
            onClick={handleToggleLock}
            className={`absolute left-1.5 bottom-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10 ${
              hasLockedFrame
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-neutral-700/80 hover:bg-neutral-600'
            }`}
            title={hasLockedFrame ? `Frame locked at ${lockedTimestamp?.toFixed(1)}s` : 'Lock current frame'}
          >
            <ThemedIcon name={hasLockedFrame ? 'lock' : 'unlock'} size={12} variant="default" className="text-white" />
          </button>
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
                  <img
                    src={item.thumbnailUrl}
                    alt={`Asset ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
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
          <div className="truncate font-medium">{asset.provider_asset_id || `ID: ${asset.id}`}</div>
          {isLocalOnly && (
            <div className="text-amber-600 dark:text-amber-400 text-[9px]">⚠ Not synced to provider</div>
          )}
        </div>
      )}
    </div>
  );
}
