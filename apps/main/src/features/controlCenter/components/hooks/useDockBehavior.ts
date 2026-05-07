/**
 * useDockBehavior Hook
 *
 * Manages the reveal/hide behavior for docked control center positions.
 * Handles edge detection, auto-hide on mouse leave, and keyboard resize.
 */

import { useEffect, useRef, useCallback } from 'react';

import { useResizeHandle } from '@pixsim7/shared.ui';

import type { DockPosition, RetractedMode } from '@features/docks/stores';

import {
  REVEAL_STRIP_THRESHOLD,
  REVEAL_DWELL_MS,
  TOOLBAR_HEIGHT,
  LEAVE_BUFFER_THRESHOLD,
  KEYBOARD_RESIZE_STEP,
  THROTTLE,
  DOCK_HEIGHTS,
} from '../constants';

interface UseDockBehaviorOptions {
  /** Current dock position */
  dockPosition: DockPosition;
  /** How the dock appears when retracted ('hidden' = 6px strip, 'peek' = toolbar visible) */
  retractedMode: RetractedMode;
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
  retractedMode,
  open,
  pinned,
  height,
  setOpen,
  setHeight,
  dockRef,
}: UseDockBehaviorOptions): UseDockBehaviorReturn {
  // Use refs to avoid re-creating event listeners on every state change
  const openRef = useRef(open);
  const heightRef = useRef(height);
  const startHeightRef = useRef(height);

  useEffect(() => {
    openRef.current = open;
    heightRef.current = height;
  }, [open, height]);

  // Clamp dock size to configured min/max bounds
  const clampSize = useCallback(
    (value: number) => {
      if (dockPosition === 'floating') {
        return value;
      }

      const orientation = dockPosition === 'left' || dockPosition === 'right'
        ? 'vertical'
        : 'horizontal';

      const { min, max } = DOCK_HEIGHTS[orientation];
      return Math.max(min, Math.min(max, value));
    },
    [dockPosition],
  );

  // Auto-hide when mouse leaves (disabled for floating mode)
  useEffect(() => {
    if (dockPosition === 'floating') return;

    // In peek mode the visible toolbar zone is larger — use it as the leave buffer
    // to prevent close→reopen flicker when the mouse moves into the peek strip
    const leaveBuffer = retractedMode === 'peek' ? TOOLBAR_HEIGHT : LEAVE_BUFFER_THRESHOLD;

    function onMouseLeave(e: MouseEvent) {
      if (pinned) return;

      const winH = window.innerHeight;
      const winW = window.innerWidth;

      // If leaving to the reveal strip, keep open
      if (dockPosition === 'bottom' && e.clientY >= winH - leaveBuffer) return;
      if (dockPosition === 'top' && e.clientY <= leaveBuffer) return;
      if (dockPosition === 'left' && e.clientX <= leaveBuffer) return;
      if (dockPosition === 'right' && e.clientX >= winW - leaveBuffer) return;

      setOpen(false);
    }

    const node = dockRef.current;
    if (!node) return;

    node.addEventListener('mouseleave', onMouseLeave);
    return () => node.removeEventListener('mouseleave', onMouseLeave);
  }, [pinned, setOpen, dockPosition, retractedMode, dockRef]);

  // Reveal strip hover to open (disabled for floating mode).
  // Uses a dwell timer so quick mouse pass-bys don't trigger open.
  useEffect(() => {
    if (dockPosition === 'floating') return;

    const threshold = REVEAL_STRIP_THRESHOLD;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;

    function clearDwell() {
      if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    }

    const onMove = throttle((e: MouseEvent) => {
      if (openRef.current) {
        clearDwell();
        return;
      }

      const node = dockRef.current;
      if (!node) return;

      const winH = window.innerHeight;
      const winW = window.innerWidth;

      // Check appropriate edge based on dock position
      let nearEdge = false;
      if (dockPosition === 'bottom' && e.clientY >= winH - threshold) nearEdge = true;
      if (dockPosition === 'top' && e.clientY <= threshold) nearEdge = true;
      if (dockPosition === 'left' && e.clientX <= threshold) nearEdge = true;
      if (dockPosition === 'right' && e.clientX >= winW - threshold) nearEdge = true;

      if (!nearEdge) {
        clearDwell();
        return;
      }

      // Check if mouse is actually over the dock element's bounds
      const rect = node.getBoundingClientRect();
      const isOverDock =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!isOverDock) {
        clearDwell();
        return;
      }

      // Start dwell timer if not already running
      if (!dwellTimer) {
        dwellTimer = setTimeout(() => {
          dwellTimer = null;
          if (!openRef.current) setOpen(true);
        }, REVEAL_DWELL_MS);
      }
    }, THROTTLE.mousemove);

    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      clearDwell();
    };
  }, [setOpen, dockPosition, retractedMode, dockRef]);

  // Keyboard resize support
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!openRef.current) return;

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
        setHeight(clampSize(heightRef.current + delta));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setHeight]);

  // For 'right' and 'bottom' docks, dragging towards the dock shrinks it;
  // for 'left' and 'top', dragging away from the dock grows it. Encode as a
  // sign multiplier on the delta.
  const sign = dockPosition === 'right' || dockPosition === 'bottom' ? -1 : 1;
  const orientation = dockPosition === 'left' || dockPosition === 'right'
    ? 'vertical'
    : 'horizontal';

  const { isDragging: dragging, handleMouseDown } = useResizeHandle({
    orientation,
    onResize: ({ delta }) => {
      setHeight(clampSize(startHeightRef.current + sign * delta));
    },
  });

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      startHeightRef.current = heightRef.current;
      handleMouseDown(e);
    },
    [handleMouseDown]
  );

  return {
    dragging,
    startResize,
  };
}
