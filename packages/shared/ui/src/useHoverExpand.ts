import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseHoverExpandOptions {
  /** Delay in ms before expanding on hover (prevents accidental triggers) */
  expandDelay?: number;
  /** Delay in ms before collapsing on mouse leave (allows time to reach expanded content) */
  collapseDelay?: number;
}

export interface UseHoverExpandResult {
  isExpanded: boolean;
  isHovering: boolean;
  handlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

/**
 * Shared hook for hover-to-expand behavior with configurable delays.
 *
 * - `expandDelay`: Time to wait before showing expanded content (prevents accidental triggers)
 * - `collapseDelay`: Time to wait before hiding (allows crossing gaps to expanded content)
 *
 * @example
 * ```tsx
 * const { isExpanded, handlers } = useHoverExpand({ expandDelay: 150, collapseDelay: 100 });
 *
 * return (
 *   <div {...handlers}>
 *     <button>Trigger</button>
 *     {isExpanded && <div>Expanded content</div>}
 *   </div>
 * );
 * ```
 */
export function useHoverExpand({
  expandDelay = 150,
  collapseDelay = 100,
}: UseHoverExpandOptions = {}): UseHoverExpandResult {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    };
  }, []);

  // Handle hover state changes
  useEffect(() => {
    if (isHovering) {
      // Cancel any pending collapse
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
      // Start expand timer
      expandTimeoutRef.current = setTimeout(() => setIsExpanded(true), expandDelay);
    } else {
      // Cancel any pending expand
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
        expandTimeoutRef.current = null;
      }
      // Delay collapse to allow moving mouse to expanded content
      collapseTimeoutRef.current = setTimeout(() => setIsExpanded(false), collapseDelay);
    }

    return () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    };
  }, [isHovering, expandDelay, collapseDelay]);

  const onMouseEnter = useCallback(() => setIsHovering(true), []);
  const onMouseLeave = useCallback(() => setIsHovering(false), []);

  return {
    isExpanded,
    isHovering,
    handlers: {
      onMouseEnter,
      onMouseLeave,
    },
  };
}
