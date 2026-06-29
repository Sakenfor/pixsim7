import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Dropdown } from './Dropdown';
import { Z } from './zIndex';

const CURSOR_MENU_SCROLL_STYLE = {
  maxHeight: 'min(420px, calc(100dvh - 16px))',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
} satisfies CSSProperties;

export interface CursorMenuPosition {
  x: number;
  y: number;
}

export interface CursorMenuProps {
  position: CursorMenuPosition | null;
  onClose: () => void;
  children: ReactNode;
  minWidth?: string;
  className?: string;
  viewportMargin?: number;
  closeOnOutsideClick?: boolean;
  scrollable?: boolean;
}

/**
 * Cursor-positioned menu shell for right-click and pointer menus.
 * It portals to document.body, clamps to the viewport after measuring, and
 * delegates Escape/outside-click dismissal plus keyboard handling to Dropdown.
 */
export function CursorMenu({
  position,
  onClose,
  children,
  minWidth = '160px',
  className,
  viewportMargin = 8,
  closeOnOutsideClick = true,
  scrollable = true,
}: CursorMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [clampedPosition, setClampedPosition] = useState(position);

  useLayoutEffect(() => {
    setClampedPosition(position);
  }, [position]);

  useLayoutEffect(() => {
    if (!position) return;

    const el = rootRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const maxX = window.innerWidth - viewportMargin - rect.width;
    const maxY = window.innerHeight - viewportMargin - rect.height;
    setClampedPosition((prev) => {
      const next = {
        x: Math.max(viewportMargin, Math.min(position.x, maxX)),
        y: Math.max(viewportMargin, Math.min(position.y, maxY)),
      };
      return prev?.x === next.x && prev.y === next.y ? prev : next;
    });
  }, [position, viewportMargin]);

  if (!position || !clampedPosition) return null;

  return createPortal(
    <div
      ref={rootRef}
      data-cursor-menu-root
      className="fixed"
      style={{
        zIndex: Z.floatOverlay,
        left: clampedPosition.x,
        top: clampedPosition.y,
      }}
    >
      <Dropdown
        isOpen
        onClose={onClose}
        positionMode="static"
        closeOnOutsideClick={closeOnOutsideClick}
        minWidth={minWidth}
        className={className}
        scrollViewportStyle={scrollable ? CURSOR_MENU_SCROLL_STYLE : undefined}
        hideScrollbar={scrollable}
        scrollIndicators={scrollable}
      >
        {children}
      </Dropdown>
    </div>,
    document.body,
  );
}
