import { useState } from 'react';
import { Modal } from '@pixsim7/shared.ui';
import { MediaPreview } from './MediaPreview';

export interface MediaThumbnailProps {
  /** Asset ID for fetching media */
  assetId: number;
  /** Media type */
  type: 'video' | 'image' | 'audio';
  /** Optional thumbnail URL (if not provided, will try to generate) */
  thumbnailUrl?: string;
  /** Optional duration in seconds (for video/audio) */
  duration?: number;
  /** Optional CSS class name */
  className?: string;
  /** Show play icon overlay */
  showPlayIcon?: boolean;
}

/**
 * Media thumbnail with quick preview modal
 *
 * Displays a thumbnail for video/image/audio assets with click-to-preview functionality.
 * Uses shared Modal component from @pixsim7/shared.ui for preview display.
 */
export function MediaThumbnail({
  assetId,
  type,
  thumbnailUrl,
  duration,
  className = '',
  showPlayIcon = true,
}: MediaThumbnailProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [imageError, setImageError] = useState(false);

  /**
   * Format duration from seconds to MM:SS format
   */
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Get fallback icon based on media type
   */
  const getFallbackIcon = (): string => {
    switch (type) {
      case 'video':
        return '🎥';
      case 'audio':
        return '🎵';
      case 'image':
        return '🖼️';
      default:
        return '📄';
    }
  };

  return (
    <>
      {/* Thumbnail */}
      <div
        className={`relative cursor-pointer group overflow-hidden rounded ${className}`}
        onClick={() => setShowPreview(true)}
        title="Click to preview"
      >
        {/* Thumbnail image or fallback */}
        {type === 'video' && thumbnailUrl && !imageError ? (
          <img
            src={thumbnailUrl}
            alt="Video thumbnail"
            className="w-full h-20 object-cover"
            onError={() => setImageError(true)}
          />
        ) : type === 'image' && thumbnailUrl && !imageError ? (
          <img
            src={thumbnailUrl}
            alt="Image thumbnail"
            className="w-full h-20 object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          // Fallback for audio or when thumbnail fails to load
          <div className="w-full h-20 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
            <span className="text-4xl">{getFallbackIcon()}</span>
          </div>
        )}

        {/* Duration overlay (for video/audio) */}
        {duration !== undefined && (
          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(duration)}
          </span>
        )}

        {/* Play icon overlay on hover */}
        {showPlayIcon && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <span className="text-white text-3xl">▶️</span>
          </div>
        )}

        {/* Media type badge */}
        <span className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded uppercase">
          {type}
        </span>
      </div>

      {/* Quick preview modal */}
      {showPreview && (
        <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Media Preview">
          <MediaPreview assetId={assetId} type={type} />
        </Modal>
      )}
    </>
  );
}
