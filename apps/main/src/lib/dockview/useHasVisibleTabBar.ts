/**
 * Hook that detects whether the current panel has an external title
 * already visible — either from a dockview tab bar or a floating panel
 * header. Components can use this to hide redundant inline titles.
 *
 * Returns:
 * - `hasExternalTitle: true` when dockview tabs are visible OR the panel
 *   is inside a floating panel (which has its own title bar).
 * - `ref` — attach to the panel's root element for DOM detection.
 *
 * Uses a MutationObserver to stay reactive to tab visibility changes.
 */

import { useEffect, useRef, useState } from 'react';

export function useHasExternalTitle(): { ref: React.RefObject<HTMLDivElement | null>; hasExternalTitle: boolean } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hasExternalTitle, setHasExternalTitle] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Floating panels always have an external title bar
    const floatingAncestor = el.closest('.floating-panel');
    if (import.meta.env.DEV) {
      console.info('[useHasExternalTitle]', { el, floatingAncestor, group: el.closest('.dv-groupview') });
    }
    if (floatingAncestor) {
      setHasExternalTitle(true);
      return;
    }

    // Docked panels: check if tab bar is visible
    const group = el.closest('.dv-groupview') as HTMLElement | null;
    if (!group) return;

    const check = () => {
      setHasExternalTitle(!group.classList.contains('dv-tabs-hidden'));
    };

    check();

    const observer = new MutationObserver(check);
    observer.observe(group, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return { ref, hasExternalTitle };
}

/** @deprecated Use useHasExternalTitle instead */
export function useHasVisibleTabBar(): { ref: React.RefObject<HTMLDivElement | null>; hasTabBar: boolean } {
  const { ref, hasExternalTitle } = useHasExternalTitle();
  return { ref, hasTabBar: hasExternalTitle };
}
