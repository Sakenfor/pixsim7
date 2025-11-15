import { Badge } from '@pixsim7/ui';
import { Button } from '@pixsim7/ui';
import { StatusBadge } from '@pixsim7/ui';
import { useEffect, useRef, useState } from 'react';
import { useHoverScrubVideo } from '../../hooks/useHoverScrubVideo';
import { BACKEND_BASE } from '../../lib/api/client';

export interface MediaCardProps {
  id: number;
  mediaType: 'video' | 'image';
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
  } = props;

  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null as unknown as HTMLVideoElement);
  const hover = useHoverScrubVideo(videoRef as React.RefObject<HTMLVideoElement>);
  const [internalUploadState, setInternalUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [internalUploadNote, setInternalUploadNote] = useState<string | undefined>(undefined);

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

    // Public absolute URL
    if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://')) {
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
    // Only manage internal state when parent doesn't control it
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

  return (
    <div className="group rounded-md border border-neutral-300 bg-white shadow-sm hover:shadow-md transition">
      <div ref={hover.containerRef} className="relative aspect-video w-full overflow-hidden bg-neutral-100" onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} onMouseMove={hover.onMouseMove}>
        {thumbSrc && (
          mediaType === 'video' ? (
            <video ref={videoRef} src={thumbSrc} className="h-full w-full object-cover" preload="metadata" muted playsInline />
          ) : (
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
                effectiveState==='success' ? 'bg-blue-600 text-white' :
                effectiveState==='error' ? 'bg-red-600 text-white' :
                effectiveState==='uploading' ? 'bg-neutral-400 text-white' : 'bg-neutral-700 text-white'
              }`}
              title={effectiveState==='success' ? (effectiveNote || 'Uploaded (accepted)') : effectiveState==='error' ? 'Upload failed / rejected' : 'Upload to provider'}
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
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Badge color="blue">{providerId}</Badge>
          <Badge color="purple">{mediaType}</Badge>
        </div>
        {description && (
          <p className="line-clamp-2 text-xs text-neutral-700">{description}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 4).map(t => (
            <Badge key={t} color="gray">{t}</Badge>
          ))}
          {tags.length > 4 && <Badge color="gray">+{tags.length - 4}</Badge>}
        </div>
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{new Date(createdAt).toLocaleDateString()}</span>
          <span>{width && height ? `${width}x${height}` : ''}</span>
        </div>
        <div className="pt-1">
          <Button size="sm" variant="secondary" onClick={() => onOpen?.(id)}>Open</Button>
        </div>
      </div>
    </div>
  );
}
