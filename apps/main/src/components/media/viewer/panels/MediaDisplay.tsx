/**
 * MediaDisplay
 *
 * Renders the actual media (image or video) with zoom and fit mode applied.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { useAutoContextMenu } from '@lib/dockview';


import type { ViewerAsset } from '@features/assets';
import { CAP_ASSET, useProvideCapability } from '@features/contextHub';

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';

import type { ViewerSettings } from '../types';

export type FitMode = 'contain' | 'cover' | 'actual' | 'fill';

interface MediaDisplayProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
  fitMode: FitMode;
  zoom: number;
  videoRef?: RefObject<HTMLVideoElement>;
  imageRef?: RefObject<HTMLImageElement>;
}

export function MediaDisplay({ asset, settings, fitMode, zoom, videoRef, imageRef }: MediaDisplayProps) {
  const fallbackVideoRef = useRef<HTMLVideoElement>(null);
  const fallbackImageRef = useRef<HTMLImageElement>(null);
  const resolvedVideoRef = videoRef ?? fallbackVideoRef;
  const resolvedImageRef = imageRef ?? fallbackImageRef;
  const mediaUrl = asset.fullUrl || asset.url;
  const { mediaSrc } = useResolvedAssetMedia({ mediaUrl });
  const resolvedMediaUrl = mediaSrc;
  const [videoReady, setVideoReady] = useState(asset.type !== 'video');

  useEffect(() => {
    setVideoReady(asset.type !== 'video');
  }, [asset.id, asset.type, resolvedMediaUrl]);

  // Provide asset capability for context menu actions
  const assetProvider = useMemo(() => ({
    id: 'viewer-asset',
    getValue: () => asset,
    isAvailable: () => !!asset,
    exposeToContextMenu: true,
  }), [asset]);
  useProvideCapability(CAP_ASSET, assetProvider, [assetProvider]);

  // Auto-register context menu for the displayed asset
  const contextMenuProps = useAutoContextMenu('viewer-asset', asset, {
    labelField: 'name',
    computeFields: (a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      url: a.url,
      fullUrl: a.fullUrl,
      source: a.source,
      sourceGenerationId: a.sourceGenerationId,
    }),
    includeFullObject: true,
  });

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
    <div
      className="flex-1 flex items-center justify-center p-2 min-h-0 bg-neutral-50 dark:bg-neutral-950 overflow-auto"
      {...contextMenuProps}
    >
      {asset.type === 'video' ? (
        <div className="relative">
          <video
            ref={resolvedVideoRef}
            src={resolvedMediaUrl}
            className={`${getFitClass()} rounded-lg transition-opacity ${videoReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ transform: `scale(${zoom / 100})` }}
            controls={videoReady}
            autoPlay={settings.autoPlayVideos}
            loop={settings.loopVideos}
            preload="metadata"
            playsInline
            onLoadedMetadata={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
          />
          {!videoReady && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-neutral-100/70 dark:bg-neutral-900/70 pointer-events-none">
              <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <img
          ref={resolvedImageRef}
          src={resolvedMediaUrl}
          alt={asset.name}
          className={`${getFitClass()} rounded-lg`}
          style={{ transform: `scale(${zoom / 100})` }}
          draggable={false}
        />
      )}
    </div>
  );
}
