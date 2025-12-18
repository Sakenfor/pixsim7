/**
 * MediaDisplay
 *
 * Renders the actual media (image or video) with zoom and fit mode applied.
 */

import { useRef } from 'react';
import type { ViewerAsset } from '@features/assets';
import type { ViewerSettings } from '../types';

export type FitMode = 'contain' | 'cover' | 'actual' | 'fill';

interface MediaDisplayProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
  fitMode: FitMode;
  zoom: number;
}

export function MediaDisplay({ asset, settings, fitMode, zoom }: MediaDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaUrl = asset.fullUrl || asset.url;

  const getFitClass = () => {
    switch (fitMode) {
      case 'contain': return 'max-w-full max-h-full object-contain';
      case 'cover': return 'w-full h-full object-cover';
      case 'actual': return 'object-none';
      case 'fill': return 'w-full h-full object-fill';
      default: return 'max-w-full max-h-full object-contain';
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-2 min-h-0 bg-neutral-50 dark:bg-neutral-950 overflow-auto">
      {asset.type === 'video' ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          className={`${getFitClass()} rounded-lg`}
          style={{ transform: `scale(${zoom / 100})` }}
          controls
          autoPlay={settings.autoPlayVideos}
          loop={settings.loopVideos}
        />
      ) : (
        <img
          src={mediaUrl}
          alt={asset.name}
          className={`${getFitClass()} rounded-lg`}
          style={{ transform: `scale(${zoom / 100})` }}
        />
      )}
    </div>
  );
}
