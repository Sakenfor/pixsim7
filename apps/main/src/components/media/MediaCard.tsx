import { Badge } from '@pixsim7/shared.ui';
import { Button } from '@pixsim7/shared.ui';
import { StatusBadge } from '@pixsim7/shared.ui';
import { useEffect, useRef, useState } from 'react';
import { useHoverScrubVideo } from '../../hooks/useHoverScrubVideo';
import { BACKEND_BASE } from '../../lib/api/client';
import { ThemedIcon } from '../../lib/icons';
import {
  resolveMediaBadgeConfig,
  MEDIA_TYPE_ICON,
  MEDIA_STATUS_ICON,
} from './mediaBadgeConfig';

export interface MediaCardActions {
  onOpenDetails?: (id: number) => void;
  onShowMetadata?: (id: number) => void;
  onUploadToProvider?: (id: number) => void;
}

export interface MediaCardBadgeConfig {
  showPrimaryIcon?: boolean;
  showStatusIcon?: boolean;
  showStatusTextOnHover?: boolean;
  showTagsInOverlay?: boolean;
  showFooterProvider?: boolean;
  showFooterDate?: boolean;
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

  // Resolve badge configuration
  const badges = resolveMediaBadgeConfig(mediaType, providerStatus, tags);

  // Badge visibility configuration with defaults
  const badgeVisibility = {
    showPrimaryIcon: badgeConfigProp?.showPrimaryIcon ?? true,
    showStatusIcon: badgeConfigProp?.showStatusIcon ?? true,
    showStatusTextOnHover: badgeConfigProp?.showStatusTextOnHover ?? true,
    showTagsInOverlay: badgeConfigProp?.showTagsInOverlay ?? true,
    showFooterProvider: badgeConfigProp?.showFooterProvider ?? true,
    showFooterDate: badgeConfigProp?.showFooterDate ?? true,
  };

  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hover = useHoverScrubVideo(videoRef);
  const [internalUploadState, setInternalUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [internalUploadNote, setInternalUploadNote] = useState<string | undefined>(undefined);
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const effectiveState = props.uploadState ?? internalUploadState;
  const effectiveNote = props.uploadNote ?? internalUploadNote;

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
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
    >
      <div
        ref={hover.containerRef}
        className="relative aspect-video w-full overflow-hidden bg-neutral-100 cursor-pointer"
        data-pixsim7="media-thumbnail"
        onMouseEnter={hover.onMouseEnter}
        onMouseLeave={hover.onMouseLeave}
        onMouseMove={hover.onMouseMove}
        onClick={handleOpen}
      >
        {thumbSrc && (
          mediaType === 'video' ? (
            <video ref={videoRef} src={thumbSrc} className="h-full w-full object-cover" preload="metadata" muted playsInline />
          ) : (
            // For images, 3D models, and audio we show an img thumbnail (could be a generated preview or generic icon)
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img src={thumbSrc} alt={`thumb-${id}`} className="h-full w-full object-cover" loading="lazy" />
          )
        )}
        {/* Top-left: Primary media type icon badge (always visible) */}
        {badgeVisibility.showPrimaryIcon && badges.primary && (
          <div className="absolute left-2 top-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shadow-lg ${
                badgeVisibility.showStatusIcon && badges.status === 'provider_ok'
                  ? 'bg-white ring-2 ring-green-500'
                  : badgeVisibility.showStatusIcon && badges.status === 'local_only'
                  ? 'bg-white ring-2 ring-yellow-500'
                  : badgeVisibility.showStatusIcon && badges.status === 'flagged'
                  ? 'bg-white ring-2 ring-red-500'
                  : badgeVisibility.showStatusIcon && badges.status
                  ? 'bg-white ring-2 ring-gray-400'
                  : 'bg-white shadow-md'
              }`}
              title={`${mediaType} (${badges.status ? MEDIA_STATUS_ICON[badges.status].label : 'no status'})`}
            >
              <ThemedIcon name={MEDIA_TYPE_ICON[badges.primary]} size={18} variant="default" />
            </div>
          </div>
        )}

        {/* Top-right: Contextual status badge (shows on hover) */}
        {badgeVisibility.showStatusTextOnHover && isHovered && badges.status && (
          <div className="absolute right-2 top-2 animate-in fade-in duration-200">
            <div
              className={`px-2 py-1 text-xs rounded-md shadow-lg flex items-center gap-1 ${
                MEDIA_STATUS_ICON[badges.status].color === 'green'
                  ? 'bg-green-600 text-white'
                  : MEDIA_STATUS_ICON[badges.status].color === 'yellow'
                  ? 'bg-yellow-600 text-white'
                  : MEDIA_STATUS_ICON[badges.status].color === 'red'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-600 text-white'
              }`}
            >
              <ThemedIcon
                name={MEDIA_STATUS_ICON[badges.status].icon}
                size={12}
                variant={
                  MEDIA_STATUS_ICON[badges.status].color === 'green' ? 'success' :
                  MEDIA_STATUS_ICON[badges.status].color === 'yellow' ? 'warning' :
                  MEDIA_STATUS_ICON[badges.status].color === 'red' ? 'error' :
                  'muted'
                }
              />
              <span>{MEDIA_STATUS_ICON[badges.status].label}</span>
            </div>
          </div>
        )}

        {/* Upload button (if upload hook is provided) - separate from status */}
        {props.onUploadClick && (
          <div className="absolute right-2 top-12">
            <button
              onClick={handleUploadClick}
              disabled={effectiveState==='uploading'}
              className={`px-2 py-1 text-[10px] rounded shadow ${
                effectiveState==='success' ? (
                  // Match extension semantics: check note/providerStatus to differentiate
                  (effectiveNote && (effectiveNote.includes('saved locally') || effectiveNote.includes('Local only'))) || providerStatus === 'local_only'
                    ? 'bg-yellow-600 text-white'  // Local-only: yellow (partial success)
                    : 'bg-blue-600 text-white'     // Provider accepted: blue (full success)
                ) :
                effectiveState==='error' ? 'bg-red-600 text-white' :
                effectiveState==='uploading' ? 'bg-neutral-400 text-white' : 'bg-neutral-700 text-white'
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
            >
              {effectiveState==='uploading' ? 'UP...' : effectiveState==='success' ? 'UP OK' : effectiveState==='error' ? 'ERR' : 'UPLOAD'}
            </button>
          </div>
        )}

        {/* Legacy status badge (kept for backwards compatibility if status prop is provided) */}
        {status && !badges.primary && (
          <div className="absolute left-1 top-1">
            <StatusBadge status={status} />
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
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/80 to-transparent p-3 space-y-1.5 animate-in slide-in-from-bottom-2 duration-200">
            {description && (
              <p className="text-xs text-white/90 line-clamp-2">{description}</p>
            )}
            {badgeVisibility.showTagsInOverlay && tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map(t => (
                  <Badge key={t} color="gray" className="text-[10px]">{t}</Badge>
                ))}
                {tags.length > 3 && <Badge color="gray" className="text-[10px]">+{tags.length - 3}</Badge>}
              </div>
            )}
            <div className="flex items-center justify-between text-[10px] text-white/70">
              <span>{new Date(createdAt).toLocaleDateString()}</span>
              <span>{width && height ? `${width}×${height}` : ''}</span>
              {durationSec && <span>{Math.round(durationSec)}s</span>}
            </div>
            {/* More actions menu trigger (three dots) */}
            {(onOpen || actions) && (
              <div className="absolute bottom-2 right-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu((prev) => !prev);
                    }}
                    className="px-1.5 py-0.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs"
                    title="More actions"
                  >
                    ...
                  </button>
                  {showMenu && (
                    <div
                      className="absolute right-0 bottom-full mb-1 w-40 rounded-md bg-neutral-900 text-white text-xs shadow-lg border border-neutral-700 z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(onOpen || actions?.onOpenDetails) && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800"
                          onClick={() => {
                            setShowMenu(false);
                            if (actions?.onOpenDetails) {
                              actions.onOpenDetails(id);
                            } else {
                              handleOpen();
                            }
                          }}
                        >
                          Open details
                        </button>
                      )}
                      {actions?.onShowMetadata && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800"
                          onClick={() => {
                            setShowMenu(false);
                            actions.onShowMetadata(id);
                          }}
                        >
                          Show metadata
                        </button>
                      )}
                      {actions?.onUploadToProvider && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800"
                          onClick={() => {
                            setShowMenu(false);
                            actions.onUploadToProvider?.(id);
                          }}
                        >
                          Upload to provider
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compact footer: provider + date */}
      {(badgeVisibility.showFooterProvider || badgeVisibility.showFooterDate) && (
        <div className="px-2 py-1.5 flex items-center justify-between text-[10px] text-neutral-500">
          {badgeVisibility.showFooterProvider && (
            <span className="truncate max-w-[60%]">
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{providerId}</span>
              {' · '}
              {mediaType}
            </span>
          )}
          {badgeVisibility.showFooterDate && (
            <span>{new Date(createdAt).toLocaleDateString()}</span>
          )}
        </div>
      )}
    </div>
  );
}
