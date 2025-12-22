import { useState, useCallback, useRef } from 'react';

export interface ResizeEvent {
  /**
   * The change in position since drag started
   */
  delta: number;
  /**
   * The current mouse position (clientX or clientY depending on orientation)
   */
  position: number;
  /**
   * The original mouse event
   */
  event: MouseEvent;
}

export interface UseResizeHandleOptions {
  /**
   * Callback fired during resize with resize event data
   */
  onResize: (event: ResizeEvent) => void;
  /**
   * Orientation of the resize handle
   * - 'vertical': Resizes horizontally (left/right)
   * - 'horizontal': Resizes vertically (up/down)
   */
  orientation?: 'vertical' | 'horizontal';
  /**
   * Whether to call onResize on every mouse move (true) or only on mouse up (false)
   * @default true
   */
  immediate?: boolean;
}

export interface UseResizeHandleReturn {
  /**
   * Whether the handle is currently being dragged
   */
  isDragging: boolean;
  /**
   * Handler to attach to the resize handle's onMouseDown
   */
  handleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * A generic hook for handling resize operations via mouse drag.
 * Handles mouse event setup/cleanup and dragging state.
 * Provides delta, position, and raw event to the consumer for flexible resize calculations.
 *
 * @example
 * ```tsx
 * // Example 1: Delta-based resize (Control Center style)
 * const { isDragging, handleMouseDown } = useResizeHandle({
 *   onResize: ({ delta }) => {
 *     const newSize = Math.max(200, Math.min(800, initialSize + delta));
 *     setSize(newSize);
 *   },
 *   orientation: 'vertical'
 * });
 *
 * // Example 2: Position-based resize (Asset Viewer style)
 * const { isDragging, handleMouseDown } = useResizeHandle({
 *   onResize: ({ position, event }) => {
 *     const container = containerRef.current;
 *     if (!container) return;
 *     const rect = container.getBoundingClientRect();
 *     const percentage = ((rect.width - (position - rect.left)) / rect.width) * 100;
 *     const constrained = Math.max(20, Math.min(60, percentage));
 *     setPanelWidth(constrained);
 *   },
 *   orientation: 'vertical'
 * });
 *
 * return (
 *   <ResizeDivider
 *     onMouseDown={handleMouseDown}
 *     isDragging={isDragging}
 *     orientation="vertical"
 *   />
 * );
 * ```
 */
export function useResizeHandle({
  onResize,
  orientation = 'vertical',
  immediate = true,
}: UseResizeHandleOptions): UseResizeHandleReturn {
  const [isDragging, setIsDragging] = useState(false);
  const onResizeRef = useRef(onResize);

  // Keep ref up to date
  onResizeRef.current = onResize;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const startPos = orientation === 'vertical' ? e.clientX : e.clientY;
      let lastEvent: ResizeEvent | null = null;

      const onMove = (ev: MouseEvent) => {
        const currentPos = orientation === 'vertical' ? ev.clientX : ev.clientY;
        const delta = currentPos - startPos;

        const resizeEvent: ResizeEvent = {
          delta,
          position: currentPos,
          event: ev,
        };

        lastEvent = resizeEvent;

        // Call onResize immediately or store for later
        if (immediate) {
          onResizeRef.current(resizeEvent);
        }
      };

      const onUp = () => {
        setIsDragging(false);

        // If not immediate mode, call onResize on mouse up
        if (!immediate && lastEvent !== null) {
          onResizeRef.current(lastEvent);
        }

        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [orientation, immediate]
  );

  return {
    isDragging,
    handleMouseDown,
  };
}
