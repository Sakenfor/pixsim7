import type { CSSProperties } from 'react';

export type PopupVerticalPlacement = 'top' | 'bottom';

type RectLike = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>;

export interface ViewportAwarePopupOptions {
  /** Anchor rect in viewport coordinates (e.g. caret or trigger bounds). */
  anchorRect: RectLike;
  /** Positioning container rect in viewport coordinates. */
  containerRect: RectLike;
  /** Popup width used for horizontal clamping. */
  popupWidth: number;
  /** Maximum popup height before internal scrolling. */
  popupMaxHeight: number;
  /** Preferred vertical side relative to anchor (default: bottom). */
  preferredPlacement?: PopupVerticalPlacement;
  /** Gap between anchor and popup in px (default: 4). */
  offset?: number;
  /** Viewport edge margin in px (default: 8). */
  viewportMargin?: number;
  /** Minimum preferred visible space before flipping (default: 160). */
  minVisibleHeight?: number;
}

export interface ViewportAwarePopupResult {
  placement: PopupVerticalPlacement;
  availableHeight: number;
  style: CSSProperties;
}

/**
 * Compute absolute-position style for a popup that:
 * 1) flips vertically near viewport edges, and
 * 2) clamps horizontally to stay in view.
 *
 * Returned `style` is relative to `containerRect`.
 */
export function getViewportAwarePopupPosition({
  anchorRect,
  containerRect,
  popupWidth,
  popupMaxHeight,
  preferredPlacement = 'bottom',
  offset = 4,
  viewportMargin = 8,
  minVisibleHeight = 160,
}: ViewportAwarePopupOptions): ViewportAwarePopupResult {
  if (typeof window === 'undefined') {
    return {
      placement: preferredPlacement,
      availableHeight: popupMaxHeight,
      style: {
        left: anchorRect.left - containerRect.left,
        top: anchorRect.bottom - containerRect.top + offset,
        maxHeight: popupMaxHeight,
      },
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceBelow = Math.max(0, viewportHeight - viewportMargin - anchorRect.bottom - offset);
  const spaceAbove = Math.max(0, anchorRect.top - viewportMargin - offset);

  const preferredSpace = preferredPlacement === 'bottom' ? spaceBelow : spaceAbove;
  const alternatePlacement: PopupVerticalPlacement = preferredPlacement === 'bottom' ? 'top' : 'bottom';
  const alternateSpace = alternatePlacement === 'bottom' ? spaceBelow : spaceAbove;
  const minimumDesiredSpace = Math.min(minVisibleHeight, popupMaxHeight);

  const placement =
    preferredSpace < minimumDesiredSpace && alternateSpace > preferredSpace
      ? alternatePlacement
      : preferredPlacement;

  const availableHeight = placement === 'bottom' ? spaceBelow : spaceAbove;
  const fallbackHeight = Math.max(spaceAbove, spaceBelow);
  const maxHeight = Math.min(popupMaxHeight, Math.max(0, availableHeight || fallbackHeight));

  const minLeft = viewportMargin;
  const maxLeft = Math.max(minLeft, viewportWidth - viewportMargin - popupWidth);
  const clampedLeft = clamp(anchorRect.left, minLeft, maxLeft);

  const style: CSSProperties = {
    left: clampedLeft - containerRect.left,
    maxHeight,
  };

  if (placement === 'bottom') {
    style.top = anchorRect.bottom - containerRect.top + offset;
    style.bottom = 'auto';
  } else {
    style.bottom = containerRect.bottom - anchorRect.top + offset;
    style.top = 'auto';
  }

  return { placement, availableHeight, style };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

