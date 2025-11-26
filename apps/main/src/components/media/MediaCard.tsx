import { Badge } from '@pixsim7/shared.ui';
import { Button } from '@pixsim7/shared.ui';
import { StatusBadge } from '@pixsim7/shared.ui';
import { ExpandableButtonGroup, ExpandableItem, expandableItemVariants } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHoverScrubVideo } from '../../hooks/useHoverScrubVideo';
import { BACKEND_BASE } from '../../lib/api/client';
import { ThemedIcon } from '../../lib/icons';
import {
  resolveMediaBadgeConfig,
  MEDIA_TYPE_ICON,
  MEDIA_STATUS_ICON,
} from './mediaBadgeConfig';

// Glassmorphism status badge styles with subtle animations
const STATUS_STYLES: Record<'green' | 'yellow' | 'red' | 'gray', {
  base: string;
  hover: string;
  ring: string;
  glow: string;
}> = {
  green: {
    base: 'bg-green-500/20 dark:bg-green-500/30 text-white backdrop-blur-md',
    hover: 'hover:bg-green-500/30 dark:hover:bg-green-500/40',
    ring: 'ring-2 ring-green-500 dark:ring-green-400 ring-offset-1',
    glow: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.4)]',
  },
  yellow: {
    base: 'bg-amber-500/20 dark:bg-amber-500/30 text-white backdrop-blur-md',
    hover: 'hover:bg-amber-500/30 dark:hover:bg-amber-500/40',
    ring: 'ring-2 ring-amber-500 dark:ring-amber-400 ring-offset-1',
    glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]',
  },
  red: {
    base: 'bg-red-500/20 dark:bg-red-500/30 text-white backdrop-blur-md',
    hover: 'hover:bg-red-500/30 dark:hover:bg-red-500/40',
    ring: 'ring-2 ring-red-500 dark:ring-red-400 ring-offset-1',
    glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]',
  },
  gray: {
    base: 'bg-neutral-500/20 dark:bg-neutral-500/30 text-white backdrop-blur-md',
    hover: 'hover:bg-neutral-500/30 dark:hover:bg-neutral-500/40',
    ring: 'ring-2 ring-neutral-500 dark:ring-neutral-400 ring-offset-1',
    glow: 'hover:shadow-[0_0_20px_rgba(115,115,115,0.3)]',
  },
};

const PROVIDER_TEXT_CLASSES: Record<string, string> = {
  pixverse: 'text-purple-700 dark:text-purple-300',
  'pixverse-openapi': 'text-purple-700 dark:text-purple-300',
  leonardo: 'text-amber-700 dark:text-amber-300',
  midjourney: 'text-indigo-700 dark:text-indigo-300',
  dalle: 'text-emerald-700 dark:text-emerald-300',
};

export interface MediaCardActions {
  onOpenDetails?: (id: number) => void;
  onShowMetadata?: (id: number) => void;
  onUploadToProvider?: (id: number) => void;
  // Generation actions
  onAddToGenerate?: (id: number, operation?: string) => void;
  onImageToVideo?: (id: number) => void;
  onVideoExtend?: (id: number) => void;
  onAddToTransition?: (id: number) => void;
}

export interface MediaCardBadgeConfig {
  showPrimaryIcon?: boolean;
  showStatusIcon?: boolean;
  showStatusTextOnHover?: boolean;
  showTagsInOverlay?: boolean;
  showFooterProvider?: boolean;
  showFooterDate?: boolean;
  // Generation actions
  showGenerationBadge?: boolean;
  showGenerationInMenu?: boolean;
  generationQuickAction?: 'auto' | 'image_to_video' | 'video_extend' | 'add_to_transition' | 'none';
}

export interface MediaCardProps {
  id: number;
  mediaType: 'video' | 'image' | 'audio' | '3d_model';
  providerId: string;
  providerAssetId: string;
  thumbUrl: string;
  remoteUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
  tags?: string[];
  description?: string;
  createdAt: string;
  onOpen?: (id: number) => void;
  status?: string;
  providerStatus?: 'ok' | 'local_only' | 'unknown' | 'flagged';
  // Optional upload badge hook: when provided, shows a top-right clickable badge
  onUploadClick?: (id: number) => Promise<{ ok: boolean; note?: string } | void> | void;
  uploadState?: 'idle' | 'uploading' | 'success' | 'error';
  uploadNote?: string;
  // Optional actions for the more-actions menu
  actions?: MediaCardActions;
  // Optional badge configuration for surface-level customization
  badgeConfig?: MediaCardBadgeConfig;
}

