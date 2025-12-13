/**
 * Media Card Badge Configuration
 *
 * Defines badge types, icons, and mapping logic for MediaCard badges.
 * Supports future user-configurable badge visibility.
 */

import type { IconName } from '@lib/icons';

export type MediaPrimaryBadge = 'video' | 'image' | 'audio' | 'model';

export type MediaStatusBadge = 'provider_ok' | 'local_only' | 'flagged' | 'unknown';

export interface MediaBadgeConfig {
  /** Primary icon badge for top-left (e.g. media type). */
  primary: MediaPrimaryBadge | null;
  /** Status badge for top-right (provider_status, sync, etc.). */
  status: MediaStatusBadge | null;
  /** Optional tags/flags that can be shown in overlay or menu. */
  flags: string[];
}

/** Icon mapping for primary media type badges */
export const MEDIA_TYPE_ICON: Record<MediaPrimaryBadge, IconName> = {
  video: 'video',
  image: 'image',
  audio: 'audio',
  model: 'clapperboard',
};

/** Icon and color mapping for status badges */
export const MEDIA_STATUS_ICON: Record<
  MediaStatusBadge,
  { icon: IconName; label: string; color: 'green' | 'yellow' | 'red' | 'gray' }
> = {
  provider_ok: { icon: 'check', label: 'OK', color: 'green' },
  local_only: { icon: 'download', label: 'Local only', color: 'yellow' },
  flagged: { icon: 'alertCircle', label: 'Flagged', color: 'red' },
  unknown: { icon: 'info', label: 'Unknown', color: 'gray' },
};

/**
 * Resolve badge configuration from media type and provider status
 */
export function resolveMediaBadgeConfig(
  mediaType: 'video' | 'image' | 'audio' | '3d_model',
  providerStatus?: 'ok' | 'local_only' | 'unknown' | 'flagged',
  tags?: string[]
): MediaBadgeConfig {
  // Map mediaType to primary badge
  const primaryBadgeMap: Record<string, MediaPrimaryBadge | null> = {
    video: 'video',
    image: 'image',
    audio: 'audio',
    '3d_model': 'model',
  };

  // Map providerStatus to status badge
  const statusBadgeMap: Record<string, MediaStatusBadge> = {
    ok: 'provider_ok',
    local_only: 'local_only',
    flagged: 'flagged',
    unknown: 'unknown',
  };

  return {
    primary: primaryBadgeMap[mediaType] ?? null,
    status: providerStatus ? statusBadgeMap[providerStatus] : null,
    flags: tags ?? [],
  };
}
