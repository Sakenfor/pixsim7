import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

/**
 * Scrolls `scrollRef` to top whenever any value in `deps` changes.
 * Skips the initial mount.
 */
export function useScrollToTopOnChange(
  scrollRef: RefObject<HTMLElement | null>,
  deps: unknown[],
): void {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
