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

export type AssetWarningId =
  | 'noReusableLastFrame'
  | 'recovered'
  | 'suspectBroken'
  | 'flagged'
  | 'localOnly'
  | 'providerRemovalFailed';

export type AssetWarningSeverity = 'info' | 'warning' | 'error';

export interface AssetWarning {
  id: AssetWarningId;
  /** Icon name from @lib/icons — rendered as a small chip glyph. */
  icon: string;
  /** One-line hover tooltip explaining the warning. */
  tooltip: string;
  /** Controls ring color on the chip. */
  severity: AssetWarningSeverity;
  /**
   * Optional 0..1 gauge value. When set, the chip glyph draws a partial arc of
   * this sweep length (a progress ring) instead of a solid ring — e.g. the
   * broken-video signal score, where a fuller arc = higher score.
   */
  score?: number;
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
  // Provider-flagged (moderation/filtered) is the single red signal. It used to
  // be a ring on the top-left/top-right status badges; it now lives ONLY here so
  // every flagged asset — image or video, any provider — surfaces it in one
  // place. The pixverse-video case keeps its more specific extend-failure
  // tooltip via noReusableLastFrame instead of a generic "flagged" chip.
  if (hasNoReusableLastFrame(asset)) {
    warnings.push({
      id: 'noReusableLastFrame',
      icon: 'arrowRight',
      tooltip: 'Provider last-frame missing — synthetic extend may still fail moderation.',
      severity: 'warning',
    });
  } else if (asset.providerStatus === 'flagged') {
    warnings.push({
      id: 'flagged',
      icon: 'alertCircle',
      tooltip: 'Flagged by the provider (moderation / filtered).',
      severity: 'error',
    });
  }
  // Local-only: stored in the library but not uploaded to a provider. Moved off
  // the top-corner amber ring into the cluster alongside the other status chips.
  if (asset.providerStatus === 'local_only') {
    warnings.push({
      id: 'localOnly',
      icon: 'download',
      tooltip: 'Local only — not uploaded to a provider.',
      severity: 'warning',
    });
  }
  // "Delete only on provider" was attempted but the provider rejected it — the
  // remote copy is still there. Surface it so the user knows the removal didn't
  // take (instead of the old behaviour that silently marked it removed).
  if (asset.providerRemovalFailed) {
    warnings.push({
      id: 'providerRemovalFailed',
      icon: 'alertTriangle',
      tooltip: 'Provider-side delete failed — the remote copy is still there. Try removing it again.',
      severity: 'error',
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
      // signal_score is 0..6 (>=3 = suspicious); render it as a gauge arc so the
      // level reads at a glance — a fuller orange ring = higher (worse) score.
      score:
        typeof asset.signalScore === 'number'
          ? Math.max(0, Math.min(1, asset.signalScore / 6))
          : undefined,
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
