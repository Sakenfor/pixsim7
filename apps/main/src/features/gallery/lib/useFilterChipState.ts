import { useCallback, useRef, useState } from 'react';

export interface UseFilterChipStateResult {
  openFilters: Set<string>;
  hoveredKey: string | null;
  /** True when the chip is explicitly open OR hovered. */
  isVisible: (key: string) => boolean;
  openHover: (key: string) => void;
  closeHover: (key: string) => void;
  toggleOpen: (key: string) => void;
  closeChip: (key: string) => void;
}

export function useFilterChipState(opts?: {
  collapseDelay?: number;
}): UseFilterChipStateResult {
  const collapseDelay = opts?.collapseDelay ?? 120;
  const [openFilters, setOpenFilters] = useState<Set<string>>(new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const isVisible = useCallback(
    (key: string) => openFilters.has(key) || hoveredKey === key,
    [openFilters, hoveredKey],
  );

  const openHover = useCallback((key: string) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredKey(key);
  }, []);

  const closeHover = useCallback(
    (key: string) => {
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredKey((prev) => (prev === key ? null : prev));
      }, collapseDelay);
    },
    [collapseDelay],
  );

  const toggleOpen = useCallback((key: string) => {
    setOpenFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const closeChip = useCallback((key: string) => {
    setOpenFilters((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setHoveredKey((prev) => (prev === key ? null : prev));
  }, []);

  return {
    openFilters,
    hoveredKey,
    isVisible,
    openHover,
    closeHover,
    toggleOpen,
    closeChip,
  };
}
