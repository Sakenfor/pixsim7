/**
 * MediaDisplay
 *
 * Renders the actual media (image or video) with zoom and fit mode applied.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { BACKEND_BASE } from '@lib/api/client';
import { useAutoContextMenu } from '@lib/dockview';
import { ensureBackendAbsolute } from '@lib/media/backendUrl';

import type { ViewerAsset } from '@features/assets';
import { registerActiveVideo } from '@features/assets/lib/activeVideoRegistry';
import { CAP_ASSET, useProvideCapability } from '@features/contextHub';

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';

import type { ViewerSettings } from '../types';

export type FitMode = 'contain' | 'cover' | 'actual' | 'fill';

interface MediaDisplayProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
  fitMode: FitMode;
  zoom: number;
  pan: { x: number; y: number };
  videoRef?: RefObject<HTMLVideoElement>;
  imageRef?: RefObject<HTMLImageElement>;
}

function isLikelyVideoUrl(url: string | undefined): boolean {
  if (!url) return false;
  const lowered = url.toLowerCase();
  if (lowered.startsWith('blob:') || lowered.startsWith('data:video')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|avi)(?:$|[?#])/.test(lowered);
}

export function MediaDisplay({ asset, settings, fitMode, zoom, pan, videoRef, imageRef }: MediaDisplayProps) {
  const fallbackVideoRef = useRef<HTMLVideoElement>(null);
  const fallbackImageRef = useRef<HTMLImageElement>(null);
  const resolvedVideoRef = videoRef ?? fallbackVideoRef;
  const resolvedImageRef = imageRef ?? fallbackImageRef;
  const remoteModelUrl = useMemo(
    () => ensureBackendAbsolute(asset._assetModel?.remoteUrl ?? undefined, BACKEND_BASE),
    [asset._assetModel?.remoteUrl],
  );
  const videoCandidates = useMemo(() => {
    if (asset.type !== 'video') return [] as string[];
    const candidates = [
      asset.fullUrl,
      remoteModelUrl,
      isLikelyVideoUrl(asset.url) ? asset.url : undefined,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
    return Array.from(new Set(candidates));
  }, [asset.type, asset.fullUrl, asset.url, remoteModelUrl]);
  const [videoCandidateIndex, setVideoCandidateIndex] = useState(0);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const mediaUrl = asset.type === 'video'
    ? videoCandidates[videoCandidateIndex]
    : (asset.fullUrl || asset.url);
  const { mediaSrc } = useResolvedAssetMedia({ mediaUrl });
  const resolvedMediaUrl = mediaSrc;
  const [videoReady, setVideoReady] = useState(asset.type !== 'video');

  useEffect(() => {
    setVideoReady(asset.type !== 'video');
    setVideoLoadFailed(false);
    setVideoCandidateIndex(0);
  }, [asset.id, asset.type]);

  useEffect(() => {
    if (asset.type !== 'video') return;
    // Only hide/reset readiness when the resolved playback source changes.
    // Asset metadata updates can mutate URL candidates without changing src.
    setVideoReady(false);
    setVideoLoadFailed(false);
  }, [asset.type, resolvedMediaUrl]);

  useEffect(() => {
    if (asset.type === 'video' && videoCandidates.length === 0) {
      setVideoReady(false);
      setVideoLoadFailed(true);
    }
  }, [asset.type, videoCandidates.length]);

  useEffect(() => {
    if (asset.type !== 'video') return;
    if (videoCandidateIndex < videoCandidates.length) return;
    setVideoCandidateIndex(0);
  }, [asset.type, videoCandidateIndex, videoCandidates.length]);

  useEffect(() => {
    if (asset.type !== 'video') return;
    const el = resolvedVideoRef.current;
    if (!el) return;
    return registerActiveVideo('viewer:main', el, asset.id);
  }, [asset.id, asset.type, resolvedVideoRef, videoReady]);

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
      className="flex-1 flex items-center justify-center p-2 min-h-0 bg-neutral-50 dark:bg-neutral-950 overflow-hidden"
      {...contextMenuProps}
    >
      {asset.type === 'video' ? (
        <div className="relative">
          <video
            ref={resolvedVideoRef}
            src={resolvedMediaUrl}
            className={`${getFitClass()} rounded-lg transition-opacity ${videoReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})` }}
            controls={videoReady}
            autoPlay={settings.autoPlayVideos}
            loop={settings.loopVideos}
            preload="metadata"
            playsInline
            onLoadedMetadata={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            onError={() => {
              if (videoCandidateIndex < videoCandidates.length - 1) {
                setVideoReady(false);
                setVideoLoadFailed(false);
                setVideoCandidateIndex((idx) => idx + 1);
                return;
              }
              setVideoLoadFailed(true);
              setVideoReady(false);
            }}
          />
          {!videoReady && !videoLoadFailed && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-neutral-100/70 dark:bg-neutral-900/70 pointer-events-none">
              <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {videoLoadFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-neutral-100/80 dark:bg-neutral-900/80">
              <span className="text-xs text-neutral-700 dark:text-neutral-200">Video failed to load</span>
              <button
                type="button"
                className="rounded bg-neutral-200 px-2 py-1 text-xs text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
                onClick={() => {
                  setVideoCandidateIndex(0);
                  setVideoLoadFailed(false);
                  setVideoReady(false);
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      ) : (
        <img
          ref={resolvedImageRef}
          src={resolvedMediaUrl}
          alt={asset.name}
          className={`${getFitClass()} rounded-lg`}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})` }}
          draggable={false}
        />
      )}
    </div>
  );
}
