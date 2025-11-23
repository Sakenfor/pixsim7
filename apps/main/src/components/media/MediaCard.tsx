import { Badge } from '@pixsim7/shared.ui';
import { Button } from '@pixsim7/shared.ui';
import { StatusBadge } from '@pixsim7/shared.ui';
import { useEffect, useRef, useState } from 'react';
import { useHoverScrubVideo } from '../../hooks/useHoverScrubVideo';
import { BACKEND_BASE } from '../../lib/api/client';

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
  } = props;

  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null as unknown as HTMLVideoElement);
  const hover = useHoverScrubVideo(videoRef as React.RefObject<HTMLVideoElement>);
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
    >
      <div
        ref={hover.containerRef}
        className="relative aspect-video w-full overflow-hidden bg-neutral-100 cursor-pointer"
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
        {props.onUploadClick && (
          <div className="absolute right-1 top-1">
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
              {effectiveState==='uploading' ? 'UP...' : effectiveState==='success' ? 'UP ✓' : effectiveState==='error' ? 'ERR' : 'UPLOAD'}
            </button>
          </div>
        )}
        {status && (
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge color="blue">{providerId}</Badge>
              <Badge color="purple">{mediaType}</Badge>
              {providerStatus === 'ok' && (
                <Badge color="green" className="text-[10px]" title="Provider accepted this asset">
                  Provider OK
                </Badge>
              )}
              {providerStatus === 'local_only' && (
                <Badge color="yellow" className="text-[10px]" title="Saved in PixSim7; provider upload failed">
                  Local only
                </Badge>
              )}
              {providerStatus === 'flagged' && (
                <Badge color="red" className="text-[10px]" title="Flagged / rejected by provider">
                  Flagged
                </Badge>
              )}
              {status && <StatusBadge status={status} />}
            </div>
            {description && (
              <p className="text-xs text-white/90 line-clamp-2">{description}</p>
            )}
            {tags.length > 0 && (
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
            {onOpen && (
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
                    ⋮
                  </button>
                  {showMenu && (
                    <div
                      className="absolute right-0 mt-1 w-32 rounded-md bg-neutral-900 text-white text-xs shadow-lg border border-neutral-700 z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 hover:bg-neutral-800"
                        onClick={() => {
                          setShowMenu(false);
                          handleOpen();
                        }}
                      >
                        Open details
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compact footer: provider + date */}
      <div className="px-2 py-1.5 flex items-center justify-between text-[10px] text-neutral-500">
        <span className="truncate max-w-[60%]">
          <span className="font-medium text-neutral-700 dark:text-neutral-200">{providerId}</span>
          {' · '}
          {mediaType}
        </span>
        <span>{new Date(createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
