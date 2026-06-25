/**
 * Asset indicators — compact per-asset signals surfaced on media cards.
 *
 * Extensible list: add new ids as new states need UI surfacing. Not all
 * indicators are "warnings": severity `info` carries non-warning provenance
 * (e.g. recovered-from-provider). Each entry has its own icon + severity; the
 * renderer clusters them into a single bottom-left badge.
 *
 * Type/export names keep the `Warning` prefix for now to bound blast radius —
 * the surface is conceptually an indicator cluster.
 */

import type { AssetModel } from '../models/asset';

export type AssetWarningId = 'noReusableLastFrame' | 'recovered' | 'suspectBroken';

export type AssetWarningSeverity = 'info' | 'warning' | 'error';

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
  // Video-health heuristic. User's manual flag wins (authoritative); otherwise
  // surface the heuristic's suspicion — unless the user has explicitly kept it.
  if (asset.signalOverride === 'broken') {
    warnings.push({
      id: 'suspectBroken',
      icon: 'alertTriangle',
      tooltip: 'Marked broken.',
      severity: 'error',
    });
  } else if (asset.signalSuspicious && asset.signalOverride !== 'clean') {
    warnings.push({
      id: 'suspectBroken',
      icon: 'alertTriangle',
      tooltip:
        `Suspected broken video (low signal${
          typeof asset.signalScore === 'number' ? `, score ${asset.signalScore}` : ''
        }) — review in Triage.`,
      severity: 'warning',
    });
  }
  // Provenance, not a warning: this image was CDN-salvaged after the provider
  // reported it filtered/failed/stuck but it had actually rendered. Distinct
  // from (and additive to) the provider-flagged warning above — both can show.
  if (asset.recovered) {
    warnings.push({
      id: 'recovered',
      icon: 'shield',
      tooltip: 'Recovered — image salvaged from a provider false-filter / stuck-processing state.',
      severity: 'info',
    });
  }
  return warnings;
}

export function hasWarning(warnings: AssetWarning[] | undefined, id: AssetWarningId): boolean {
  return !!warnings?.some((w) => w.id === id);
}