export function MediaCard(props: MediaCardProps) {
  const {
    id,
    mediaType,
    providerId,
    providerAssetId: _providerAssetId,
    thumbUrl,
    remoteUrl: _remoteUrl,
    width,
    height,
    durationSec,
    tags = [],
    description,
    createdAt,
    onOpen,
    status,
    providerStatus,
    actions,
    badgeConfig: badgeConfigProp,
  } = props;

  // Resolve badge configuration (memoized for performance)
  const badges = useMemo(
    () => resolveMediaBadgeConfig(mediaType, providerStatus, tags),
    [mediaType, providerStatus, tags]
  );

  // Partition tags into technical vs display tags once per render
  const { technicalTags, displayTags } = useMemo(() => {
    const isTechnical = (tag: string) =>
      tag.includes('_url') ||
      tag.includes('_id') ||
      tag.includes('from_') ||
      tag === 'user_upload';

    const technical = (tags ?? []).filter(isTechnical);
    const display = (tags ?? []).filter(tag => !isTechnical(tag));

    return { technicalTags: technical, displayTags: display };
  }, [tags]);

  // Badge visibility configuration with defaults
  const badgeVisibility = {
    showPrimaryIcon: badgeConfigProp?.showPrimaryIcon ?? true,
    showStatusIcon: badgeConfigProp?.showStatusIcon ?? true,
    showStatusTextOnHover: badgeConfigProp?.showStatusTextOnHover ?? true,
    showTagsInOverlay: badgeConfigProp?.showTagsInOverlay ?? true,
    showFooterProvider: badgeConfigProp?.showFooterProvider ?? true,
    showFooterDate: badgeConfigProp?.showFooterDate ?? true,
    showGenerationBadge: badgeConfigProp?.showGenerationBadge ?? true,
    showGenerationInMenu: badgeConfigProp?.showGenerationInMenu ?? true,
    generationQuickAction: badgeConfigProp?.generationQuickAction ?? 'auto',
  };

  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hover = useHoverScrubVideo(videoRef);
  const [internalUploadState, setInternalUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [internalUploadNote, setInternalUploadNote] = useState<string | undefined>(undefined);
  const [isHovered, setIsHovered] = useState(false);

  const effectiveState = props.uploadState ?? internalUploadState;
  const effectiveNote = props.uploadNote ?? internalUploadNote;

  const statusMeta = badges.status ? MEDIA_STATUS_ICON[badges.status] : null;
  const statusStyle = statusMeta ? STATUS_STYLES[statusMeta.color] : STATUS_STYLES.gray;
  const statusBgClass = `${statusStyle.base} ${statusStyle.hover} ${statusStyle.ring} ${statusStyle.glow}`;

  useEffect(() => {
    let cancelled = false;

    // Cleanup any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!thumbUrl) {
      setThumbSrc(undefined);
      return;
    }

    // Public absolute URL or blob URL
    if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://') || thumbUrl.startsWith('blob:')) {
      setThumbSrc(thumbUrl);
      return;
    }

    const fullUrl = thumbUrl.startsWith('/')
      ? `${BACKEND_BASE}${thumbUrl}`
      : `${BACKEND_BASE}/${thumbUrl}`;

    const token = localStorage.getItem('access_token');

    // If no token, fall back to using the URL directly (may work if endpoint is public)
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
  }, [thumbUrl]);

  async function handleUploadClick() {
    if (!props.onUploadClick) return;
    const controlling = props.uploadState !== undefined;
    if (!controlling) setInternalUploadState('uploading');
    try {
      const result = await props.onUploadClick(id);
      const ok = (result && 'ok' in result) ? !!result.ok : true;
      const note = (result && 'note' in result) ? (result as any).note : undefined;
      if (!controlling) {
        setInternalUploadState(ok ? 'success' : 'error');
        setInternalUploadNote(note);
      }
    } catch {
      if (!controlling) setInternalUploadState('error');
    }
  }

  const handleOpen = (event?: React.MouseEvent) => {
    if (!onOpen) return;
    // Respect modifier-click selection in parents: don't navigate on ctrl/shift/meta
    if (event && (event.ctrlKey || event.shiftKey || event.metaKey)) {
      return;
    }
    onOpen(id);
  };

  return (
    <div
      className="group rounded-md border border-neutral-300 bg-white shadow-sm hover:shadow-md transition"
      data-pixsim7="media-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={hover.containerRef}
        className={`relative w-full overflow-hidden bg-neutral-100 cursor-pointer ${
          mediaType === 'video' ? 'aspect-video' : ''
        }`}
        data-pixsim7="media-thumbnail"
        onMouseEnter={hover.onMouseEnter}
        onMouseLeave={hover.onMouseLeave}
        onMouseMove={hover.onMouseMove}
        onClick={handleOpen}
      >
        {thumbSrc && (
          mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={thumbSrc}
              className="h-full w-full object-cover"
              preload="metadata"
              muted
              playsInline
            />
          ) : (
            // For images, 3D models, and audio we show an img thumbnail (could be a generated preview or generic icon)
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img
              src={thumbSrc}
              alt={`thumb-${id}`}
              className="w-full h-auto object-cover"
              loading="lazy"
            />
          )
        )}
        {/* Top-left: Primary media type icon badge (always visible, hover for technical info) */}
        {badgeVisibility.showPrimaryIcon && badges.primary && (
          <div className="absolute left-2 top-2 group/media-type">
            <div
              role="img"
              aria-label={`${badges.primary} media type`}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 ${
                badgeVisibility.showStatusIcon && badges.status === 'provider_ok'
                  ? 'bg-white dark:bg-neutral-800 ring-2 ring-green-500 ring-offset-1 hover:shadow-[0_0_16px_rgba(34,197,94,0.3)]'
                  : badgeVisibility.showStatusIcon && badges.status === 'local_only'
                  ? 'bg-white dark:bg-neutral-800 ring-2 ring-amber-500 ring-offset-1 hover:shadow-[0_0_16px_rgba(245,158,11,0.3)]'
                  : badgeVisibility.showStatusIcon && badges.status === 'flagged'
                  ? 'bg-white dark:bg-neutral-800 ring-2 ring-red-500 ring-offset-1 hover:shadow-[0_0_16px_rgba(239,68,68,0.3)]'
                  : badgeVisibility.showStatusIcon && badges.status
                  ? 'bg-white dark:bg-neutral-800 ring-2 ring-neutral-400 ring-offset-1 hover:shadow-[0_0_16px_rgba(115,115,115,0.2)]'
                  : 'bg-white/95 dark:bg-neutral-800/95 backdrop-blur-sm shadow-md hover:shadow-[0_0_16px_rgba(255,255,255,0.2)]'
              }`}
            >
              <ThemedIcon name={MEDIA_TYPE_ICON[badges.primary]} size={18} variant="default" />
            </div>
            {/* Provider + technical info tooltip on hover */}
            {(badgeVisibility.showFooterProvider && providerId && !providerId.includes('_')) || technicalTags.length > 0 ? (
              <div className="absolute top-full left-0 mt-1 hidden group-hover/media-type:block z-30 min-w-max">
                <div className="bg-black/90 text-white text-[10px] rounded-md shadow-lg px-2 py-1.5 space-y-0.5">
                  {badgeVisibility.showFooterProvider && providerId && !providerId.includes('_') && (
                    <div className="font-medium">
                      {providerId}
                      {' · '}
                      {mediaType}
                    </div>
                  )}
                  {technicalTags.map(tag => (
                    <div key={tag} className="font-mono">{tag}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Top-right: Expandable provider status badge (hover to reveal actions) */}
        {badges.status && (
          <div className="absolute right-2 top-2 z-20">
            <ExpandableButtonGroup
              trigger={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (actions?.onOpenDetails) {
                      actions.onOpenDetails(id);
                    } else {
                      handleOpen();
                    }
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all ${statusBgClass}`}
                  title={`${statusMeta?.label || badges.status} - Hover for actions`}
                  aria-label={`Provider status: ${statusMeta?.label || badges.status}. Click to open details, hover for more actions.`}
                  role="button"
                  aria-haspopup="true"
                >
                  <ThemedIcon
                    name={statusMeta?.icon || 'circle'}
                    size={16}
                    variant="default"
                  />
                </button>
              }
              direction="down"
              hoverDelay={180}
              offset={6}
              staggerChildren={true}
              staggerDelay={0.04}
            >
              <div
                className="min-w-[12rem] rounded-lg bg-neutral-900/95 backdrop-blur-sm text-white text-xs shadow-2xl border border-neutral-700 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 bg-gradient-to-r from-neutral-800 to-neutral-800/80 font-semibold border-b border-neutral-700 flex items-center gap-2">
                  <ThemedIcon name={statusMeta?.icon || 'circle'} size={14} variant="default" />
                  <span>{MEDIA_STATUS_ICON[badges.status]?.label || badges.status}</span>
                </div>
                <div className="py-1">
                  {(onOpen || actions?.onOpenDetails) && (
                    <ExpandableItem
                      variants={expandableItemVariants}
                      className="block"
                    >
                      <ExpandableButtonGroup
                        trigger={
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-neutral-800/60 transition-colors flex items-center gap-2 group/item"
                            onClick={() => {
                              if (actions?.onOpenDetails) {
                                actions.onOpenDetails(id);
                              } else {
                                handleOpen();
                              }
                            }}
                          >
                            <ThemedIcon name="eye" size={14} variant="default" className="text-neutral-400 group-hover/item:text-blue-400" />
                            <span className="font-medium">Open details</span>
                          </button>
                        }
                        direction="left"
                        hoverDelay={300}
                        offset={4}
                      >
                        <div className="flex items-center gap-1 p-1 rounded-md bg-neutral-800/95 backdrop-blur-sm shadow-xl border border-neutral-600">
                          <button
                            type="button"
                            className="px-2 py-1.5 text-[10px] text-white rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
                            onClick={() => {
                              if (actions?.onOpenDetails) {
                                actions.onOpenDetails(id);
                              } else {
                                handleOpen();
                              }
                            }}
                            title="Quick view"
                          >
                            Quick
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1.5 text-[10px] text-white rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
                            onClick={() => {
                              if (actions?.onOpenDetails) {
                                actions.onOpenDetails(id);
                              } else {
                                handleOpen();
                              }
                            }}
                            title="Full details"
                          >
                            Full
                          </button>
                        </div>
                      </ExpandableButtonGroup>
                    </ExpandableItem>
                  )}
                  {badges.status === 'local_only' && actions?.onUploadToProvider && (
                    <ExpandableItem
                      variants={expandableItemVariants}
                      className="block"
                    >
                      <ExpandableButtonGroup
                        trigger={
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-neutral-800/60 transition-colors flex items-center gap-2 group/item"
                            onClick={() => {
                              actions.onUploadToProvider?.(id);
                            }}
                          >
                            <ThemedIcon name="upload" size={14} variant="default" className="text-neutral-400 group-hover/item:text-yellow-400" />
                            <span className="font-medium">Re-upload to provider</span>
                          </button>
                        }
                        direction="left"
                        hoverDelay={300}
                        offset={4}
                      >
                        <div className="flex items-center gap-1 p-1 rounded-md bg-neutral-800/95 backdrop-blur-sm shadow-xl border border-neutral-600">
                          <button
                            type="button"
                            className="px-2 py-1.5 text-[10px] text-white rounded hover:bg-yellow-600 transition-colors whitespace-nowrap"
                            onClick={() => actions.onUploadToProvider?.(id)}
                            title="Upload immediately"
                          >
                            Now
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1.5 text-[10px] text-white rounded hover:bg-yellow-600 transition-colors whitespace-nowrap"
                            onClick={() => actions.onUploadToProvider?.(id)}
                            title="Retry with force"
                          >
                            Force
                          </button>
                        </div>
                      </ExpandableButtonGroup>
                    </ExpandableItem>
                  )}
                  {actions?.onShowMetadata && (
                    <ExpandableItem
                      variants={expandableItemVariants}
                      className="block"
                    >
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-neutral-800/60 transition-colors flex items-center gap-2 group/item"
                        onClick={() => {
                          actions.onShowMetadata(id);
                        }}
                      >
                        <ThemedIcon name="info" size={14} variant="default" className="text-neutral-400 group-hover/item:text-purple-400" />
                        <span className="font-medium">Show metadata</span>
                      </button>
                    </ExpandableItem>
                  )}
                </div>
              </div>
            </ExpandableButtonGroup>
          </div>
        )}

        {/* Upload button (if upload hook is provided) - separate from status */}
        {props.onUploadClick && (
          <div className="absolute right-2 top-12">
            <button
              onClick={handleUploadClick}
              disabled={effectiveState==='uploading'}
              className={`px-2 py-1 text-[10px] rounded shadow transition-all ${
                effectiveState==='success' ? (
                  // Match extension semantics: check note/providerStatus to differentiate
                  (effectiveNote && (effectiveNote.includes('saved locally') || effectiveNote.includes('Local only'))) || providerStatus === 'local_only'
                    ? 'bg-amber-600 text-white'  // Local-only: amber (partial success)
                    : 'bg-blue-600 text-white'     // Provider accepted: blue (full success)
                ) :
                effectiveState==='error' ? 'bg-red-600 text-white' :
                effectiveState==='uploading' ? 'bg-neutral-400 text-white' : 'bg-neutral-700 text-white hover:bg-neutral-600'
              }`}
              title={
                effectiveState==='success'
                  ? (
                      // Prefer explicit note from upload response, fall back to provider status
                      effectiveNote ||
                      (providerStatus === 'ok' ? 'Uploaded to provider successfully' :
                       providerStatus === 'local_only' ? 'Saved locally; provider upload failed' :
                       'Upload completed')
                    )
                  : effectiveState==='error'
                    ? (effectiveNote || 'Upload failed / rejected')
                    : 'Upload to provider'
              }
              aria-label={`Upload status: ${effectiveState}`}
              aria-live="polite"
            >
              {effectiveState==='uploading' ? 'UP...' : effectiveState==='success' ? 'UP OK' : effectiveState==='error' ? 'ERR' : 'UPLOAD'}
            </button>
          </div>
        )}

        {mediaType === 'video' && hover.hasStartedPlaying && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div className="h-full bg-white/80" style={{ width: `${Math.round(hover.progress * 100)}%` }} />
          </div>
        )}
        {mediaType === 'video' && !hover.hasStartedPlaying && (
          <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">
            {durationSec ? `${Math.round(durationSec)}s` : 'video'}
          </div>
        )}


        {/* Hover overlay with detailed info at bottom */}
        {isHovered && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent pb-10 pt-8 px-3 space-y-1.5 animate-in slide-in-from-bottom-2 duration-200">
            {description && (
              <p className="text-xs text-white/95 line-clamp-2 font-medium">{description}</p>
            )}
            {/* Show non-technical tags only (technical tags shown in top-left tooltip) */}
            {badgeVisibility.showTagsInOverlay && displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5" role="list" aria-label="Media tags">
                {displayTags.slice(0, 3).map(t => (
                  <Badge key={t} color="gray" className="backdrop-blur-sm border border-white/20 shadow-sm text-[10px]">
                    {t}
                  </Badge>
                ))}
                {displayTags.length > 3 && (
                  <Badge color="gray" className="backdrop-blur-sm border border-white/20 shadow-sm text-[10px]">
                    +{displayTags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
      </div>


      {/* Footer: provider + Generate */}
      {(badgeVisibility.showFooterProvider || badgeVisibility.showGenerationBadge) && (
        <div className="px-2 py-1.5 flex items-center justify-between text-[10px] text-neutral-500">
          {badgeVisibility.showFooterProvider && providerId && !providerId.includes('_') && (
            <span className="truncate max-w-[60%]">
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{providerId}</span>
              {' · '}
              {mediaType}
            </span>
          )}
          {badgeVisibility.showGenerationBadge && (actions?.onImageToVideo || actions?.onVideoExtend || actions?.onAddToTransition || actions?.onAddToGenerate) && (
            <ExpandableButtonGroup
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/50 transition-all hover:scale-105"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Default action on click
                    const operation = badgeVisibility.generationQuickAction === 'auto'
                      ? (mediaType === 'image' ? 'image_to_video' : mediaType === 'video' ? 'video_extend' : undefined)
                      : badgeVisibility.generationQuickAction;

                    if (operation === 'image_to_video') actions?.onImageToVideo?.(id);
                    else if (operation === 'video_extend') actions?.onVideoExtend?.(id);
                    else if (operation === 'add_to_transition') actions?.onAddToTransition?.(id);
                    else actions?.onAddToGenerate?.(id, operation);
                  }}
                  title="Click for quick action, hover for all options"
                  aria-label="Generate actions. Click for quick action, hover for all options."
                  aria-haspopup="true"
                >
                  <ThemedIcon name="zap" size={12} variant="default" />
                  <span>Generate</span>
                </button>
              }
              direction="left"
              hoverDelay={200}
              offset={8}
            >
              <div
                className="flex items-center gap-2 p-2 rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-2xl border border-neutral-700"
                onClick={(e) => e.stopPropagation()}
              >
                {actions?.onImageToVideo && mediaType === 'image' && (
                  <ExpandableButtonGroup
                    trigger={
                      <button
                        type="button"
                        className="group/gen flex flex-col items-center gap-1 px-3 py-2 rounded-md bg-neutral-800 hover:bg-purple-600 transition-all"
                        onClick={() => actions.onImageToVideo?.(id)}
                        title="Image to Video"
                      >
                        <ThemedIcon name="video" size={16} variant="default" className="text-white" />
                        <span className="text-[9px] text-neutral-400 group-hover/gen:text-white font-medium">Img→Vid</span>
                      </button>
                    }
                    direction="up"
                    hoverDelay={300}
                    offset={4}
                  >
                    <div className="flex flex-col gap-1 p-1 rounded-md bg-neutral-800/95 backdrop-blur-sm shadow-xl border border-neutral-600">
                      <button
                        type="button"
                        className="px-2 py-1 text-[9px] text-white rounded hover:bg-purple-700 transition-colors whitespace-nowrap"
                        onClick={() => actions.onImageToVideo?.(id)}
                        title="Standard quality"
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[9px] text-white rounded hover:bg-purple-700 transition-colors whitespace-nowrap"
                        onClick={() => actions.onImageToVideo?.(id)}
                        title="High quality"
                      >
                        HD
                      </button>
                    </div>
                  </ExpandableButtonGroup>
                )}
                {actions?.onVideoExtend && mediaType === 'video' && (
                  <ExpandableButtonGroup
                    trigger={
                      <button
                        type="button"
                        className="group/gen flex flex-col items-center gap-1 px-3 py-2 rounded-md bg-neutral-800 hover:bg-purple-600 transition-all"
                        onClick={() => actions.onVideoExtend?.(id)}
                        title="Extend Video"
                      >
                        <ThemedIcon name="arrowRight" size={16} variant="default" className="text-white" />
                        <span className="text-[9px] text-neutral-400 group-hover/gen:text-white font-medium">Extend</span>
                      </button>
                    }
                    direction="up"
                    hoverDelay={300}
                    offset={4}
                  >
                    <div className="flex flex-col gap-1 p-1 rounded-md bg-neutral-800/95 backdrop-blur-sm shadow-xl border border-neutral-600">
                      <button
                        type="button"
                        className="px-2 py-1 text-[9px] text-white rounded hover:bg-purple-700 transition-colors whitespace-nowrap"
                        onClick={() => actions.onVideoExtend?.(id)}
                        title="2 seconds"
                      >
                        +2s
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[9px] text-white rounded hover:bg-purple-700 transition-colors whitespace-nowrap"
                        onClick={() => actions.onVideoExtend?.(id)}
                        title="4 seconds"
                      >
                        +4s
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[9px] text-white rounded hover:bg-purple-700 transition-colors whitespace-nowrap"
                        onClick={() => actions.onVideoExtend?.(id)}
                        title="8 seconds"
                      >
                        +8s
                      </button>
                    </div>
                  </ExpandableButtonGroup>
                )}
                {actions?.onAddToTransition && (
                  <button
                    type="button"
                    className="group/gen flex flex-col items-center gap-1 px-3 py-2 rounded-md bg-neutral-800 hover:bg-purple-600 transition-all"
                    onClick={() => actions.onAddToTransition?.(id)}
                    title="Add to Transition"
                  >
                    <ThemedIcon name="shuffle" size={16} variant="default" className="text-white" />
                    <span className="text-[9px] text-neutral-400 group-hover/gen:text-white font-medium">Trans</span>
                  </button>
                )}
                {actions?.onAddToGenerate && (
                  <button
                    type="button"
                    className="group/gen flex flex-col items-center gap-1 px-3 py-2 rounded-md bg-neutral-800 hover:bg-purple-600 transition-all"
                    onClick={() => actions.onAddToGenerate?.(id)}
                    title="Add to Generate Queue"
                  >
                    <ThemedIcon name="plus" size={16} variant="default" className="text-white" />
                    <span className="text-[9px] text-neutral-400 group-hover/gen:text-white font-medium">Queue</span>
                  </button>
                )}
              </div>
            </ExpandableButtonGroup>
          )}
        </div>
      )}
    </div>
  );
}
