/**
 * RecentStripPanel
 *
 * Horizontal filmstrip of the active scope's assets, shown below the media
 * preview in the asset viewer. Click a thumbnail to jump to it; newly arrived
 * assets that were suppressed by the follow-latest gate (e.g. while a video
 * was playing) pulse until the user navigates to them.
 *
 * Thumbnails participate in the 'strip' gesture surface — users configure
 * swipe actions in Settings → Recent Strip.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useContextMenuItem } from '@lib/dockview';
import { useCardGestures } from '@lib/gestures';
import { Icon } from '@lib/icons';

import { archiveAsset } from '@lib/api/assets';
import { useAssetViewerStore, type ViewerAsset } from '@features/assets';
import { toggleFavoriteTag } from '@features/assets/lib/favoriteTag';
import { getAssetDisplayUrls } from '@features/assets/models/asset';

import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';

import type { ViewerPanelContext } from '../types';

interface RecentStripPanelProps {
  context?: ViewerPanelContext;
  panelId: string;
}

interface StripThumbProps {
  asset: ViewerAsset;
  index: number;
  isActive: boolean;
  isPending: boolean;
  activeRef?: React.Ref<HTMLButtonElement>;
  onClick: (index: number) => void;
}

function StripThumb({ asset, index, isActive, isPending, activeRef, onClick }: StripThumbProps) {
  const model = asset._assetModel;
  const urls = model
    ? getAssetDisplayUrls(model)
    : { thumbnailUrl: asset.url, previewUrl: undefined, mainUrl: asset.fullUrl };
  const { thumbSrc, thumbFailed } = useMediaPreviewSource({
    mediaType: model?.mediaType ?? (asset.type === 'video' ? 'video' : 'image'),
    thumbUrl: urls.thumbnailUrl,
    previewUrl: urls.previewUrl,
    remoteUrl: urls.mainUrl,
    mediaActive: false,
  });

  const numericId = typeof asset.id === 'number' ? asset.id : Number(asset.id) || 0;
  const onToggleFavorite = useCallback(() => {
    if (model) void toggleFavoriteTag(model);
  }, [model]);
  const gestureActions = useMemo(
    () => ({
      onArchive: model ? () => void archiveAsset(model.id, true) : undefined,
    }),
    [model],
  );

  const { gestureHandlers, isCommitted, direction, actionLabel, isReturning, returningActionLabel } =
    useCardGestures({
      id: numericId,
      surfaceId: 'strip',
      onToggleFavorite,
      actions: gestureActions,
    });

  const committedBadge = isReturning
    ? returningActionLabel
    : isCommitted
    ? actionLabel
    : null;

  const contextMenuAttrs = useContextMenuItem(
    'asset-card',
    asset.id,
    {
      id: asset.id,
      name: asset.name,
      asset: model ?? asset,
      'viewer-asset': asset,
    },
    [asset.id, asset.name, asset, model],
  );

  return (
    <button
      ref={activeRef}
      type="button"
      {...contextMenuAttrs}
      onClick={() => onClick(index)}
      onPointerDown={gestureHandlers.onPointerDown}
      className={[
        'relative flex-shrink-0 h-full aspect-square rounded overflow-hidden',
        'border-2 transition-colors bg-neutral-200 dark:bg-neutral-800',
        isActive
          ? 'border-blue-500'
          : 'border-transparent hover:border-neutral-400 dark:hover:border-neutral-500',
        isPending && !isActive ? 'ring-2 ring-blue-400 animate-pulse' : '',
        isCommitted ? 'ring-2 ring-emerald-400' : '',
      ].join(' ')}
      title={asset.name}
    >
      {thumbSrc && !thumbFailed ? (
        <img
          src={thumbSrc}
          alt={asset.name}
          loading="lazy"
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <span className="flex items-center justify-center w-full h-full text-neutral-500">
          <Icon name={asset.type === 'video' ? 'video' : 'image'} size={14} />
        </span>
      )}
      {asset.type === 'video' && thumbSrc && !thumbFailed && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 py-0.5 text-white flex items-center">
          <Icon name="video" size={8} color="#fff" />
        </span>
      )}
      {committedBadge && (
        <span
          className={[
            'absolute inset-x-0 bottom-0 px-1 py-0.5 text-[9px] font-medium text-white text-center truncate',
            isReturning ? 'bg-neutral-600/80' : 'bg-emerald-600/90',
          ].join(' ')}
        >
          {isReturning ? `↩ ${committedBadge}` : `${direction} · ${committedBadge}`}
        </span>
      )}
    </button>
  );
}

export function RecentStripPanel(_props: RecentStripPanelProps) {
  const scopes = useAssetViewerStore((s) => s.scopes);
  const activeScopeId = useAssetViewerStore((s) => s.activeScopeId);
  const currentAsset = useAssetViewerStore((s) => s.currentAsset);
  const pendingHeadId = useAssetViewerStore((s) => s.pendingHeadId);
  const navigateTo = useAssetViewerStore((s) => s.navigateTo);

  const assets: ViewerAsset[] = useMemo(
    () => (activeScopeId ? scopes[activeScopeId]?.assets ?? [] : []),
    [scopes, activeScopeId],
  );

  const currentId = currentAsset?.id;
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [currentId]);

  // Wheel-to-navigate: latest values via refs so the listener attaches once.
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let accum = 0;
    const STEP = 40;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      accum += delta;
      const list = assetsRef.current;
      while (Math.abs(accum) >= STEP) {
        const dir = accum > 0 ? 1 : -1;
        accum -= dir * STEP;
        const idx = list.findIndex((a) => a.id === currentIdRef.current);
        const next = (idx >= 0 ? idx : 0) + dir;
        if (next < 0 || next >= list.length) {
          accum = 0;
          break;
        }
        navigateTo(next);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [navigateTo]);

  return (
    <div ref={wrapperRef} className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {assets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-neutral-500">
          No recent assets yet
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
          <div className="flex items-center gap-1.5 h-full p-1.5">
            {assets.map((asset, index) => {
              const isActive = asset.id === currentId;
              const isPending = asset.id === pendingHeadId;
              return (
                <StripThumb
                  key={asset.id}
                  asset={asset}
                  index={index}
                  isActive={isActive}
                  isPending={isPending}
                  activeRef={isActive ? activeItemRef : undefined}
                  onClick={navigateTo}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
