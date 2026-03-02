import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

function setsEqual(a: Set<number> | null, b: Set<number> | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

export interface MasonryGridProps {
  items: React.ReactNode[];
  columnGap?: number;
  rowGap?: number;
  minColumnWidth?: number;
  /** Ref to the scroll parent for viewport-aware virtualization */
  scrollParentRef?: React.RefObject<HTMLElement | null>;
  /** Pixel overscan beyond viewport edges (default 300) */
  overscan?: number;
}

export function MasonryGrid({
  items,
  columnGap = 16,
  rowGap = 16,
  minColumnWidth = 260,
  scrollParentRef,
  overscan = 300,
}: MasonryGridProps) {
  // JS-driven masonry layout for full control over placement
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [positions, setPositions] = useState<
    { top: number; left: number; height: number }[]
  >([]);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [columnWidth, setColumnWidth] = useState<number>(0);
  const [layoutVersion, setLayoutVersion] = useState<number>(0);

  // ── Virtualization state ─────────────────────────────────────────────
  const measuredHeightsRef = useRef<Map<number, number>>(new Map());
  const [hasInitialLayout, setHasInitialLayout] = useState(false);
  const containerOffsetRef = useRef(0);

  // Scroll position tracked via refs — no re-render on scroll
  const scrollTopRef = useRef(0);
  const viewportHeightRef = useRef(
    typeof window !== 'undefined' ? window.innerHeight : 1000,
  );

  // Visible set is state — only re-renders when the actual set of visible items changes
  const [visibleSet, setVisibleSet] = useState<Set<number> | null>(null);

  // Ref mirrors for values needed in the scroll handler
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const hasInitialLayoutRef = useRef(hasInitialLayout);
  hasInitialLayoutRef.current = hasInitialLayout;
  const itemCountRef = useRef(items.length);
  itemCountRef.current = items.length;

  // Compute visible set from current refs and update state only if it changed
  const updateVisibleSet = useCallback(() => {
    if (!hasInitialLayoutRef.current || !scrollParentRef?.current) {
      setVisibleSet((prev) => (prev === null ? prev : null));
      return;
    }

    const pos = positionsRef.current;
    const offset = containerOffsetRef.current;
    const viewTop = scrollTopRef.current - overscan;
    const viewBottom = scrollTopRef.current + viewportHeightRef.current + overscan;
    const count = itemCountRef.current;

    const newSet = new Set<number>();
    for (let i = 0; i < count; i++) {
      const p = pos[i];
      if (!p || p.height === 0 || !measuredHeightsRef.current.has(i)) {
        newSet.add(i); // unmeasured — must render to get height
        continue;
      }
      const itemTop = offset + p.top;
      const itemBottom = itemTop + p.height;
      if (itemBottom > viewTop && itemTop < viewBottom) {
        newSet.add(i);
      }
    }

    setVisibleSet((prev) => (setsEqual(prev, newSet) ? prev : newSet));
  }, [overscan, scrollParentRef]);

  // Reset virtualization when items are removed / filtered
  const prevItemCountRef = useRef(items.length);
  useEffect(() => {
    if (items.length < prevItemCountRef.current || items.length === 0) {
      measuredHeightsRef.current.clear();
      setHasInitialLayout(false);
    }
    prevItemCountRef.current = items.length;
  }, [items.length]);

  // Recompute visible set when positions or hasInitialLayout change
  useEffect(() => {
    updateVisibleSet();
  }, [positions, hasInitialLayout, updateVisibleSet]);

  // ── Scroll tracking ──────────────────────────────────────────────────
  // Relayout is suppressed while scrolling and during a settling window after
  // scroll stops, so that images loading from cache don't cause individual shifts.
  const suppressRelayoutRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRelayoutRef = useRef(false);

  useEffect(() => {
    const scrollEl = scrollParentRef?.current;
    if (!scrollEl) return;

    let rafId: number | null = null;

    const updateOffset = () => {
      const containerEl = containerRef.current;
      if (containerEl && scrollEl) {
        const containerRect = containerEl.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        containerOffsetRef.current =
          containerRect.top - scrollRect.top + scrollEl.scrollTop;
      }
    };

    const flushPendingRelayout = () => {
      suppressRelayoutRef.current = false;
      if (pendingRelayoutRef.current) {
        pendingRelayoutRef.current = false;
        setLayoutVersion((v) => v + 1);
      }
    };

    const onScroll = () => {
      suppressRelayoutRef.current = true;

      // Clear both timers on each scroll event
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);

      // After 150ms idle: scroll stopped, start settling window
      scrollIdleTimerRef.current = setTimeout(() => {
        // Settling: keep suppressing for another 250ms so cached images
        // finish loading without triggering individual relayouts
        settleTimerRef.current = setTimeout(flushPendingRelayout, 250);
      }, 150);

      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        scrollTopRef.current = scrollEl.scrollTop;
        viewportHeightRef.current = scrollEl.clientHeight;
        updateOffset();
        updateVisibleSet();
      });
    };

    // Initial measurement
    scrollTopRef.current = scrollEl.scrollTop;
    viewportHeightRef.current = scrollEl.clientHeight;
    updateOffset();

    scrollEl.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => {
        viewportHeightRef.current = scrollEl.clientHeight;
        updateOffset();
        updateVisibleSet();
      });
      ro.observe(scrollEl);
    }

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      ro?.disconnect();
    };
  }, [scrollParentRef, updateVisibleSet]);

  // ── Container width tracking ─────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    const updateWidth = () => {
      const width = el.clientWidth;
      if (width !== containerWidth) setContainerWidth(width);
    };

    updateWidth();

    let ro: ResizeObserver | null = null;
    const win = window as Window;

    if ('ResizeObserver' in win) {
      ro = new ResizeObserver(updateWidth);
      ro.observe(el);
    } else {
      win.addEventListener('resize', updateWidth);
    }

    return () => {
      if (ro) {
        ro.disconnect();
      } else {
        win.removeEventListener('resize', updateWidth);
      }
    };
  }, [containerWidth]);

  // ── Item height observation (single shared ResizeObserver) ───────────
  const lastHeightsRef = useRef<Map<HTMLElement, number>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  const observedSetRef = useRef(new Set<HTMLElement>());

  // Create the shared observer once
  useEffect(() => {
    if (typeof window === 'undefined' || !('ResizeObserver' in window)) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    observerRef.current = new ResizeObserver((entries) => {
      let heightChanged = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (!el.isConnected) continue;
        const newHeight = el.offsetHeight;
        const prevHeight = lastHeightsRef.current.get(el);
        if (prevHeight === undefined || Math.abs(newHeight - prevHeight) > 2) {
          lastHeightsRef.current.set(el, newHeight);
          heightChanged = true;
        }
      }
      if (!heightChanged) return;

      // Defer relayout while scrolling + settling — flush once heights stabilize
      if (suppressRelayoutRef.current) {
        pendingRelayoutRef.current = true;
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setLayoutVersion((v) => v + 1);
      }, 50);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedSetRef.current.clear();
    };
  }, []);

  // Reconcile observed elements after each render
  useEffect(() => {
    const ro = observerRef.current;
    if (!ro) return;

    const currentMounted = new Set<HTMLElement>();
    for (const el of itemRefs.current) {
      if (el) currentMounted.add(el);
    }

    // Unobserve elements no longer mounted
    for (const el of observedSetRef.current) {
      if (!currentMounted.has(el)) {
        ro.unobserve(el);
      }
    }

    // Observe newly mounted elements
    for (const el of currentMounted) {
      if (!observedSetRef.current.has(el)) {
        ro.observe(el);
        lastHeightsRef.current.set(el, el.offsetHeight);
      }
    }

    observedSetRef.current = currentMounted;
  });

  // ── Column calculations ──────────────────────────────────────────────
  const cols = useMemo(() => {
    if (!containerWidth) return 1;
    return Math.max(
      1,
      Math.floor((containerWidth + columnGap) / (minColumnWidth + columnGap))
    );
  }, [containerWidth, columnGap, minColumnWidth]);

  const colWidth = useMemo(() => {
    if (!containerWidth) return 0;
    return cols > 1
      ? (containerWidth - columnGap * (cols - 1)) / cols
      : containerWidth;
  }, [containerWidth, columnGap, cols]);

  useLayoutEffect(() => {
    if (colWidth !== columnWidth) {
      setColumnWidth(colWidth);
    }
  }, [colWidth, columnWidth]);

  // ── Compute positions with true tetris-like 2D bin packing ───────────
  // Items can fill ANY available gap, not just column bottoms
  useLayoutEffect(() => {
    if (!containerWidth || items.length === 0 || !columnWidth) {
      setPositions([]);
      setContainerHeight(0);
      return;
    }

    const nextPositions: { top: number; left: number; height: number }[] = [];
    const occupiedRects: { top: number; left: number; bottom: number; right: number }[] = [];

    // Helper: Check if a position would overlap with existing items
    // Note: Items that exactly touch (adjacent) should NOT be considered overlapping
    const wouldOverlap = (top: number, left: number, height: number, width: number): boolean => {
      const bottom = top + height;
      const right = left + width;

      return occupiedRects.some(rect => {
        // Use < instead of <= to allow adjacent (touching) items
        // Subtract 1 to account for pixel rounding and allow exact adjacency
        const horizontalOverlap = left < rect.right - 1 && right > rect.left + 1;
        const verticalOverlap = top < rect.bottom - 1 && bottom > rect.top + 1;
        return horizontalOverlap && verticalOverlap;
      });
    };

    // Helper: Find the highest available position for an item
    const findBestPosition = (itemHeight: number): { top: number; left: number } => {
      const itemWidth = colWidth;

      // Collect all possible "landing" Y positions (0, and bottom of each existing item)
      const landingYs = new Set<number>([0]);
      occupiedRects.forEach(rect => {
        landingYs.add(rect.bottom);
      });
      const sortedYs = Array.from(landingYs).sort((a, b) => a - b);

      // Try each landing position from top to bottom
      for (const top of sortedYs) {
        // Try each column position
        for (let colIdx = 0; colIdx < cols; colIdx++) {
          const left = colIdx * (colWidth + columnGap);

          // Check overlap WITHOUT including gaps (gaps are already in occupied rects)
          if (!wouldOverlap(top, left, itemHeight, itemWidth)) {
            return { top, left };
          }
        }
      }

      // Fallback: place at bottom of shortest column
      const colHeights = new Array(cols).fill(0);
      occupiedRects.forEach(rect => {
        const colIdx = Math.floor(rect.left / (colWidth + columnGap));
        if (colIdx >= 0 && colIdx < cols) {
          colHeights[colIdx] = Math.max(colHeights[colIdx], rect.bottom);
        }
      });

      let minHeight = colHeights[0];
      let minCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < minHeight) {
          minHeight = colHeights[c];
          minCol = c;
        }
      }

      return { top: minHeight, left: minCol * (colWidth + columnGap) };
    };

    let anyMeasured = false;

    // Place each item
    items.forEach((_, index) => {
      const el = itemRefs.current[index];
      // Use DOM height for mounted items, fall back to last measured height for virtualized placeholders
      const height = el
        ? el.offsetHeight
        : (measuredHeightsRef.current.get(index) ?? 0);

      // Store measured height for future virtualized layout passes
      if (el && height > 0) {
        measuredHeightsRef.current.set(index, height);
        anyMeasured = true;
      }

      if (height === 0) {
        nextPositions[index] = { top: 0, left: 0, height: 0 };
        return;
      }

      const { top, left } = findBestPosition(height);

      nextPositions[index] = { top, left, height };

      // Mark this space as occupied
      occupiedRects.push({
        top,
        left,
        bottom: top + height + rowGap,
        right: left + colWidth + columnGap,
      });
    });

    setPositions(nextPositions);

    // Calculate total height
    const maxBottom = occupiedRects.length > 0
      ? Math.max(...occupiedRects.map(r => r.bottom)) - rowGap
      : 0;
    setContainerHeight(maxBottom);

    // Enable virtualization after first successful measurement pass
    // (hasInitialLayout intentionally read but not in deps — only transitions false→true once)
    if (!hasInitialLayout && anyMeasured) {
      setHasInitialLayout(true);
    }
  }, [items.length, containerWidth, columnGap, rowGap, cols, colWidth, columnWidth, layoutVersion]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        position: 'relative',
        height: containerHeight,
      }}
    >
      {items.map((item, index) => {
        const visible = visibleSet === null || visibleSet.has(index);
        const pos = positions[index];

        if (!visible) {
          // Off-screen with known height — lightweight placeholder
          const h = measuredHeightsRef.current.get(index) ?? pos?.height ?? 0;
          return (
            <div
              key={index}
              className="absolute"
              style={{
                width: columnWidth || '100%',
                height: h,
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
              }}
            />
          );
        }

        return (
          <div
            key={index}
            ref={el => {
              itemRefs.current[index] = el;
            }}
            className="absolute"
            style={{
              width: columnWidth || '100%',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
