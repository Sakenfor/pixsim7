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
  // Detect if user prefers reduced motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fallback to simple grid for reduced motion or unsupported browsers
  if (prefersReducedMotion) {
    return (
      <div
        className="grid gap-4 md:grid-cols-3 lg:grid-cols-4"
        style={{
          gap: `${rowGap}px ${columnGap}px`,
        }}
      >
        {items.map((item, index) => (
          <div key={index}>{item}</div>
        ))}
      </div>
    );
  }

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

  // Compute positions once we know container width and item heights
  // Includes columnWidth and layoutVersion to remeasure after width or item height changes
  useLayoutEffect(() => {
    if (!containerWidth || items.length === 0 || !columnWidth) {
      setPositions([]);
      setContainerHeight(0);
      return;
    }

    const colHeights = new Array(cols).fill(0);
    const nextPositions: { top: number; left: number; height: number }[] = [];

    items.forEach((_, index) => {
      const el = itemRefs.current[index];
      if (!el) {
        nextPositions[index] = { top: 0, left: 0, height: 0 };
        return;
      }
      const height = el.offsetHeight;

      // Find shortest column (shortest-column / tetris algorithm)
      let colIndex = 0;
      let minHeight = colHeights[0];
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < minHeight) {
          minHeight = colHeights[c];
          colIndex = c;
        }
      }

      const top = colHeights[colIndex];
      const left = colIndex * (colWidth + columnGap);

      nextPositions[index] = { top, left, height };
      colHeights[colIndex] = top + height + rowGap;
    });

    setPositions(nextPositions);
    setContainerHeight(
      colHeights.length ? Math.max(...colHeights) - rowGap : 0
    );
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
