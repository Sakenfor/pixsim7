import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Circuit breaker for the stale-height relayout feedback loop. Normal layout
// converges in 1-3 passes; a relayout *storm* (a burst of asset-update events
// changing card heights faster than layout settles) can otherwise bump
// layoutVersion every commit and trip React's "Maximum update depth". Cap the
// consecutive bumps per (item-count × width) signature — well above normal
// convergence — and settle once after the burst subsides.
const MAX_CONSECUTIVE_RELAYOUTS = 12;
const RELAYOUT_SETTLE_MS = 200;

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
  /**
   * Placement strategy:
   * - 'masonry' (default): shortest-column fill — staggered, variable-height columns.
   * - 'grid': aligned rows — item i sits in column `i % cols`; each row is as
   *   tall as its tallest card (CSS-grid auto-rows semantics). Use this to
   *   virtualize an otherwise-plain CSS grid while keeping the aligned look.
   * Both modes share the same measured-height windowing + scroll anchoring.
   */
  mode?: 'masonry' | 'grid';
}

export function MasonryGrid({
  items,
  columnGap = 16,
  rowGap = 16,
  minColumnWidth = 260,
  scrollParentRef,
  overscan = 300,
  mode = 'masonry',
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
  // After relayout, anchor the scroll position so items near the viewport
  // don't appear to jump when cards above change height.
  const pendingScrollDeltaRef = useRef(0);

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

    const onScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        scrollTopRef.current = scrollEl.scrollTop;
        viewportHeightRef.current = scrollEl.clientHeight;
        updateOffset();
        updateVisibleSet();
        // A real scroll exposes legitimately-new cards — give relayout a fresh
        // budget so windowing stays accurate during long scrolls.
        relayoutStormRef.current.count = 0;
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

  // Relayout-storm circuit breaker (see MAX_CONSECUTIVE_RELAYOUTS).
  const relayoutStormRef = useRef<{ sig: string; count: number }>({ sig: '', count: 0 });
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

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

    // Observe newly mounted elements. When a card re-mounts after being
    // virtualized, its height may no longer match what the layout last recorded
    // in measuredHeightsRef (e.g. its footer/widgets changed while off-screen).
    // The ResizeObserver baseline we set here would mask that as "no change", so
    // nothing else would trigger a relayout and the stale position persists
    // (the occasional overlap / gap). Detect the divergence and bump layout.
    let staleHeight = false;
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i];
      if (!el || observedSetRef.current.has(el)) continue;
      ro.observe(el);
      lastHeightsRef.current.set(el, el.offsetHeight);
      const cached = measuredHeightsRef.current.get(i);
      const measured = Math.ceil(el.getBoundingClientRect().height);
      if (cached !== undefined && measured > 0 && Math.abs(measured - cached) > 2) {
        staleHeight = true;
      }
    }

    observedSetRef.current = currentMounted;

    if (staleHeight) {
      // Circuit breaker: cap consecutive stale-height relayouts so an
      // asset-update storm can't drive an unbounded synchronous render loop.
      const sig = `${items.length}x${containerWidth}`;
      const storm = relayoutStormRef.current;
      if (storm.sig !== sig) {
        storm.sig = sig;
        storm.count = 0;
      }
      if (storm.count < MAX_CONSECUTIVE_RELAYOUTS) {
        storm.count += 1;
        setLayoutVersion((v) => v + 1);
      } else if (settleTimerRef.current == null) {
        // Cap hit — defer one relayout so positions still settle once the burst
        // subsides, instead of re-entering the synchronous loop now.
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          relayoutStormRef.current.count = 0;
          setLayoutVersion((v) => v + 1);
        }, RELAYOUT_SETTLE_MS);
      }
    }
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

  // ── Compute positions: shortest-column fill ───────────────────────────
  // All items are single-column width, so place each item in whichever
  // column currently has the smallest bottom — O(N×C) instead of the
  // previous O(N²×C) tetris-style rectangle overlap scanning.
  useLayoutEffect(() => {
    if (!containerWidth || items.length === 0 || !columnWidth) {
      setPositions([]);
      setContainerHeight(0);
      return;
    }

    const nextPositions: { top: number; left: number; height: number }[] = [];

    let anyMeasured = false;

    // Per-item height resolver shared by both modes: DOM height for mounted
    // items, last measured height for virtualized placeholders. Measure with
    // sub-pixel precision and round UP: `offsetHeight` rounds to the nearest
    // integer, so an aspect-ratio card with a fractional height can round down,
    // placing the next card slightly too high (a few px of overlap, worst on
    // tall portraits). `Math.ceil(getBoundingClientRect().height)` errs toward a
    // sub-pixel gap instead.
    const heightAt = (index: number): number => {
      const el = itemRefs.current[index];
      const height = el
        ? Math.ceil(el.getBoundingClientRect().height)
        : (measuredHeightsRef.current.get(index) ?? 0);
      if (el && height > 0) {
        measuredHeightsRef.current.set(index, height);
        anyMeasured = true;
      }
      return height;
    };

    let maxBottom = 0;

    if (mode === 'grid') {
      // Aligned rows: item i sits in column `i % cols`; each row starts below
      // the tallest card of the previous row (CSS-grid auto-rows semantics).
      let rowTop = 0;
      for (let rowStart = 0; rowStart < items.length; rowStart += cols) {
        const rowEnd = Math.min(rowStart + cols, items.length);
        const heights: number[] = [];
        let rowMaxH = 0;
        for (let index = rowStart; index < rowEnd; index++) {
          const h = heightAt(index);
          heights[index - rowStart] = h;
          if (h > rowMaxH) rowMaxH = h;
        }
        for (let index = rowStart; index < rowEnd; index++) {
          const c = index - rowStart;
          const height = heights[c];
          if (height === 0) {
            nextPositions[index] = { top: 0, left: 0, height: 0 };
            continue;
          }
          nextPositions[index] = {
            top: rowTop,
            left: c * (colWidth + columnGap),
            height,
          };
        }
        if (rowMaxH > 0) rowTop += rowMaxH + rowGap;
      }
      maxBottom = rowTop > 0 ? rowTop - rowGap : 0;
    } else {
      const colBottoms = new Array<number>(cols).fill(0);

      items.forEach((_, index) => {
        const height = heightAt(index);

        if (height === 0) {
          nextPositions[index] = { top: 0, left: 0, height: 0 };
          return;
        }

        // Find shortest column
        let minCol = 0;
        for (let c = 1; c < cols; c++) {
          if (colBottoms[c] < colBottoms[minCol]) minCol = c;
        }

        const top = colBottoms[minCol];
        const left = minCol * (colWidth + columnGap);
        nextPositions[index] = { top, left, height };
        colBottoms[minCol] = top + height + rowGap;
      });

      maxBottom = colBottoms.length > 0 ? Math.max(...colBottoms) - rowGap : 0;
    }

    // ── Scroll anchoring ─────────────────────────────────────────────────
    // Find the item closest to the viewport top and record how much it
    // shifted so we can compensate scrollTop after React commits.
    pendingScrollDeltaRef.current = 0;
    if (scrollParentRef?.current && positions.length > 0 && positions.length === nextPositions.length) {
      const scrollTop = scrollTopRef.current;
      const offset = containerOffsetRef.current;

      let anchorIndex = -1;
      let bestDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        if (!p || p.height === 0) continue;
        const absTop = offset + p.top;
        // Only consider items near or below the viewport top
        if (absTop < scrollTop - 200) continue;
        const dist = Math.abs(absTop - scrollTop);
        if (dist < bestDist) {
          bestDist = dist;
          anchorIndex = i;
        }
      }

      if (anchorIndex >= 0 && nextPositions[anchorIndex]) {
        pendingScrollDeltaRef.current =
          nextPositions[anchorIndex].top - positions[anchorIndex].top;
      }
    }

    setPositions(nextPositions);

    setContainerHeight(Math.max(0, maxBottom));

    // Enable virtualization after first successful measurement pass
    // (hasInitialLayout intentionally read but not in deps — only transitions false→true once)
    if (!hasInitialLayout && anyMeasured) {
      setHasInitialLayout(true);
    }
  }, [items.length, containerWidth, columnGap, rowGap, cols, colWidth, columnWidth, layoutVersion, mode]);

  // ── Apply scroll anchor adjustment after positions commit ─────────────
  // Runs in useLayoutEffect (before paint) so the user never sees the jump.
  useLayoutEffect(() => {
    const delta = pendingScrollDeltaRef.current;
    if (Math.abs(delta) > 1 && scrollParentRef?.current) {
      scrollParentRef.current.scrollTop += delta;
      scrollTopRef.current = scrollParentRef.current.scrollTop;
    }
    pendingScrollDeltaRef.current = 0;
  }, [positions, scrollParentRef]);

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
        // Use the child element's key when available so React tracks items by
        // identity rather than index. Without this, prepending an item causes
        // React to recycle the DOM node at index 0 (briefly showing the old
        // asset's thumbnail before the new props propagate).
        const childKey = React.isValidElement(item) ? item.key : null;
        const stableKey = childKey != null ? childKey : index;

        const visible = visibleSet === null || visibleSet.has(index);
        const pos = positions[index];

        // Items without a calculated position must not render at (0,0) —
        // that would overlap the real top-left card. Hide until the
        // useLayoutEffect computes their actual position.
        const hasPosition = pos !== undefined && (pos.top !== 0 || pos.left !== 0 || index === 0);

        if (!visible) {
          // Off-screen with known height — lightweight placeholder
          const h = measuredHeightsRef.current.get(index) ?? pos?.height ?? 0;
          return (
            <div
              key={stableKey}
              className="absolute"
              style={{
                width: columnWidth || '100%',
                height: h,
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                visibility: hasPosition ? undefined : 'hidden',
              }}
            />
          );
        }

        return (
          <div
            key={stableKey}
            ref={el => {
              itemRefs.current[index] = el;
            }}
            className="absolute"
            style={{
              width: columnWidth || '100%',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: hasPosition ? undefined : 'hidden',
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
