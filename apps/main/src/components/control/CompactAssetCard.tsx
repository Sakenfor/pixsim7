import { useState, useEffect, useRef } from 'react';
import { ThemedIcon } from '../../lib/icons';
import { BACKEND_BASE } from '../../lib/api/client';
import type { AssetSummary } from '../../hooks/useAssets';

export interface CompactAssetCardProps {
  asset: AssetSummary;
  onRemove?: () => void;
  showRemoveButton?: boolean;
  className?: string;
  label?: string;
}

/**
 * CompactAssetCard - A smaller, simplified version of MediaCard
 * for use in QuickGenerateModule to show selected/queued assets.
 */
export function CompactAssetCard({
  asset,
  onRemove,
  showRemoveButton = false,
  className = '',
  label,
}: CompactAssetCardProps) {
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Cleanup any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!asset.thumb_url) {
      setThumbSrc(undefined);
      return;
    }

    // Public absolute URL or blob URL
    if (
      asset.thumb_url.startsWith('http://') ||
      asset.thumb_url.startsWith('https://') ||
      asset.thumb_url.startsWith('blob:')
    ) {
      setThumbSrc(asset.thumb_url);
      return;
    }

    const fullUrl = asset.thumb_url.startsWith('/')
      ? `${BACKEND_BASE}${asset.thumb_url}`
      : `${BACKEND_BASE}/${asset.thumb_url}`;

    const token = localStorage.getItem('access_token');

    // If no token, fall back to using the URL directly
    if (!token) {
      setThumbSrc(fullUrl);
      return;
    }

    (async () => {
      try {
        const res = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setThumbSrc(fullUrl);
          return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        if (!cancelled) {
          setThumbSrc(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setThumbSrc(fullUrl);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset.thumb_url]);

  const isLocalOnly = asset.provider_status === 'local_only' || !asset.remote_url;
  const statusColor = isLocalOnly
    ? 'border-amber-300 dark:border-amber-700'
    : 'border-green-300 dark:border-green-700';

  return (
    <div className={`relative rounded-md border-2 ${statusColor} bg-white dark:bg-neutral-900 overflow-hidden ${className}`}>
      {label && (
        <div className="absolute top-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-0.5 z-10 font-medium">
          {label}
        </div>
      )}

      <div className={`relative ${asset.media_type === 'video' ? 'aspect-video' : 'aspect-square'} bg-neutral-100 dark:bg-neutral-800`}>
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

        {/* Media type icon */}
        <div className="absolute left-1.5 top-1.5">
          <div className="w-6 h-6 rounded-full bg-white/90 dark:bg-neutral-800/90 flex items-center justify-center text-xs">
            <ThemedIcon
              name={asset.media_type === 'video' ? 'video' : 'image'}
              size={12}
              variant="default"
            />
          </div>
        </div>

        {/* Status indicator */}
        {isLocalOnly && (
          <div className="absolute right-1.5 top-1.5">
            <div className="w-6 h-6 rounded-full bg-amber-500/80 flex items-center justify-center" title="Local only - not synced to provider">
              <ThemedIcon name="alertTriangle" size={12} variant="default" className="text-white" />
            </div>
          </div>
        )}

        {/* Remove button */}
        {showRemoveButton && onRemove && (
          <button
            onClick={onRemove}
            className="absolute right-1.5 bottom-1.5 w-6 h-6 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
            title="Remove asset"
          >
            <ThemedIcon name="close" size={12} variant="default" className="text-white" />
          </button>
        )}
      </div>

      {/* Footer with basic info */}
      <div className="px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
        <div className="truncate font-medium">{asset.provider_asset_id || `ID: ${asset.id}`}</div>
        {isLocalOnly && (
          <div className="text-amber-600 dark:text-amber-400 text-[9px]">⚠ Not synced to provider</div>
        )}
      </div>
    </div>
  );
}
