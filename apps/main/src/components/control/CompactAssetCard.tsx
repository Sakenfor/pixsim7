import { useRef, useState } from 'react';
import { ThemedIcon } from '@/lib/icons';
import { useHoverScrubVideo } from '@/hooks/useHoverScrubVideo';
import { useMediaThumbnail } from '@/hooks/useMediaThumbnail';
import type { AssetSummary } from '@/hooks/useAssets';

export interface CompactAssetCardProps {
  asset: AssetSummary;
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
}: CompactAssetCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Use thumbnail_url from AssetSummary
  const thumbUrl = asset.thumbnail_url;

  // Shared hooks from MediaCard
  const thumbSrc = useMediaThumbnail(thumbUrl);
  const hover = useHoverScrubVideo(videoRef);

  const isVideo = asset.media_type === 'video';
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

  const isLocalOnly = asset.provider_status === 'local_only' || !asset.remote_url;
  const statusColor = isLocalOnly
    ? 'border-amber-300 dark:border-amber-700'
    : 'border-green-300 dark:border-green-700';

  return (
    <div
      className={`relative rounded-md border-2 ${statusColor} bg-white dark:bg-neutral-900 overflow-hidden ${fillHeight ? 'h-full flex flex-col' : ''} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {label && (
        <div className="absolute top-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-0.5 z-10 font-medium">
          {label}
        </div>
      )}

      <div
        ref={hover.containerRef}
        className={`relative bg-neutral-100 dark:bg-neutral-800 ${
          fillHeight ? 'h-full' : (asset.media_type === 'video' ? 'aspect-video' : 'aspect-square')
        }`}
        onMouseEnter={asset.media_type === 'video' ? hover.onMouseEnter : undefined}
        onMouseLeave={asset.media_type === 'video' ? hover.onMouseLeave : undefined}
        onMouseMove={asset.media_type === 'video' ? hover.onMouseMove : undefined}
      >
        {thumbSrc && (
          asset.media_type === 'video' ? (
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
        {asset.media_type === 'video' && hover.hasStartedPlaying && !hasLockedFrame && (
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
