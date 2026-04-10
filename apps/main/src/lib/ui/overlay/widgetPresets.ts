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
// Set indicator widget (emerald dot — "in active set")
// ---------------------------------------------------------------------------

export interface SetIndicatorWidgetOptions {
  /** Widget id. Default `'set-indicator'`. */
  id?: string;
  /** Tooltip text. Default `'In active set'`. */
  tooltip?: string;
  /** Override className. */
  className?: string;
}

/**
 * Build an emerald-dot badge indicating an asset belongs to the active set.
 * Stacks at top-left via `badges-tl` group.
 */
export function buildSetIndicatorWidget(
  options?: SetIndicatorWidgetOptions,
): OverlayWidget {
  return createBadgeWidget({
    id: options?.id ?? 'set-indicator',
    ...BADGE_SLOT.topLeft,
    visibility: { trigger: 'always' },
    variant: 'icon',
    color: 'green',
    shape: 'circle',
    tooltip: options?.tooltip ?? 'In active set',
    className:
      options?.className ??
      '!w-2.5 !h-2.5 !min-w-0 !min-h-0 !p-0 !bg-emerald-500 ring-2 ring-white/90 dark:ring-neutral-900/90 shadow-sm',
    priority: BADGE_PRIORITY.interactive,
  });
}

// ---------------------------------------------------------------------------
// Add-to-set widget (hover pill button)
// ---------------------------------------------------------------------------

export interface AddToSetWidgetOptions {
  /** Widget id. Default `'add-to-set'`. */
  id?: string;
  /** Button label. Default `'Add'`. */
  label?: string;
  /** Tooltip text. */
  tooltip?: string;
  /** Override className. */
  className?: string;
}

/**
 * Build an "Add" pill button that appears on hover for adding an asset to the
 * active set. Positioned at top-left, hover-only visibility.
 */
export function buildAddToSetWidget(
  onAdd: () => void,
  options?: AddToSetWidgetOptions,
): OverlayWidget {
  const label = options?.label ?? 'Add';
  return createBadgeWidget({
    id: options?.id ?? 'add-to-set',
    ...BADGE_SLOT.topLeft,
    visibility: { trigger: 'hover-container' },
    variant: 'icon-text',
    icon: 'plus',
    labelBinding: { kind: 'fn', target: 'label', fn: () => label },
    color: 'gray',
    tooltip: options?.tooltip,
    onClick: () => onAdd(),
    className:
      options?.className ??
      'border border-neutral-200 dark:border-neutral-700 !bg-white/95 dark:!bg-neutral-900/95 !text-neutral-700 dark:!text-neutral-200 hover:!bg-accent/10 hover:border-accent/40 shadow-sm text-[10px] font-medium',
    // Keep the media-type icon as the top-left stack leader so Add appears as
    // a secondary badge (same behavior as favorite under status on the right).
    priority: BADGE_PRIORITY.info - 1,
  });
}
