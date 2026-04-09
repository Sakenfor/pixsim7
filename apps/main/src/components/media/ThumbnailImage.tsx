/**
 * ThumbnailImage
 *
 * Shared thumbnail renderer with loading spinner and retry UI.
 * Used by MediaCard and CompactAssetCard for consistent loading states.
 */

import { Icon } from '@lib/icons';

export interface ThumbnailImageProps {
  src: string | undefined;
  alt: string;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function ThumbnailImage({ src, alt, loading, failed, onRetry, className }: ThumbnailImageProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className ?? 'w-full h-full object-cover'}
        loading="lazy"
      />
    );
  }

  if (failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-800">
        <Icon name="alert-circle" className="w-6 h-6 text-neutral-400" />
        {onRetry && (
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="px-2 py-1 text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return null;
}
