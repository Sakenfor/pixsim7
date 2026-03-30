/**
 * Popover — canonical component for click-triggered floating content.
 *
 * Composes PortalFloat (positioning + portal) with dismissal behaviours
 * (click-outside, Escape key). Use this for settings panels, menus,
 * or any rich content anchored to a trigger element.
 *
 * For hover-triggered flyouts that already use `useHoverExpand`, using
 * `<PortalFloat>` directly with `clamp` is usually sufficient.
 */

import React, { useEffect, useRef } from 'react';
import { PortalFloat, type AnchorPlacement, type AnchorAlign } from './PortalFloat';

export interface PopoverProps {
  /** Anchor element (or DOMRect) to position relative to */
  anchor: HTMLElement | DOMRect | null;
  /** Which side of the anchor to place content on */
  placement: AnchorPlacement;
  /** Cross-axis alignment (default: 'center') */
  align?: AnchorAlign;
  /** Gap between anchor and content in px (default: 8) */
  offset?: number;
  /** Whether the popover is visible */
  open: boolean;
  /** Called when the popover requests to close (click-outside or Escape) */
  onClose: () => void;
  /** Close when clicking outside the popover + trigger (default: true) */
  closeOnClickOutside?: boolean;
  /** Close when pressing Escape (default: true) */
  closeOnEscape?: boolean;
  /** Trigger element ref — excluded from click-outside detection */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Clamp content within viewport bounds (default: true) */
  clamp?: boolean;
  /** Minimum margin from viewport edges when clamping, in px (default: 8) */
  viewportMargin?: number;
  /** Content to render inside the popover */
  children: React.ReactNode;
  /** Additional className for the portal container */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Hover enter handler */
  onMouseEnter?: React.MouseEventHandler;
  /** Hover leave handler */
  onMouseLeave?: React.MouseEventHandler;
}

export function Popover({
  anchor,
  placement,
  align,
  offset,
  open,
  onClose,
  closeOnClickOutside = true,
  closeOnEscape = true,
  triggerRef,
  clamp = true,
  viewportMargin,
  children,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
}: PopoverProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Click-outside dismissal
  useEffect(() => {
    if (!open || !closeOnClickOutside) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        contentRef.current &&
        !contentRef.current.contains(target) &&
        !(triggerRef?.current && triggerRef.current.contains(target))
      ) {
        onClose();
      }
    };

    // Defer listener so the click that opened the popover doesn't immediately close it
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, closeOnClickOutside, triggerRef, onClose]);

  // Escape key dismissal
  useEffect(() => {
    if (!open || !closeOnEscape) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closeOnEscape, onClose]);

  // Dismiss on scroll/resize so the popover doesn't lag behind a moving anchor.
  // Scrolls originating inside the popover content itself are ignored.
  useEffect(() => {
    if (!open) return;

    const dismiss = () => onClose();
    const handleScroll = (e: Event) => {
      if (contentRef.current && contentRef.current.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('resize', dismiss);
    // Capture-phase scroll listener catches scrolls in any container
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <PortalFloat
      anchor={anchor}
      placement={placement}
      align={align}
      offset={offset}
      clamp={clamp}
      viewportMargin={viewportMargin}
      className={className}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div ref={contentRef}>{children}</div>
    </PortalFloat>
  );
}
