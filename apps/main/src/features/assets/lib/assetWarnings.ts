/**
 * Asset warnings — compact per-asset signals surfaced on media cards.
 *
 * Extensible list: add new warning ids as new failure modes need UI surfacing.
 * Each warning carries its own icon + severity; the renderer clusters them
 * into a single bottom-left pill.
 */

import type { AssetModel } from '../models/asset';

export type AssetWarningId = 'noReusableLastFrame';

export type AssetWarningSeverity = 'warning' | 'error';

export interface AssetWarning {
  id: AssetWarningId;
  /** Icon name from @lib/icons — rendered as a small chip glyph. */
  icon: string;
  /** One-line hover tooltip explaining the warning. */
  tooltip: string;
  /** Controls ring color on the chip. */
  severity: AssetWarningSeverity;
}

function hasNoReusableLastFrame(asset: AssetModel): boolean {
  if (asset.mediaType !== 'video') return false;
  if (asset.providerId !== 'pixverse') return false;
  // Backend sets provider_status='flagged' when media_metadata.provider_flagged
  // is true — triggered by Pixverse status=3/7 (moderation filter) and by
  // CDN probes that see the placeholder last-frame URL. Synthetic extend can
  // still be attempted (local ffmpeg extract + re-upload), but Pixverse
  // moderation will likely reject the re-upload of a filtered source.
  return asset.providerStatus === 'flagged';
}

export function getAssetWarnings(asset: AssetModel | null | undefined): AssetWarning[] {
  if (!asset) return [];
  const warnings: AssetWarning[] = [];
  if (hasNoReusableLastFrame(asset)) {
    warnings.push({
      id: 'noReusableLastFrame',
      icon: 'arrowRight',
      tooltip: 'Provider last-frame missing — synthetic extend may still fail moderation.',
      severity: 'warning',
    });
  }
  return warnings;
}

export function hasWarning(warnings: AssetWarning[] | undefined, id: AssetWarningId): boolean {
  return !!warnings?.some((w) => w.id === id);
}
