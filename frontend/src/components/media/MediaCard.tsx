import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { StatusBadge } from '../primitives/StatusBadge';
import { useRef } from 'react';
import { useHoverScrubVideo } from '../../hooks/useHoverScrubVideo';

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

  const videoRef = useRef<HTMLVideoElement>(null as unknown as HTMLVideoElement);
  const hover = useHoverScrubVideo(videoRef as React.RefObject<HTMLVideoElement>);

  return (
    <div className="group rounded-md border border-neutral-300 bg-white shadow-sm hover:shadow-md transition">
      <div ref={hover.containerRef} className="relative aspect-video w-full overflow-hidden bg-neutral-100" onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} onMouseMove={hover.onMouseMove}>
        {mediaType === 'video' ? (
          <video ref={videoRef} src={thumbUrl} className="h-full w-full object-cover" preload="metadata" muted playsInline />
        ) : (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img src={thumbUrl} alt={`thumb-${id}`} className="h-full w-full object-cover" loading="lazy" />
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
