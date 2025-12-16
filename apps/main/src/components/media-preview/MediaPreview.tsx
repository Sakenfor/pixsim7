import { useEffect, useState, useRef } from 'react';
import { getAsset } from '@lib/api/assets';

export interface MediaPreviewProps {
  /** Asset ID for fetching media */
  assetId: number;
  /** Media type */
  type: 'video' | 'image' | 'audio';
  /** Optional direct URL (if provided, skips asset lookup) */
  url?: string;
}

/**
 * Media preview component for displaying full media in modal
 *
 * Renders video, image, or audio player based on media type.
 */
export function MediaPreview({ assetId, type, url }: MediaPreviewProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(url || null);
  const [loading, setLoading] = useState(!url);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch asset URL from API
  useEffect(() => {
    if (url) return; // Skip if URL provided directly

    const fetchAsset = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch asset using typed API wrapper
        const asset = await getAsset(assetId);

        // Use remote URL if available, fallback to file_url, or use file endpoint
        const assetUrl = asset.remote_url || asset.file_url || `/api/v1/assets/${assetId}/file`;
        setMediaUrl(assetUrl);
        setLoading(false);
      } catch (err) {
        console.error('[MediaPreview] Failed to fetch asset:', err);
        setError('Failed to load media asset');
        setLoading(false);
      }
    };

    fetchAsset();
  }, [assetId, url]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading media...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-2">⚠️ {error}</p>
          <p className="text-xs text-neutral-500">Asset ID: {assetId}</p>
        </div>
      </div>
    );
  }

  // No media URL available
  if (!mediaUrl) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-neutral-600 dark:text-neutral-400">No media URL available</p>
      </div>
    );
  }

  // Render media based on type
  switch (type) {
    case 'video':
      return (
        <div className="aspect-video w-full bg-black">
          <video
            ref={videoRef}
            src={mediaUrl}
            controls
            autoPlay
            className="w-full h-full"
            onError={() => setError('Failed to load video')}
          >
            Your browser does not support video playback.
          </video>
        </div>
      );

    case 'audio':
      return (
        <div className="p-4">
          <div className="flex flex-col items-center justify-center p-8 bg-neutral-100 dark:bg-neutral-800 rounded">
            <span className="text-6xl mb-4">🎵</span>
            <audio
              ref={audioRef}
              src={mediaUrl}
              controls
              autoPlay
              className="w-full max-w-md"
              onError={() => setError('Failed to load audio')}
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        </div>
      );

    case 'image':
      return (
        <div className="flex items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-900">
          <img
            src={mediaUrl}
            alt="Preview"
            className="max-w-full max-h-[70vh] object-contain rounded"
            onError={() => setError('Failed to load image')}
          />
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-center p-8">
          <p className="text-neutral-600 dark:text-neutral-400">
            Unsupported media type: {type}
          </p>
        </div>
      );
  }
}
