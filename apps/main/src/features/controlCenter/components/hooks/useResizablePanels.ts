/**
 * useResizablePanels Hook
 *
 * Manages resizable panel columns with draggable dividers.
 * Based on the same pattern as useDockBehavior.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export interface PanelConfig {
  id: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth: number;
}

interface UseResizablePanelsOptions {
  panels: PanelConfig[];
  /** Storage key for persisting widths */
  storageKey?: string;
  /** Container ref for calculating relative widths */
  containerRef: React.RefObject<HTMLElement>;
}

interface UseResizablePanelsReturn {
  /** Current widths for each panel (in pixels) */
  widths: number[];
  /** Whether currently dragging a divider */
  dragging: boolean;
  /** Which divider index is being dragged (-1 if none) */
  draggingIndex: number;
  /** Start resize handler for a specific divider */
  startResize: (dividerIndex: number) => (e: React.MouseEvent) => void;
  /** Reset to default widths */
  resetWidths: () => void;
}

export function useResizablePanels({
  panels,
  storageKey,
  containerRef,
}: UseResizablePanelsOptions): UseResizablePanelsReturn {
  // Initialize widths from storage or defaults
  const getInitialWidths = useCallback(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === panels.length) {
            return parsed;
          }
        }
      } catch {}
    }
    return panels.map((p) => p.defaultWidth);
  }, [panels, storageKey]);

  const [widths, setWidths] = useState<number[]>(getInitialWidths);
  const [dragging, setDragging] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState(-1);

  // Keep refs for event handlers
  const widthsRef = useRef(widths);
  const panelsRef = useRef(panels);

  useEffect(() => {
    widthsRef.current = widths;
    panelsRef.current = panels;
  }, [widths, panels]);

  // Save to storage when widths change
  useEffect(() => {
    if (storageKey && !dragging) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(widths));
      } catch {}
    }
  }, [widths, storageKey, dragging]);

  // Clamp width to panel's min/max
  const clampWidth = useCallback((index: number, width: number) => {
    const panel = panelsRef.current[index];
    if (!panel) return width;

    let clamped = width;
    if (panel.minWidth !== undefined) {
      clamped = Math.max(panel.minWidth, clamped);
    }
    if (panel.maxWidth !== undefined) {
      clamped = Math.min(panel.maxWidth, clamped);
    }
    return clamped;
  }, []);

  // Start resize for a specific divider (between panel[index] and panel[index+1])
  const startResize = useCallback(
    (dividerIndex: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      setDraggingIndex(dividerIndex);

      const startX = e.clientX;
      const startWidths = [...widthsRef.current];

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;

        // Adjust the panel to the left of the divider
        const leftIndex = dividerIndex;
        const rightIndex = dividerIndex + 1;

        if (rightIndex >= panelsRef.current.length) return;

        // Calculate new widths
        let newLeftWidth = clampWidth(leftIndex, startWidths[leftIndex] + dx);
        let newRightWidth = clampWidth(rightIndex, startWidths[rightIndex] - dx);

        // Ensure we don't exceed total width
        const totalBefore = startWidths[leftIndex] + startWidths[rightIndex];
        const totalAfter = newLeftWidth + newRightWidth;

        if (totalAfter !== totalBefore) {
          // Adjust to maintain total
          const diff = totalAfter - totalBefore;
          if (dx > 0) {
            newRightWidth = Math.max(panelsRef.current[rightIndex]?.minWidth ?? 50, newRightWidth - diff);
          } else {
            newLeftWidth = Math.max(panelsRef.current[leftIndex]?.minWidth ?? 50, newLeftWidth - diff);
          }
        }

        setWidths((prev) => {
          const next = [...prev];
          next[leftIndex] = newLeftWidth;
          next[rightIndex] = newRightWidth;
          return next;
        });
      };

      const onUp = () => {
        setDragging(false);
        setDraggingIndex(-1);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [clampWidth]
  );

  const resetWidths = useCallback(() => {
    setWidths(panels.map((p) => p.defaultWidth));
  }, [panels]);

  return {
    widths,
    dragging,
    draggingIndex,
    startResize,
    resetWidths,
  };
}
