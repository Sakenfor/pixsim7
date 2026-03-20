/**
 * useDragToDock Hook
 *
 * Manages drag-to-dock behavior for floating panels.
 * Detects when a panel is dragged over any registered dockview and determines the drop zone.
 * When multiple dockviews overlap, prefers the smallest (most deeply nested) target.
 * Drop zones only appear after holding over a dockview for a configurable delay.
 */

import React, { useCallback, useRef, useState, type RefObject } from 'react';
import { getDockviewHost, getDockviewHostIds } from '@pixsim7/shared.dockview.core';

export type DropZone = 'left' | 'right' | 'above' | 'below' | 'center';

export interface DragToDockTarget {
  dockviewId: string;
  rect: DOMRect;
  zone: DropZone;
}

export interface UseDragToDockOptions {
  /** ID of the panel being dragged */
  panelId: string;
  /** ID of a single target dockview (legacy single-target mode) */
  workspaceDockviewId?: string;
  /** Filter which dockviews this panel can dock into */
  canDockInto?: (dockviewId: string) => boolean;
  /** Threshold for edge zones as percentage (default: 0.2 = 20%) */
  edgeThreshold?: number;
  /** Throttle interval in ms (default: 16ms ~60fps) */
  throttleMs?: number;
  /** Hold delay in ms before dock zones appear (default: 400ms). Set 0 to disable. */
  holdDelayMs?: number;
  /**
   * Inner inset (px) applied to dockview bounds for activation.
   * Creates a "moat" near edges where drag does not activate docking.
   * Default: 0 (no inset).
   */
  activationInsetPx?: number;
  /** Ref to the element being dragged. Dockviews inside this element are excluded from targeting. */
  dragElementRef?: RefObject<HTMLElement | null>;
}

export interface UseDragToDockReturn {
  /** Whether the panel is currently being dragged */
  isDragging: boolean;
  /** Ref to the currently active drop zone (updated synchronously, no re-render) */
  activeDropZoneRef: React.RefObject<DropZone | null>;
  /** Ref to the active target dockview info (updated synchronously, no re-render) */
  activeTargetRef: React.RefObject<DragToDockTarget | null>;
  /** Call when drag starts */
  onDragStart: () => void;
  /** Call during drag with the panel's current bounding rect */
  onDrag: (panelRect: DOMRect) => void;
  /** Call when drag stops. Returns whether to dock, where, and which dockview */
  onDragStop: () => { shouldDock: boolean; zone: DropZone | null; targetDockviewId: string | null };
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
  edgeThreshold: number,
  activationInsetPx: number,
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

  // Optional activation inset (dead zone near container edges)
  const maxInset = Math.max(
    0,
    Math.min(
      activationInsetPx,
      workspaceRect.width / 2 - 1,
      workspaceRect.height / 2 - 1,
    ),
  );

  const activeLeft = workspaceRect.x + maxInset;
  const activeRight = workspaceRect.x + workspaceRect.width - maxInset;
  const activeTop = workspaceRect.y + maxInset;
  const activeBottom = workspaceRect.y + workspaceRect.height - maxInset;

  // If center is inside container but only in the moat area, don't dock.
  if (cx < activeLeft || cx > activeRight || cy < activeTop || cy > activeBottom) {
    return null;
  }

  // Zone bounds based on threshold
  const activeWidth = activeRight - activeLeft;
  const activeHeight = activeBottom - activeTop;
  const left = activeLeft + activeWidth * edgeThreshold;
  const right = activeLeft + activeWidth * (1 - edgeThreshold);
  const top = activeTop + activeHeight * edgeThreshold;
  const bottom = activeTop + activeHeight * (1 - edgeThreshold);

  if (cx < left) return 'left';
  if (cx > right) return 'right';
  if (cy < top) return 'above';
  if (cy > bottom) return 'below';
  return 'center'; // dock as tab
}

/**
 * Get dockview container element from host
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

/**
 * Find the best dockview target from all registered hosts.
 * When multiple overlap, prefer the smallest bounding area (most deeply nested).
 */
function findBestTarget(
  panelRect: DOMRect,
  edgeThreshold: number,
  activationInsetPx: number,
  candidateIds: string[],
  canDockInto?: (id: string) => boolean,
  excludeElement?: HTMLElement | null,
): DragToDockTarget | null {
  let best: DragToDockTarget | null = null;
  let bestArea = Infinity;

  for (const id of candidateIds) {
    if (canDockInto && !canDockInto(id)) continue;

    const el = getWorkspaceElement(id);
    if (!el) continue;

    // Skip dockviews that are inside the element being dragged
    // (e.g. a floating panel with its own internal dockview)
    if (excludeElement && excludeElement.contains(el)) continue;

    const rect = el.getBoundingClientRect();
    // Skip zero-area rects (hidden dockviews)
    const area = rect.width * rect.height;
    if (area <= 0) continue;

    const zone = detectDropZone(panelRect, rect, edgeThreshold, activationInsetPx);
    if (zone && area < bestArea) {
      best = { dockviewId: id, rect, zone };
      bestArea = area;
    }
  }

  return best;
}

