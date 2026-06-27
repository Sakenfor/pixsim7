import type { AssetModel } from '../models/asset';

import { assignTags } from './api';
import { assetEvents } from './assetEvents';

/**
 * Reference-clip tagging for the broken-audio fingerprint detector.
 *
 * A clip tagged `signalref:<voice>` becomes a *reference* the detector matches
 * candidates against (best-lag, pitch-rotation-invariant chroma cross-correlation).
 * The namespace is intentionally open-ended: the matcher unions EVERY `signalref:*`
 * clip, so noticing a second melody / new sound later is just a new label — no
 * schema or code change. The presets below are only quick buttons for the voices
 * we know today; typing any `signalref:foo` in the normal tag box works too.
 */
export const SIGNAL_REF_NAMESPACE = 'signalref';

export interface SignalRefPreset {
  /** Full tag slug (namespace:name). */
  tag: string;
  /** Short button label. */
  label: string;
  /** Glyph shown on the button. */
  glyph: string;
  /** Tooltip. */
  title: string;
}

/** Quick-button presets. NOT exhaustive — any `signalref:*` tag is a valid ref. */
export const SIGNAL_REF_PRESETS: SignalRefPreset[] = [
  {
    tag: `${SIGNAL_REF_NAMESPACE}:melody`,
    label: 'Melody',
    glyph: '♪',
    title: 'Reference: the recurring broken melody (any pitch/tempo variant)',
  },
  {
    tag: `${SIGNAL_REF_NAMESPACE}:highpitch`,
    label: 'Pitch',
    glyph: '▲',
    title: 'Reference: high-pitch syllable / tone broken audio (e.g. A/E vowels)',
  },
  {
    tag: `${SIGNAL_REF_NAMESPACE}:investigate`,
    label: 'Investigate',
    glyph: '?',
    title: 'Novel / unknown broken sound to revisit later (filter tag:signalref:investigate)',
  },
];

/**
 * Build a `signalref:<name>` tag from free-typed text (slugified: lowercased,
 * non-alphanumerics → `-`). Lets the card capture a new voice inline without the
 * full tag box — the label itself doubles as a short note. Returns null if empty.
 */
export function customSignalRefTag(raw: string): string | null {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name ? `${SIGNAL_REF_NAMESPACE}:${name}` : null;
}

/** All `signalref:*` tag slugs currently on the asset. */
export function signalRefTags(asset: AssetModel): string[] {
  return (asset.tags ?? [])
    .map((t) => (typeof t === 'string' ? t : t.slug))
    .filter((s): s is string => typeof s === 'string' && s.startsWith(`${SIGNAL_REF_NAMESPACE}:`));
}

export function hasSignalRefTag(asset: AssetModel, tag: string): boolean {
  return signalRefTags(asset).includes(tag);
}

/**
 * Set a `signalref:*` reference tag on an asset to an explicit state.
 *
 * Prefer this over deriving add-vs-remove from an `AssetModel` snapshot: the
 * tagger tracks its own optimistic active set, so a stale asset (between rapid
 * taps, before the fresh ref lands) can't flip the decision the wrong way — the
 * same footgun `favoriteTag.ts` documents. Multiple `signalref:*` tags coexist,
 * so toggling one never touches another.
 */
export async function setSignalRefTag(
  assetId: number,
  tag: string,
  on: boolean,
): Promise<void> {
  const updated = await assignTags(assetId, on ? { add: [tag] } : { remove: [tag] });
  assetEvents.emitAssetUpdated(updated);
}
