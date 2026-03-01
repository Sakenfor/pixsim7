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
