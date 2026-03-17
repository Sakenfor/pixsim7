/**
 * PortalFloat — shared utility for positioning portaled popover content
 * relative to an anchor element.
 *
 * Provides:
 * - `getAnchoredPosition()` — pure function returning fixed-position CSS styles
 * - `<PortalFloat>` — component that portals children to document.body with anchored positioning
 *
 * Use these instead of ad-hoc getBoundingClientRect computations whenever
 * content needs to escape overflow-hidden or stacking-context constraints.
 */

import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

import { Z } from './zIndex';

// ============================================================================
// Types
// ============================================================================

/** Which side of the anchor element to place content on */
export type AnchorPlacement = 'top' | 'bottom' | 'left' | 'right';

/** Cross-axis alignment relative to the anchor */
export type AnchorAlign = 'center' | 'start' | 'end';

export interface AnchoredPositionOptions {
  /** The anchor element to position relative to */
  anchor: HTMLElement | DOMRect | null;
  /** Which side of the anchor to place content on */
  placement: AnchorPlacement;
  /** Cross-axis alignment (default: 'center') */
  align?: AnchorAlign;
  /** Gap between anchor and content in px (default: 8) */
  offset?: number;
}

// ============================================================================
// Position computation
// ============================================================================

/**
 * Compute fixed-position CSS styles to place a portal'd element
 * relative to an anchor element.
 *
 * @example
 * ```tsx
 * const style = getAnchoredPosition({
 *   anchor: triggerRef.current,
 *   placement: 'top',
 *   offset: 8,
 * });
 * // → { bottom: 520, left: 340, transform: 'translateX(-50%)' }
 * ```
 */
export function getAnchoredPosition({
  anchor,
  placement,
  align = 'center',
  offset = 8,
}: AnchoredPositionOptions): React.CSSProperties {
  if (!anchor) return {};

  const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  // Main axis: which edge to anchor against
  const mainAxis = getMainAxisStyle(rect, placement, offset, vh, vw);
  // Cross axis: alignment along the perpendicular axis
  const crossAxis = getCrossAxisStyle(
    rect,
    placement === 'top' || placement === 'bottom' ? 'horizontal' : 'vertical',
    align,
    vh,
    vw,
  );

  return { ...mainAxis, ...crossAxis };
}

function getMainAxisStyle(
  rect: DOMRect,
  placement: AnchorPlacement,
  offset: number,
  vh: number,
  vw: number,
): React.CSSProperties {
  switch (placement) {
    case 'top':
      return { bottom: vh - rect.top + offset };
    case 'bottom':
      return { top: rect.bottom + offset };
    case 'left':
      return { right: vw - rect.left + offset };
    case 'right':
      return { left: rect.right + offset };
  }
}

function getCrossAxisStyle(
  rect: DOMRect,
  axis: 'horizontal' | 'vertical',
  align: AnchorAlign,
  vh: number,
  vw: number,
): React.CSSProperties {
  if (axis === 'horizontal') {
    switch (align) {
      case 'center':
        return { left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
      case 'start':
        return { left: rect.left };
      case 'end':
        return { right: vw - rect.right };
    }
  } else {
    switch (align) {
      case 'center':
        return { top: rect.top + rect.height / 2, transform: 'translateY(-50%)' };
      case 'start':
        return { top: rect.top };
      case 'end':
        return { bottom: vh - rect.bottom };
    }
  }
}

// ============================================================================
// Component
// ============================================================================

export interface PortalFloatProps {
  /** Anchor element (or its DOMRect) to position relative to */
  anchor: HTMLElement | DOMRect | null;
  /** Which side of the anchor to place content on */
  placement: AnchorPlacement;
  /** Cross-axis alignment (default: 'center') */
  align?: AnchorAlign;
  /** Gap between anchor and content in px (default: 8) */
  offset?: number;
  /** Content to render in the portal */
  children: React.ReactNode;
  /** Additional className (appended to 'fixed z-popover') */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Hover enter handler (for hover delegation from trigger to portal content) */
  onMouseEnter?: React.MouseEventHandler;
  /** Hover leave handler */
  onMouseLeave?: React.MouseEventHandler;
  /** Clamp content within viewport bounds after render (default: false) */
  clamp?: boolean;
  /** Minimum margin from viewport edges when clamping, in px (default: 8) */
  viewportMargin?: number;
}

/**
 * Renders children in a portal at document.body, positioned relative to
 * an anchor element with `position: fixed` and `z-popover`.
 *
 * @example
 * ```tsx
 * {isOpen && (
 *   <PortalFloat anchor={buttonRef.current} placement="top" offset={6}>
 *     <MyPopoverContent />
 *   </PortalFloat>
 * )}
 * ```
 */
export function PortalFloat({
  anchor,
  placement,
  align,
  offset,
  children,
  className,
  style: extraStyle,
  onMouseEnter,
  onMouseLeave,
  clamp = false,
  viewportMargin = 8,
}: PortalFloatProps) {
  const ref = useRef<HTMLDivElement>(null);

  // After layout, nudge the element so it stays within viewport bounds.
  // Runs every commit because the anchor rect may change between renders.
  useLayoutEffect(() => {
    if (!clamp || !ref.current) return;
    clampToViewport(ref.current, viewportMargin);
  });

  if (!anchor) return null;

  const positionStyle = getAnchoredPosition({ anchor, placement, align, offset });

  return createPortal(
    <div
      ref={ref}
      className={clsx('fixed', className)}
      style={{ zIndex: Z.floatOverlay, ...positionStyle, ...extraStyle }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

// ============================================================================
// Viewport clamping
// ============================================================================

/**
 * Imperatively nudge an element's fixed position so it stays within the
 * visible viewport. Called from useLayoutEffect so adjustments happen
 * before paint — no flash of mispositioned content.
 */
function clampToViewport(el: HTMLElement, margin: number) {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Vertical
  if (rect.bottom > vh - margin) {
    el.style.top = `${Math.max(margin, vh - margin - rect.height)}px`;
    el.style.bottom = 'auto';
  } else if (rect.top < margin) {
    el.style.top = `${margin}px`;
    el.style.bottom = 'auto';
  }

  // Horizontal
  if (rect.right > vw - margin) {
    el.style.left = `${Math.max(margin, vw - margin - rect.width)}px`;
    el.style.right = 'auto';
    el.style.transform = '';
  } else if (rect.left < margin) {
    el.style.left = `${margin}px`;
    el.style.right = 'auto';
    el.style.transform = '';
  }
}
