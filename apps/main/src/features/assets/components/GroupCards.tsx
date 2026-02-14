import { useMemo } from 'react';

import type { AssetGroupMeta } from '@lib/api/assets';
import { Icon } from '@lib/icons';

import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';
import { useMediaThumbnail } from '@/hooks/useMediaThumbnail';

import type { AssetModel } from '../hooks/useAssets';
import { getAssetDisplayUrls } from '../models/asset';

import { selectGroupPreviewAssets } from './groupHelpers';
import type { AssetGroup } from './groupHelpers';

// ---------------------------------------------------------------------------
// GroupFolderTile
// ---------------------------------------------------------------------------

export function GroupFolderTile({
  group,
  cardSize,
  onOpen,
}: {
  group: AssetGroup;
  cardSize: number;
  onOpen: () => void;
}) {
  const tileHeight = Math.max(160, Math.round(cardSize * 0.75));
  const previewAssets = useMemo(() => {
    return selectGroupPreviewAssets(group.previewAssets);
  }, [group.previewAssets]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-blue-400 dark:hover:border-blue-400 transition-colors overflow-hidden text-left"
      style={{ height: tileHeight }}
      title={group.label}
    >
      <div className="grid grid-cols-2 grid-rows-2 gap-1 p-2 h-full">
        {Array.from({ length: 4 }).map((_, index) => (
          <GroupPreviewCell
            key={index}
            asset={previewAssets[index]}
          />
        ))}
      </div>
      <div className="absolute inset-x-2 bottom-2 px-2 py-1 rounded bg-white/90 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-700">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
          {group.label}
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {group.count} items
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// GroupListRow
// ---------------------------------------------------------------------------

export function GroupListRow({
  group,
  cardSize,
  onOpen,
}: {
  group: AssetGroup;
  cardSize: number;
  onOpen: () => void;
}) {
  const previewAssets = useMemo(() => {
    return selectGroupPreviewAssets(group.previewAssets);
  }, [group.previewAssets]);
  const previewSize = Math.max(56, Math.round(cardSize * 0.28));
  const infoLine = useMemo(() => {
    const parts: string[] = [];
    const meta = group.meta;
    if (meta && meta.kind === 'prompt') {
      if (meta.family_title) parts.push(meta.family_title);
      if (meta.version_number !== null && meta.version_number !== undefined) {
        parts.push(`v${meta.version_number}`);
      }
      if (meta.author) parts.push(meta.author);
      if (meta.commit_message) {
        const trimmed = meta.commit_message.trim();
        if (trimmed) {
          parts.push(trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed);
        }
      }
    } else if (meta && meta.kind === 'generation') {
      if (meta.provider_id) parts.push(meta.provider_id);
      if (meta.operation_type) parts.push(meta.operation_type.replace(/_/g, ' '));
      if (meta.status) parts.push(meta.status);
    } else if (meta && meta.kind === 'sibling') {
      if (meta.provider_id) parts.push(meta.provider_id);
      if (meta.operation_type) parts.push(meta.operation_type.replace(/_/g, ' '));
      if (meta.status) parts.push(meta.status);
    } else if (meta && meta.kind === 'source') {
      parts.push(`Asset #${meta.asset_id}`);
      if (meta.media_type) parts.push(meta.media_type);
    }

    parts.push(`${group.count} items`);
    return parts.filter(Boolean).join(' \u2022 ');
  }, [group.count, group.meta]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60 hover:border-blue-400 dark:hover:border-blue-400 transition-colors px-3 py-3 text-left"
      title={group.label}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <GroupMetaThumb meta={group.meta} size={previewSize} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2">
              {group.label}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
              {infoLine}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <GroupPreviewCell
              key={index}
              asset={previewAssets[index]}
              size={previewSize}
            />
          ))}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// GroupMetaThumb
// ---------------------------------------------------------------------------

export function GroupMetaThumb({
  meta,
  size,
}: {
  meta?: AssetGroupMeta | null;
  size: number;
}) {
  const isSource = meta?.kind === 'source';
  const fallbackThumb = isSource
    ? meta.thumbnail_url ?? meta.preview_url ?? meta.remote_url ?? undefined
    : undefined;
  const thumbSrc = useMediaThumbnail(
    fallbackThumb,
    isSource ? meta.preview_url ?? undefined : undefined,
    isSource ? meta.remote_url ?? undefined : undefined,
    { preferPreview: true },
  );

  if (!isSource) {
    return null;
  }

  return (
    <div
      className="flex-none rounded bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
      style={{ width: size, height: size }}
    >
      {thumbSrc ? (
        <img src={thumbSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupPreviewCell
// ---------------------------------------------------------------------------

export function GroupPreviewCell({ asset, size }: { asset?: AssetModel; size?: number }) {
  const urls = useMemo(() => {
    if (!asset) {
      return { mainUrl: undefined, thumbnailUrl: undefined, previewUrl: undefined };
    }
    return getAssetDisplayUrls(asset);
  }, [asset]);

  const isVideo = asset?.mediaType === 'video';
  const { thumbSrc, thumbLoading, thumbFailed, videoSrc, usePosterImage } = useMediaPreviewSource({
    mediaType: asset?.mediaType ?? 'image',
    thumbUrl: urls.thumbnailUrl,
    previewUrl: urls.previewUrl,
    remoteUrl: urls.mainUrl ?? asset?.remoteUrl ?? asset?.fileUrl,
  });
  const showPoster = isVideo && usePosterImage && !!thumbSrc && !thumbFailed;
  const showImage = !isVideo && !!thumbSrc && !thumbFailed;
  const showVideo = isVideo && !!videoSrc && !showPoster;

  return (
    <div
      className="w-full h-full rounded bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
      style={size ? { width: size, height: size } : undefined}
    >
      {showPoster ? (
        <img
          src={thumbSrc}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : showImage ? (
        <img
          src={thumbSrc}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : showVideo ? (
        <video
          src={videoSrc}
          poster={thumbSrc}
          className="w-full h-full object-cover"
          preload="metadata"
          muted
          playsInline
        />
      ) : thumbLoading ? (
        <div className="w-full h-full flex items-center justify-center text-neutral-400 dark:text-neutral-500">
          <div className="w-4 h-4 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-neutral-400 dark:text-neutral-500">
          <Icon
            name={asset?.mediaType === 'video' ? 'video' : 'image'}
            size={16}
            variant="subtle"
          />
        </div>
      )}
    </div>
  );
}
