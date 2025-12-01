/**
 * useDockBehavior Hook
 *
 * Manages the reveal/hide behavior for docked control center positions.
 * Handles edge detection, auto-hide on mouse leave, and keyboard resize.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { DockPosition } from '@/stores/controlCenterStore';
import {
  REVEAL_STRIP_THRESHOLD,
  LEAVE_BUFFER_THRESHOLD,
  KEYBOARD_RESIZE_STEP,
  THROTTLE,
} from '../constants';

interface UseDockBehaviorOptions {
  /** Current dock position */
  dockPosition: DockPosition;
  /** Whether the dock is currently open */
  open: boolean;
  /** Whether the dock is pinned (won't auto-hide) */
  pinned: boolean;
  /** Current height/width of the dock */
  height: number;
  /** Callback to set open state */
  setOpen: (open: boolean) => void;
  /** Callback to set height */
  setHeight: (height: number) => void;
  /** Ref to the dock container element */
  dockRef: React.RefObject<HTMLDivElement>;
}

interface UseDockBehaviorReturn {
  /** Whether currently dragging to resize */
  dragging: boolean;
  /** Start resize handler for mouse down */
  startResize: (e: React.MouseEvent) => void;
}

/**
 * Throttle function for performance optimization
 */
function throttle<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = delay - (now - lastCall);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

export function useDockBehavior({
  dockPosition,
  open,
  pinned,
  height,
  setOpen,
  setHeight,
  dockRef,
}: UseDockBehaviorOptions): UseDockBehaviorReturn {
  // Track dragging state
  const draggingRef = useRef(false);

  // Use refs to avoid re-creating event listeners on every state change
  const openRef = useRef(open);
  const heightRef = useRef(height);

  useEffect(() => {
    openRef.current = open;
    heightRef.current = height;
  }, [open, height]);

  // Auto-hide when mouse leaves (disabled for floating mode)
  useEffect(() => {
    if (dockPosition === 'floating') return;

    function onMouseLeave(e: MouseEvent) {
      if (pinned) return;

      const winH = window.innerHeight;
      const winW = window.innerWidth;

      // If leaving to the reveal strip, keep open
      if (dockPosition === 'bottom' && e.clientY >= winH - LEAVE_BUFFER_THRESHOLD) return;
      if (dockPosition === 'top' && e.clientY <= LEAVE_BUFFER_THRESHOLD) return;
      if (dockPosition === 'left' && e.clientX <= LEAVE_BUFFER_THRESHOLD) return;
      if (dockPosition === 'right' && e.clientX >= winW - LEAVE_BUFFER_THRESHOLD) return;

      setOpen(false);
    }

    const node = dockRef.current;
    if (!node) return;

    node.addEventListener('mouseleave', onMouseLeave);
    return () => node.removeEventListener('mouseleave', onMouseLeave);
  }, [pinned, setOpen, dockPosition, dockRef]);

  // Reveal strip hover to open (disabled for floating mode)
  useEffect(() => {
    if (dockPosition === 'floating') return;

    const onMove = throttle((e: MouseEvent) => {
      // Check ref to avoid re-creating listener
      if (openRef.current) return;

      const winH = window.innerHeight;
      const winW = window.innerWidth;

      // Check appropriate edge based on dock position
      let shouldOpen = false;
      if (dockPosition === 'bottom' && e.clientY >= winH - REVEAL_STRIP_THRESHOLD) shouldOpen = true;
      if (dockPosition === 'top' && e.clientY <= REVEAL_STRIP_THRESHOLD) shouldOpen = true;
      if (dockPosition === 'left' && e.clientX <= REVEAL_STRIP_THRESHOLD) shouldOpen = true;
      if (dockPosition === 'right' && e.clientX >= winW - REVEAL_STRIP_THRESHOLD) shouldOpen = true;

      if (shouldOpen) setOpen(true);
    }, THROTTLE.mousemove);

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [setOpen, dockPosition]);

  // Keyboard resize support
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!openRef.current) return;

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
        setHeight(heightRef.current + delta);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setHeight]);

  // Start resize handler
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;

      const startY = e.clientY;
      const startX = e.clientX;
      const startH = height;
      const pos = dockPosition;

      // Force re-render to update dragging state
      const forceUpdate = () => {
        // Trigger a state update in parent if needed
      };

      function onMove(ev: MouseEvent) {
        if (pos === 'left') {
          const dx = ev.clientX - startX;
          setHeight(startH + dx);
        } else if (pos === 'right') {
          const dx = startX - ev.clientX;
          setHeight(startH + dx);
        } else if (pos === 'top') {
          const dy = ev.clientY - startY;
          setHeight(startH + dy);
        } else {
          // bottom
          const dy = startY - ev.clientY;
          setHeight(startH + dy);
        }
      }

      function onUp() {
        draggingRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [height, dockPosition, setHeight]
  );

  return {
    dragging: draggingRef.current,
    startResize,
  };
}
