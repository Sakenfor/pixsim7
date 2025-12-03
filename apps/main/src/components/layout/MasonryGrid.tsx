import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface MasonryGridProps {
  items: React.ReactNode[];
  columnGap?: number;
  rowGap?: number;
  minColumnWidth?: number;
}

export function MasonryGrid({
  items,
  columnGap = 16,
  rowGap = 16,
  minColumnWidth = 260,
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

  // Track container width via ResizeObserver for responsive layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    const updateWidth = () => {
      const width = el.clientWidth;
      if (width !== containerWidth) setContainerWidth(width);
    };

    updateWidth();

    let ro: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(updateWidth);
      ro.observe(el);
    } else {
      window.addEventListener('resize', updateWidth);
    }

    return () => {
      if (ro) {
        ro.disconnect();
      } else {
        window.removeEventListener('resize', updateWidth);
      }
    };
  }, [containerWidth]);

  // Watch for item height changes (images loading, content wrapping, etc.)
  useEffect(() => {
    if (typeof window === 'undefined' || !('ResizeObserver' in window)) return;

    const observers: ResizeObserver[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleLayout = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Trigger re-layout when any item's height changes
        setLayoutVersion(v => v + 1);
      }, 50); // Debounce by 50ms to avoid excessive re-layouts
    };

    itemRefs.current.forEach((el) => {
      if (!el) return;
      const ro = new ResizeObserver(scheduleLayout);
      ro.observe(el);
      observers.push(ro);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      observers.forEach(ro => ro.disconnect());
    };
  }, [items.length, containerWidth]);

  // Memoize column count calculation
  const cols = useMemo(() => {
    if (!containerWidth) return 1;
    return Math.max(
      1,
      Math.floor((containerWidth + columnGap) / (minColumnWidth + columnGap))
    );
  }, [containerWidth, columnGap, minColumnWidth]);

  // Memoize column width calculation
  const colWidth = useMemo(() => {
    if (!containerWidth) return 0;
    return cols > 1
      ? (containerWidth - columnGap * (cols - 1)) / cols
      : containerWidth;
  }, [containerWidth, columnGap, cols]);

  // Update columnWidth state when colWidth changes
  useLayoutEffect(() => {
    if (colWidth !== columnWidth) {
      setColumnWidth(colWidth);
    }
  }, [colWidth, columnWidth]);

  // Compute positions with true tetris-like 2D bin packing
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

    // Place each item
    items.forEach((_, index) => {
      const el = itemRefs.current[index];
      if (!el) {
        nextPositions[index] = { top: 0, left: 0, height: 0 };
        return;
      }

      const height = el.offsetHeight;
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
      {items.map((item, index) => (
        <div
          key={index}
          ref={el => {
            itemRefs.current[index] = el;
          }}
          className="absolute"
          style={{
            width: columnWidth || '100%',
            top: positions[index]?.top ?? 0,
            left: positions[index]?.left ?? 0,
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
