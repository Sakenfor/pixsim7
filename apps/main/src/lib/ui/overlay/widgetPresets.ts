/**
 * Widget Preset Builders
 *
 * Reusable builder functions for common overlay widget patterns
 * (remove badges, pin toggles, count badges) used across MiniGallery consumers.
 */

import type { OverlayWidget, WidgetPosition, VisibilityConfig } from './types';
import { createBadgeWidget, BADGE_SLOT, BADGE_PRIORITY } from './widgets';

// ---------------------------------------------------------------------------
// Remove widget
// ---------------------------------------------------------------------------

export interface RemoveWidgetOptions {
  /** Widget id. Default `'remove'`. */
  id?: string;
  /** Tooltip text. Default `'Remove'`. */
  tooltip?: string;
  /** Visibility config. Default `hover-container`. */
  visibility?: VisibilityConfig;
  /** Override className. */
  className?: string;
}

/**
 * Build a remove/X badge widget (top-right, red circle).
 * Used in QuickGenHistoryPanel, SetEditView, and assetCardLocalWidgets.
 */
export function buildRemoveWidget(
  onRemove: () => void,
  options?: RemoveWidgetOptions,
): OverlayWidget {
  return createBadgeWidget({
    id: options?.id ?? 'remove',
    ...BADGE_SLOT.topRight,
    visibility: options?.visibility ?? { trigger: 'hover-container' },
    variant: 'icon',
    icon: 'x',
    color: 'red',
    shape: 'circle',
    tooltip: options?.tooltip ?? 'Remove',
    onClick: onRemove,
    className: options?.className ?? '!bg-red-600/80 hover:!bg-red-600 !text-white',
    priority: BADGE_PRIORITY.action,
  });
}

// ---------------------------------------------------------------------------
// Pin toggle widget
// ---------------------------------------------------------------------------

/**
 * Build a pin toggle badge widget (top-left).
 * Purple + always-visible when pinned, gray + hover-only when unpinned.
 */
export function buildPinToggleWidget(
  isPinned: boolean,
  onToggle: () => void,
): OverlayWidget {
  return createBadgeWidget({
    id: 'pin-toggle',
    ...BADGE_SLOT.topLeft,
    visibility: { trigger: isPinned ? 'always' : 'hover-container' },
    variant: 'icon',
    icon: 'pin',
    color: 'gray',
    shape: 'circle',
    tooltip: isPinned ? 'Unpin' : 'Pin',
    onClick: onToggle,
    className: isPinned
      ? '!bg-purple-600 hover:!bg-purple-700 !text-white'
      : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-purple-500 backdrop-blur-sm',
    priority: BADGE_PRIORITY.important,
  });
}

// ---------------------------------------------------------------------------
// Count badge widget
// ---------------------------------------------------------------------------

export interface CountBadgeOptions {
  /** Widget id. Default `'count'`. */
  id?: string;
  /** Position override. Default bottom-left `(4, -4)`. */
  position?: WidgetPosition;
  /** Override className. */
  className?: string;
}

/**
 * Build a use-count badge widget (bottom-left by default).
 * Returns `null` if count ≤ 1.
 */
export function buildCountBadgeWidget(
  count: number,
  options?: CountBadgeOptions,
): OverlayWidget | null {
  if (count <= 1) return null;
  return createBadgeWidget({
    id: options?.id ?? 'count',
    position: options?.position ?? BADGE_SLOT.bottomLeft.position,
    variant: 'text',
    labelBinding: { kind: 'fn', target: 'label', fn: () => `${count}x` },
    color: 'gray',
    className: options?.className ?? '!bg-black/80 !text-white text-[10px] font-medium',
    priority: BADGE_PRIORITY.background,
  });
}

// ---------------------------------------------------------------------------
// Target-toggle widget (per-set add/remove glyph on hover)
// ---------------------------------------------------------------------------

export interface TargetToggleWidgetOptions {
  /** Widget id. Default `'target-toggle'`. Use `target-toggle-${setId}` per set. */
  id?: string;
  /** Whether the asset is currently a member of this target set. */
  isMember: boolean;
  /** @lib/icons name for the set. Falls back to check/plus when absent. */
  icon?: string;
  /** Tooltip text. */
  tooltip?: string;
  /** Override className (rarely needed; tint is derived from `isMember`). */
  className?: string;
  /**
   * Appended to the resolved className (does NOT replace the tint). Use for
   * one-off concerns like an entrance animation on expand.
   */
  extraClassName?: string;
  /**
   * Force the glyph visible at rest even when the asset is NOT a member.
   * Normally addable glyphs are hover-only (clean resting cards); set this when
   * the glyph is the *only* affordance on the card (e.g. a single active set) so
   * a non-member still has a greyed control to add/inspect.
   */
  alwaysVisible?: boolean;
}

/**
 * Build a single toggle glyph for one active add-target set, shown in the
 * top-right badge stack. Clicking adds the asset to the set (or removes it,
 * silently — reversible by clicking again).
 *
 * Tint carries state: green when the asset is already a member, grey when it's
 * merely addable. Member glyphs stay visible at rest (membership reads at a
 * glance); addable glyphs appear only on hover so resting cards stay clean.
 *
 * Multiple active targets render multiple glyphs — give each a unique id
 * (`target-toggle-${setId}`) so the shared top-right stackGroup lays them out.
 */
export function buildTargetToggleWidget(
  onToggle: () => void,
  options: TargetToggleWidgetOptions,
): OverlayWidget {
  const { isMember } = options;
  return {
    // Fold target toggles into the stack's scroll region so they overflow
    // below the pinned status/favorite/tag badges instead of pushing them out.
    scrollable: true,
    ...createBadgeWidget({
    id: options.id ?? 'target-toggle',
    ...BADGE_SLOT.topRight,
    visibility: { trigger: isMember || options.alwaysVisible ? 'always' : 'hover-container' },
    variant: 'icon',
    icon: options.icon || (isMember ? 'check' : 'plus'),
    shape: 'circle',
    tooltip: options.tooltip,
    onClick: () => onToggle(),
    className: `${
      options.className ??
      (isMember
        ? '!bg-emerald-600/90 !text-white backdrop-blur-sm shadow-sm'
        : '!bg-white/95 dark:!bg-neutral-900/95 !text-neutral-700 dark:!text-neutral-200 hover:!bg-accent/10 shadow-sm')
    }${options.extraClassName ? ` ${options.extraClassName}` : ''}`,
    // Keep status/favorite/tag controls at the top-right leader positions.
    priority: BADGE_PRIORITY.status + 1,
    }),
  };
}

