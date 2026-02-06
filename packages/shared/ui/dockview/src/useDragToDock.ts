/**
 * useDragToDock Hook
 *
 * Manages drag-to-dock behavior for floating panels.
 * Detects when a panel is dragged over a dockview and determines the drop zone.
 */

import { useCallback, useRef, useState } from 'react';
import { getDockviewHost } from '@pixsim7/shared.dockview.core';

export type DropZone = 'left' | 'right' | 'above' | 'below' | 'center';

export interface UseDragToDockOptions {
  /** ID of the panel being dragged */
  panelId: string;
  /** ID of the target dockview (default: 'workspace') */
  workspaceDockviewId?: string;
  /** Threshold for edge zones as percentage (default: 0.2 = 20%) */
  edgeThreshold?: number;
  /** Throttle interval in ms (default: 16ms ~60fps) */
  throttleMs?: number;
}

export interface UseDragToDockReturn {
  /** Whether the panel is currently being dragged */
  isDragging: boolean;
  /** The currently active drop zone, or null if not over workspace */
  activeDropZone: DropZone | null;
  /** The workspace element's bounding rect */
  workspaceRect: DOMRect | null;
  /** Call when drag starts */
  onDragStart: () => void;
  /** Call during drag with the panel's current bounding rect */
  onDrag: (panelRect: DOMRect) => void;
  /** Call when drag stops. Returns whether to dock and where */
  onDragStop: () => { shouldDock: boolean; zone: DropZone | null };
}

/**
 * Throttle function for performance optimization
 */
function throttle<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = ((...args: Parameters<T>) => {
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
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

/**
 * Detect which drop zone the panel center is in
 */
function detectDropZone(
  panelRect: DOMRect,
  workspaceRect: DOMRect,
  edgeThreshold: number
): DropZone | null {
  // Check if panel overlaps with workspace
  const overlaps = !(
    panelRect.right < workspaceRect.left ||
    panelRect.left > workspaceRect.right ||
    panelRect.bottom < workspaceRect.top ||
    panelRect.top > workspaceRect.bottom
  );

  if (!overlaps) return null;

  // Panel center point
  const cx = panelRect.x + panelRect.width / 2;
  const cy = panelRect.y + panelRect.height / 2;

  // Zone bounds based on threshold
  const left = workspaceRect.x + workspaceRect.width * edgeThreshold;
  const right = workspaceRect.x + workspaceRect.width * (1 - edgeThreshold);
  const top = workspaceRect.y + workspaceRect.height * edgeThreshold;
  const bottom = workspaceRect.y + workspaceRect.height * (1 - edgeThreshold);

  if (cx < left) return 'left';
  if (cx > right) return 'right';
  if (cy < top) return 'above';
  if (cy > bottom) return 'below';
  return 'center'; // dock as tab
}

/**
 * Get workspace element from dockview host
 */
function getWorkspaceElement(dockviewId: string): HTMLElement | null {
  const host = getDockviewHost(dockviewId);
  if (host?.api) {
    // Try to get the container element from the API
    const container = (host.api as any).element;
    if (container instanceof HTMLElement) {
      return container;
    }
  }
  // Fallback: query by data attribute
  return document.querySelector(`[data-smart-dockview="${dockviewId}"]`);
}

export function useDragToDock({
  panelId,
  workspaceDockviewId = 'workspace',
  edgeThreshold = 0.2,
  throttleMs = 16,
}: UseDragToDockOptions): UseDragToDockReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [activeDropZone, setActiveDropZone] = useState<DropZone | null>(null);
  const [workspaceRect, setWorkspaceRect] = useState<DOMRect | null>(null);

  // Use refs for values needed in callbacks
  const activeDropZoneRef = useRef<DropZone | null>(null);
  const workspaceRectRef = useRef<DOMRect | null>(null);

  // Keep refs in sync with state
  activeDropZoneRef.current = activeDropZone;
  workspaceRectRef.current = workspaceRect;

  // Throttled zone detection
  const throttledDetectRef = useRef<ReturnType<typeof throttle> | null>(null);

  const onDragStart = useCallback(() => {
    setIsDragging(true);
    setActiveDropZone(null);

    // Get workspace rect at drag start
    const workspaceEl = getWorkspaceElement(workspaceDockviewId);
    if (workspaceEl) {
      const rect = workspaceEl.getBoundingClientRect();
      setWorkspaceRect(rect);
      workspaceRectRef.current = rect;
    }

    // Create throttled detector
    throttledDetectRef.current = throttle((panelRect: DOMRect) => {
      const wsRect = workspaceRectRef.current;
      if (!wsRect) return;

      const zone = detectDropZone(panelRect, wsRect, edgeThreshold);
      if (zone !== activeDropZoneRef.current) {
        setActiveDropZone(zone);
        activeDropZoneRef.current = zone;
      }
    }, throttleMs);
  }, [workspaceDockviewId, edgeThreshold, throttleMs]);

  const onDrag = useCallback((panelRect: DOMRect) => {
    // Update workspace rect periodically (in case of resize)
    const workspaceEl = getWorkspaceElement(workspaceDockviewId);
    if (workspaceEl) {
      const rect = workspaceEl.getBoundingClientRect();
      workspaceRectRef.current = rect;
      setWorkspaceRect(rect);
    }

    throttledDetectRef.current?.(panelRect);
  }, [workspaceDockviewId]);

  const onDragStop = useCallback(() => {
    // Cancel any pending throttled calls
    throttledDetectRef.current?.cancel();
    throttledDetectRef.current = null;

    const zone = activeDropZoneRef.current;
    const shouldDock = zone !== null;

    // Reset state
    setIsDragging(false);
    setActiveDropZone(null);
    setWorkspaceRect(null);

    return { shouldDock, zone };
  }, []);

  return {
    isDragging,
    activeDropZone,
    workspaceRect,
    onDragStart,
    onDrag,
    onDragStop,
  };
}
