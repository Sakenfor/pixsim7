/**
 * Tag provenance — single source of truth for how a tag's `source` is shown.
 *
 * Each asset tag carries a `source` recorded at assignment time (see backend
 * AssetTag.source). We surface it with a small leading glyph + tooltip rather
 * than color, so color stays free for namespace meaning. The chip itself is
 * accent-toned for tags you added and neutral for anything generated.
 */
import type { IconName } from '@lib/icons';

export type TagSource = 'manual' | 'analysis' | 'derived' | 'ai' | 'auto';

export interface TagSourceMeta {
  /** Leading glyph for the chip. */
  icon: IconName;
  /** Tooltip text (the precise provenance, in words). */
  label: string;
  /** Whether this tag was added by the user (vs machine-generated). */
  isManual: boolean;
  /** Tailwind classes for the icon tint (color distinguishes source). */
  iconClass: string;
}

const MANUAL: TagSourceMeta = {
  icon: 'hand',
  label: 'Added by you',
  isManual: true,
  iconClass: 'text-accent',
};

/**
 * Map a raw `source` value to its display metadata. Unknown/empty sources
 * default to manual (the historical default for hand-assigned tags).
 */
export function getTagSourceMeta(source: string | null | undefined): TagSourceMeta {
  switch ((source || 'manual').toLowerCase()) {
    case 'manual':
      return MANUAL;
    case 'analysis':
      return {
        icon: 'sparkles',
        label: 'From prompt analysis',
        isManual: false,
        iconClass: 'text-sky-500',
      };
    case 'derived':
      return {
        icon: 'sparkles',
        label: 'Derived from prompt analysis',
        isManual: false,
        iconClass: 'text-sky-500',
      };
    case 'ai':
      return {
        icon: 'wand',
        label: 'AI-suggested',
        isManual: false,
        iconClass: 'text-violet-500',
      };
    case 'auto':
      return {
        icon: 'zap',
        label: 'Auto rule (provider / site / operation)',
        isManual: false,
        iconClass: 'text-amber-500',
      };
    default:
      return {
        icon: 'sparkles',
        label: `Source: ${source}`,
        isManual: false,
        iconClass: 'text-neutral-400',
      };
  }
}