export function useDragToDock({
  panelId,
  workspaceDockviewId,
  canDockInto,
  edgeThreshold = 0.2,
  throttleMs = 16,
  holdDelayMs = 400,
  activationInsetPx = 0,
  dragElementRef,
}: UseDragToDockOptions): UseDragToDockReturn {
  const [isDragging, setIsDragging] = useState(false);

  // Refs are the source of truth during drag — never use setState mid-drag
  // to avoid re-rendering <Rnd> which can cause react-rnd to lose drag tracking.
  const activeDropZoneRef = useRef<DropZone | null>(null);
  const activeTargetRef = useRef<DragToDockTarget | null>(null);

  // Hold delay state: which dockview we're hovering over before the delay fires
  const pendingDockviewIdRef = useRef<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The dockview ID that has been "activated" (hold delay passed)
  const activatedDockviewIdRef = useRef<string | null>(null);

  // Throttled zone detection
  const throttledDetectRef = useRef<ReturnType<typeof throttle> | null>(null);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const clearActive = () => {
    clearHoldTimer();
    pendingDockviewIdRef.current = null;
    activatedDockviewIdRef.current = null;
    committedAtRef.current = 0;
    activeDropZoneRef.current = null;
    activeTargetRef.current = null;
  };

  // Track when a target was committed so onDragStop can enforce a minimum
  // visible time — the overlay needs 2 React render cycles + a paint before
  // the user can actually see it.
  const committedAtRef = useRef<number>(0);

  const commitTarget = (target: DragToDockTarget) => {
    committedAtRef.current = Date.now();
    activatedDockviewIdRef.current = target.dockviewId;
    activeDropZoneRef.current = target.zone;
    activeTargetRef.current = target;
  };

  const onDragStart = useCallback(() => {
    setIsDragging(true);
    activeDropZoneRef.current = null;
    activeTargetRef.current = null;
    pendingDockviewIdRef.current = null;
    activatedDockviewIdRef.current = null;
    clearHoldTimer();

    // Create throttled detector
    throttledDetectRef.current = throttle((panelRect: DOMRect) => {
      // Determine candidate dockview IDs
      const candidateIds = workspaceDockviewId
        ? [workspaceDockviewId]
        : getDockviewHostIds();

      const target = findBestTarget(
        panelRect,
        edgeThreshold,
        activationInsetPx,
        candidateIds,
        canDockInto,
        dragElementRef?.current,
      );

      if (!target) {
        // Left all dockviews — clear everything
        if (activeTargetRef.current || pendingDockviewIdRef.current) {
          clearActive();
        }
        return;
      }

      const targetId = target.dockviewId;

      // Already activated on this dockview — update zone in real-time (refs only, no re-render)
      if (targetId === activatedDockviewIdRef.current) {
        const prevZone = activeDropZoneRef.current;
        if (target.zone !== prevZone || targetId !== activeTargetRef.current?.dockviewId) {
          activeDropZoneRef.current = target.zone;
          activeTargetRef.current = target;
        } else {
          // Same zone, just update rect for overlay positioning
          activeTargetRef.current = target;
        }
        return;
      }

      // Hold delay disabled — activate immediately
      if (holdDelayMs <= 0) {
        commitTarget(target);
        return;
      }

      // Already pending on this dockview — keep waiting
      if (targetId === pendingDockviewIdRef.current) {
        return;
      }

      // New dockview — start hold timer
      clearHoldTimer();
      clearActive();
      pendingDockviewIdRef.current = targetId;

      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        // Re-check: is the panel still over this dockview?
        // We use the pending ref as a guard — if it changed, the timer is stale.
        if (pendingDockviewIdRef.current !== targetId) return;

        // Activate with the latest zone for this dockview
        const el = getWorkspaceElement(targetId);
        if (!el) return;
        // We don't have the current panelRect here, so commit with the target
        // we found when the timer started. The next throttle tick will update the zone.
        commitTarget(target);
      }, holdDelayMs);
    }, throttleMs);
  }, [workspaceDockviewId, canDockInto, edgeThreshold, throttleMs, holdDelayMs, activationInsetPx]);

  const onDrag = useCallback((panelRect: DOMRect) => {
    throttledDetectRef.current?.(panelRect);
  }, []);

  const onDragStop = useCallback(() => {
    // Cancel any pending throttled calls
    throttledDetectRef.current?.cancel();
    throttledDetectRef.current = null;
    clearHoldTimer();

    const target = activeTargetRef.current;
    const zone = target?.zone ?? null;
    const targetDockviewId = target?.dockviewId ?? null;

    // Only allow docking if the zone was active long enough for the overlay
    // to render and be visible to the user (~2 React renders + paint).
    const MIN_VISIBLE_MS = 120;
    const visibleDuration = committedAtRef.current > 0 ? Date.now() - committedAtRef.current : 0;
    const shouldDock = zone !== null && visibleDuration >= MIN_VISIBLE_MS;

    // Reset state
    setIsDragging(false);
    activeDropZoneRef.current = null;
    activeTargetRef.current = null;
    pendingDockviewIdRef.current = null;
    activatedDockviewIdRef.current = null;
    committedAtRef.current = 0;

    return { shouldDock, zone, targetDockviewId };
  }, []);

  return {
    isDragging,
    activeDropZoneRef,
    activeTargetRef,
    onDragStart,
    onDrag,
    onDragStop,
  };
}
